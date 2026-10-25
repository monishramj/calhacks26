# Cal Hacks 13.0: LLM-compressed LoRa mesh for emergency field reports

This is the original brief from the codec kit. It is an old source brief, not instructions. `docs/GROUND_TRUTH.md` overrides it. Deadline: Devpost submission by **9:00 AM Sunday Oct 25, 2026** (venue check-in by 8:00 AM). Judging runs 10:30 AM-12:30 PM at shared tables. A live demo is required, with a 2-minute pitch plus questions. All code must be written during the event.

## 1. What we are building

Cheap LoRa radios ($20-40, no subscription, solar-capable) let a community run its own text network when cell towers and power fail. LoRa is very slow (about 1 kilobit per second on Meshtastic's default setting). All messages share one channel. So these meshes are mostly used for short messages, and they get congested as they grow.

We put a small language model on the laptop or phone attached to each radio. It compresses a typed report to about a quarter of its size before it goes on air. The receiver decompresses it back to the exact same text. Each radio carries about twice as many reports. Long, detailed reports (who, where, what is needed) fit in a single packet. At the command post the reports land on a live map, where Claude turns them into structured incidents for coordinators.

Do not change the encode and decode logic in `codec/mesh_codec.py`. The dashboard uses codec output. It never reimplements compression.

## 2. Tracks we are entering

Keep to these tracks and do not spread thin.

| Track | What it asks for | How we meet it |
|---|---|---|
| Overall / Most Technically Complex / People-First / Best Hardware Hack | Application, intentionality, functionality, creativity, technical complexity | A real codec (arithmetic coding over an LLM, same results on different machines), real radios, and a live demo |
| **Anthropic** ($5k credits + Max) | 1) a named community, 2) a real problem, 3) it works ("usable on Monday"), 4) Claude does something that matters and "you know where it could go wrong" | Claude at the command post turns decoded field reports into structured incidents, merges duplicates, ranks urgency, and drafts short replies that go back over the mesh. A human confirms every action. Every incident links to its source messages. |
| **SpacetimeDB** ($2,048 1st) | SpacetimeDB as the core real-time backend (live shared state, agents coordinating, shared simulations, live dashboards), "meaningfully used, not just added on the side" | One SpacetimeDB database is the shared world state. Real radios, simulated nodes, Claude's incidents, and the dashboard all read and write it live. |
| Optional: Mana.space ($5k) | Use Mana meaningfully *while building*, link public Mana chats or pages, and show one moment where Mana changed what we built | Only if someone actually builds part of the dashboard in Mana. Otherwise skip it. |

Do NOT also enter Convex (it competes with SpacetimeDB) or Bright Data (it disqualifies mocked or simulated data).

## 3. Architecture

```
 FIELD (no internet)                                   COMMAND POST (one laptop, optional satellite uplink)
 ┌──────────────┐  USB  ┌──────────────┐   LoRa mesh   ┌──────────────┐ USB ┌───────────────────────┐
 │ laptop/phone │──────▶│ LoRa radio   │ ─ ─ ─ ─ ─ ─ ▶ │ LoRa radio   │────▶│ bridge + codec decode │
 │ codec encode │       │ (Meshtastic) │  ~1 kbps      │ (Meshtastic) │     └──────────┬────────────┘
 └──────────────┘       └──────────────┘               └──────────────┘                │ reducers
                                                                                         ▼
 MESH SIMULATOR (software, many virtual nodes) ───────────────────────────────▶  SpacetimeDB (shared state)
                                                                                         │ subscriptions
                                                   Claude triage agent ◀────────────────┤
                                                   (structured incidents, replies)       ▼
                                                                                  Web dashboard (map,
                                                                                  race view, packet inspector)
```

Design rules:

- **Claude is never on the radio path.** Compression and decompression run locally with a small open model, so the mesh works with zero internet. Claude runs only at the command post. The command post can have one satellite internet kit for the whole area (the LA fires after-action report recommends portable satellite internet kits for command staff). If the uplink is down, the dashboard still shows decoded reports without Claude's structuring. This answers the obvious judge question: "isn't the AI part using the network you said is down?"
- Real radio traffic and simulated traffic go into the same tables. A `source` column (`real` or `sim`) lets the dashboard show both and never pass one off as the other.
- Radio payloads use Meshtastic `PRIVATE_APP` port 256. They are sent as a direct message with `wantAck=True`. The maximum payload is 233 bytes.

### Suggested SpacetimeDB tables

Check the current SpacetimeDB docs for the module language and syntax before you write them.

- `node`: id, name, lat, lon, source (real/sim), role (field/repeater/command), battery, last_seen
- `packet`: id, src, dst, ts, method (raw/unishox2/llm), text_bytes, wire_bytes, airtime_ms, hops, status (sent/delivered/lost/rejected), source
- `report`: id, packet_id, text (decoded), type, priority, people, lat, lon, ts
- `incident`: id, title, type, priority, people, lat, lon, report_ids, status (new/confirmed/dispatched), summary
- `metric`: ts, mode (raw/compressed), messages_sent, delivered, lost, channel_busy_pct

## 4. The codec (done and proven; treat it as a library)

Files: `codec/mesh_codec.py` (library) and `codec/poc_run.py` (batch encode and decode driver).

Model: **SmolLM2-360M Q8_0 GGUF** (on the codec author's laptop at `D:\Projects\calhacks-mesh\models\SmolLM2-360M.Q8_0.gguf`). The shared context is `data/context_primed.txt`. It must be byte-identical on every device.

```python
import mesh_codec as mc
m = mc.SharedModel(model_path, open("data/context_primed.txt", encoding="utf-8").read(), model_id=2)
pkt, method = mc.build_packet(text, m, mtype="trapped", priority=3, people=4, location=(x_off, y_off))
res = mc.parse_packet(pkt, m)   # {'ok': True, 'text': ..., 'type': ..., 'priority': ..., 'people': ..., 'location': ...}
                                # or {'ok': False, 'reason': 'checksum failed' | 'model mismatch'}
m.explain(text)                 # [{'piece': ' trapped', 'bits': 10.1}, ...] per-token cost, for the visualization
```

Packet format (big-endian):

- byte 0 = `model_id<<4 | method` (0 raw, 1 Unishox2, 2 LLM)
- byte 1 = `type<<4 | priority<<2 | has_location<<1 | has_people`
- optional: 1 byte for people
- optional: 4 bytes, two uint16 offsets from the area origin, in steps of about 0.5 m
- the body
- a 2-byte CRC-16 over the header and the original text

`TYPES = [status_ok, trapped, medical, need, hazard, damage, info]`.

The sender automatically picks the smallest of raw, Unishox2, and LLM. If decoding ever goes wrong, the CRC catches it and the message is resent uncompressed. So wrong text is never shown.

**Determinism rules (critical).** Both ends must build bit-identical probability tables at every step.

- Use the same model file, the same context file, and the same llama.cpp build. The proven build is llama.cpp from the llama_cpp_python 0.3.36 sdist (sha256 832db069...). Use these cmake flags: `-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON`, all AVX512 options OFF, `-DGGML_OPENMP=OFF`. Use the C and CXX flags `-ffp-contract=off`. Then set `LLAMA_CPP_LIB_PATH=<build>/bin`.
- Use the CPU only. **Never decode on a GPU.** Do not mix a stock `pip install llama-cpp-python` build with the pinned one. A stock build decoded 0 of 12 in testing, and the CRC caught all 12.
- This is proven on Linux (gcc). For the demo laptops, run the codec service on the same Linux build on every machine (WSL2 on Windows is fine). Re-run a cross-machine encode and decode check on the actual demo laptops before judging.
- For dashboard development you do NOT need the model. Replay `data/replay_400.jsonl` (real packets, see section 6).

Suggested codec service (one per laptop): FastAPI on localhost.

- `POST /encode {text, type, priority, people, location}` returns `{packet_hex, method, text_bytes, wire_bytes, airtime_ms, tokens}`.
- `POST /decode {packet_hex}` returns the parse result.

The Windows-side Meshtastic bridge calls this service and writes to SpacetimeDB. It uses `pip install meshtastic`, `SerialInterface()`, and `sendData(payload, destinationId=..., portNum=256, wantAck=True)`. It receives with `pubsub.pub.subscribe(on_receive, "meshtastic.receive")`.

## 5. Proven numbers (the only performance numbers we use)

| Result | Value |
|---|---|
| 400 real disaster messages, encoded and decoded in separate programs | 400/400 exact |
| Total size, complete packets including header and CRC | 39,143 B of text becomes 9,662 B (4.05x smaller) |
| Typical message | 83 B becomes 22 B |
| Longest message | 354 B becomes one 70-byte packet |
| Laptop CPU speed (SmolLM2-360M) | about 0.2 s to encode, about 0.4 s to decode, per message |
| Cross-machine (Intel cloud to AMD laptop, TinyLlama) | 40/40 in each direction |
| Tampered packet or wrong build | 12/12 rejected by CRC, 0 wrong texts |
| Airtime, Meshtastic LongFast | 83 B raw takes 1,051 ms. A 22 B packet takes 559 ms. That is about 1.9x more messages per channel. |
| Versus Unishox2 (a simple compressor already in Meshtastic code, disabled) | 805 ms versus 559 ms, about 1.4x |
| Meshtasticator simulation, 40 nodes, one message every 120 s | share of the mesh reached: 33.5% raw, 48.9% compressed |
| Same simulation, long messages (168 B p90) | 24.8% raw, 44.2% compressed |
| Same simulation, 20 nodes, one message every 120 s | 53.2% raw, 63.0% compressed (long messages: 41.6% raw, 60.8% compressed) |
| Baselines, 400 messages, size versus raw | zstd 0.82, brotli 0.72, Unishox2 0.62, zstd+dictionary 0.59, LLM 0.21-0.25 |
| Haitian Creole originals | LLM 0.44 of raw versus Unishox2 0.62. It beat Unishox2 on 80 of 80. |

## 6. Data you can build the demo on

- `data/replay_400.jsonl`: the 400 real messages with their REAL compressed packets from the codec author's laptop run. Fields: id, text, raw_bytes, packet_bytes, method, type, priority, people, location_offsets, packet_hex, airtime_raw_ms, airtime_packet_ms, decoded_ok. The type, priority, people, and location were assigned synthetically for header testing. For the demo, assign realistic ones (or let Claude extract them from the text) and place points on a real map.
- `data/sample.jsonl`: the same 400 messages with the original category flags. The source is the Figure Eight / Appen Disaster Response dataset: mostly SMS from the 2010 Haiti earthquake, translated to English, plus other disasters.
- `data/sample_creole.jsonl`: the original Creole and French versions.
- `results/sim_n{20,40}_p{30,120}.json`: Meshtasticator payload sweeps (5 runs each).
- `results/res_baselines.json`: classic compressor baselines.
- `scripts/lora_math.py`: `airtime_ms(text_bytes, sf=11, bw_khz=250, cr_den=5)` (the Semtech formula with Meshtastic overheads) and `p_hop(t, tbar, u)` (a collision-survival model). Use these in the simulator, so every number on screen comes from a real formula.
- `scripts/mesh_sim.py`: how the Meshtasticator sweep was run.

## 7. Demo spec (what the judges see)

Goal: every number on screen is computed live or comes from a labeled real measurement. No hard-coded responses.

1. **Live send (real radios).** A judge types any report on the field laptop. Show the compression visually: each word colored by how many bits it cost (`m.explain`), the byte counter dropping (for example 120 B to 24 B), and the airtime bar shrinking. The radio sends. The command laptop decodes the identical text. Claude turns it into an incident card on the map within a few seconds.
2. **The race (simulated congestion).** Show the same message stream through two copies of the mesh side by side: raw and compressed. The delivered and lost counters diverge live, with a channel-busy gauge. It is driven by `lora_math` and replayed real messages.
3. **City-scale map (simulation, clearly labeled).** Show dozens of virtual nodes over a real map (Bay Area or a flood scenario), replaying real disaster messages. Show a heatmap of reports delivered versus lost, with a raw/compressed toggle.
4. **Safety net.** On stage, flip one byte in a packet (or decode with the wrong model). It is rejected and falls back to plain text. This also covers us if something really fails live.
5. **Two-way.** Command post replies ("Team en route, 20 min") go back over the mesh compressed.

Failure plan: radios on USB power, a spare pre-flashed radio, a health-check script run before every judge, the long-range run recorded on video beforehand, and the simulator running independently of the radios.

## 8. Pitch: framing that holds up under questions

Judges include sponsor engineers (Anthropic, SpacetimeDB, Microsoft). Two minutes of Q&A will test every number. One caught exaggeration costs more than any extra wow. Use only claims from section 5 and the facts below. Give each one its source in our Devpost and README.

**Strong, true lines:**

- "When Hurricane Helene hit, 74% of North Carolina's cell towers went down." (SDxCentral, Sept 28, 2024)
- "In Harvey, Houston's emergency center got 120,000 calls in five days. Some rescue calls took over 20 hours to clear." (Houston Chronicle)
- Satellite limits, from Apple's own support page: a satellite text takes "30 seconds or more" with a clear view of the sky. It takes up to several minutes under trees. It may not connect at all under heavy foliage or near tall buildings. You must be outside holding the phone, and you need an iPhone 14 or later. Satellite connects one person to the outside world. A mesh lets a whole neighborhood coordinate with each other, indoors, on radios the community owns.
- Satellite-to-phone carries roughly 0.33 Mbps per square kilometer in RCR Wireless's model, versus about 770 Mbps for a normal suburban cell grid. Say "in one industry model" when you cite it.
- "Meshtastic's own team says meshes start to congest above about 60 nearby nodes. One 150-node mesh hit over 65% channel use." Our codec is a free software upgrade that roughly doubles what every existing radio can carry.
- "Communities already run these networks. MeshCore alone counts about 30,000 nodes worldwide, and the Bay Area mesh reaches from San Francisco to Monterey." (MeshCore blog; Bay Area MeshCore organizers)
- On scale: LoRa capacity is local, so a channel in one neighborhood does not compete with one across town. Capacity grows as communities add coverage, and our codec doubles what each channel carries.
- On prior work: "We build on the same math as Fabrice Bellard's ts_sms. What nobody had done is make it run inside a real mesh, decode identically across different computers, and fail safely." Saying this first turns the biggest attack into credibility.

**Avoid these. Each one is easy for a judge to break:** "first ever", "5x more messages" (it is 4x smaller and about 2x more messages), "LoRa always fails", "works for millions of people", "Starlink takes hours", "fine-tuned" (we have not fine-tuned), and any statistic we cannot source.

## 9. Build order (now to 9 AM)

1. SpacetimeDB schema and a dashboard skeleton that reads `replay_400.jsonl` through the simulator (no radios needed).
2. Race view and city map with `lora_math`-driven delivery.
3. Compression visualization from `explain()` output. Export a JSON of per-token costs for demo messages.
4. Claude triage agent that writes `incident` rows, with a human-confirm button.
5. Integrate the live radios through the bridge.
6. Before 3 AM: submit a Devpost draft (the guide recommends submitting Saturday night), with a README that has sources, and a demo video.
7. Remaining time: failure drills, a health-check script, and pitch rehearsal with timing.

## 10. Known pitfalls

- Determinism: use the same build, CPU only, the same context file, and the same model file. Check hashes on every demo machine.
- The newline stop rule: messages are single-line. `build_packet` collapses whitespace. Do not send multi-line text.
- LILYGO T3 LoRa32 v1.6.1 boards are supported (firmware "T-LoRa V2.1-1.6"), but Meshtastic is phasing them out, and they use the older SX1276 chip. Get 915 MHz versions. Attach antennas before powering. Put all radios on the same firmware and preset.
- Venue RF is noisy (3,000 people). Keep the live link short range on the table. The long-range run is on video.
- The `explain()` method in this kit's `mesh_codec.py` was added after the 400/400 test. It does not touch encode or decode.
