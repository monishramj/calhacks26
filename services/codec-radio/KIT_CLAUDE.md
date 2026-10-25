# Cal Hacks 13.0: LLM-compressed LoRa mesh for emergency field reports

Read this whole file before writing code. It is the shared context for everyone's Claude on this team.
Deadline: Devpost submission by **9:00 AM Sunday Oct 25, 2026** (venue check-in by 8:00 AM). Judging 10:30 AM-12:30 PM
at shared tables; live demo required; 2-minute pitch plus questions. All code must be written during the event.

## 1. What we are building (one paragraph)

Cheap LoRa radios ($20-40, no subscription, solar-capable) let a community run its own text network when cell towers
and power fail. LoRa is very slow (about 1 kilobit per second on Meshtastic's default setting), and every message shares
one channel, so these meshes are mostly used for short messages and get congested as they grow. We put a small
language model on the laptop/phone attached to each radio. It compresses a typed report to about a quarter of its size
before it goes on air, and the receiver decompresses it back to the exact same text. Each radio carries about twice as
many reports, and long, detailed reports (who, where, what is needed) fit in a single packet. At the command post the
reports land on a live map, where Claude turns them into structured incidents for coordinators.

## 2. Team and ownership

- **Sud**: codec, radio bridge, overall architecture (owns `codec/` and the Meshtastic bridge).
- **Anubhav**: software demo: the mesh simulator, data visualization/dashboard, pitch.
- **Rest of team**: hardware (buying and flashing radios), helping wherever needed.
- Do not change `codec/mesh_codec.py` encode/decode logic without Sud. The dashboard consumes codec output; it never
  reimplements compression.

## 3. Tracks we are entering (keep it to these; do not spread thin)

| Track | What it asks for | How we meet it |
|---|---|---|
| Overall / Most Technically Complex / People-First / Best Hardware Hack | Application, intentionality, functionality, creativity, technical complexity | Real codec (arithmetic coding over an LLM, cross-machine determinism) + real radios + live demo |
| **Anthropic** ($5k credits + Max) | 1) a named community, 2) a real problem, 3) it works ("usable on Monday"), 4) Claude does something that matters and "you know where it could go wrong" | Claude at the command post turns decoded field reports into structured incidents, merges duplicates, ranks urgency, drafts short replies that go back over the mesh. Human confirms every action; every incident links to its source messages |
| **SpacetimeDB** ($2,048 1st) | Spacetime as the core real-time backend; live shared state, agents coordinating, shared simulations, live dashboards; "meaningfully used, not just added on the side" | One SpacetimeDB database is the shared world state: real radios, simulated nodes, Claude's incidents and the dashboard all read/write it live |
| Optional: Mana.space ($5k) | Must use Mana meaningfully *while building*, link public Mana chats/pages, show one moment where Mana changed what we built | Only if someone actually builds part of the dashboard in Mana. Otherwise skip |

Do NOT also enter Convex (competes with SpacetimeDB) or Bright Data (disqualifies mocked/simulated data).

## 4. Architecture

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

Key design rules:
- **Claude is never on the radio path.** Compression and decompression run locally with a small open model; the mesh
  works with zero internet. Claude runs only at the command post, which can have one satellite internet kit for the whole
  area (the LA fires after-action report recommends portable satellite internet kits for command staff). If the uplink
  is down, the dashboard still shows decoded reports without Claude's structuring. This answers the obvious judge
  question "isn't the AI part using the network you said is down?"
- Real radio traffic and simulated traffic go into the same tables, with a `source` column (`real` | `sim`) so the
  dashboard can show both and never passes one off as the other.
- Radio payloads use Meshtastic `PRIVATE_APP` port 256, sent as a direct message with `wantAck=True`. Max payload 233 bytes.

### Suggested SpacetimeDB tables (check current SpacetimeDB docs for module language and syntax before writing)

- `node`: id, name, lat, lon, source (real/sim), role (field/repeater/command), battery, last_seen
- `packet`: id, src, dst, ts, method (raw/unishox2/llm), text_bytes, wire_bytes, airtime_ms, hops, status
  (sent/delivered/lost/rejected), source
- `report`: id, packet_id, text (decoded), type, priority, people, lat, lon, ts
- `incident`: id, title, type, priority, people, lat, lon, report_ids, status (new/confirmed/dispatched), summary
- `metric`: ts, mode (raw/compressed), messages_sent, delivered, lost, channel_busy_pct

## 5. The codec (done and proven; treat as a library)

Files: `codec/mesh_codec.py` (library), `codec/poc_run.py` (batch encode/decode driver).
Model: **SmolLM2-360M Q8_0 GGUF** (on Sud's laptop `D:\Projects\calhacks-mesh\models\SmolLM2-360M.Q8_0.gguf`),
shared context `data/context_primed.txt` (must be byte-identical on every device).

```python
import mesh_codec as mc
m = mc.SharedModel(model_path, open("data/context_primed.txt", encoding="utf-8").read(), model_id=2)
pkt, method = mc.build_packet(text, m, mtype="trapped", priority=3, people=4, location=(x_off, y_off))
res = mc.parse_packet(pkt, m)   # {'ok': True, 'text': ..., 'type': ..., 'priority': ..., 'people': ..., 'location': ...}
                                # or {'ok': False, 'reason': 'checksum failed' | 'model mismatch'}
m.explain(text)                 # [{'piece': ' trapped', 'bits': 10.1}, ...] per-token cost, for the visualization
```

Packet format (big-endian): byte0 = model_id<<4 | method (0 raw, 1 Unishox2, 2 LLM); byte1 = type<<4 | priority<<2 |
has_location<<1 | has_people; [1 byte people]; [4 bytes: two uint16 offsets from the area origin, ~0.5 m steps]; body;
2-byte CRC-16 over header + original text. `TYPES = [status_ok, trapped, medical, need, hazard, damage, info]`.
The sender automatically picks the smallest of raw / Unishox2 / LLM. If decoding ever goes wrong, the CRC catches it and
the message is resent uncompressed, so wrong text is never shown.

**Determinism rules (critical).** Both ends must build bit-identical probability tables at every step:
- Same model file, same context file, same llama.cpp build. Proven build: llama.cpp from llama_cpp_python 0.3.36 sdist
  (sha256 832db069...), cmake flags `-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON`,
  all AVX512 options OFF, `-DGGML_OPENMP=OFF`, C/CXX flags `-ffp-contract=off`, then
  `LLAMA_CPP_LIB_PATH=<build>/bin`.
- CPU only. **Never decode on GPU**, and do not mix a stock `pip install llama-cpp-python` build with the pinned one
  (a stock build decoded 0/12 in testing; the CRC caught all 12).
- Proven on Linux (gcc). For the demo laptops: run the codec service on the same Linux build on every machine (WSL2 on
  Windows is fine), and re-run a cross-machine encode/decode check on the actual demo laptops before judging.
- For dashboard development you do NOT need the model: replay `data/replay_400.jsonl` (real packets, see section 7).

Suggested codec service (one per laptop): FastAPI on localhost.
`POST /encode {text, type, priority, people, location}` → `{packet_hex, method, text_bytes, wire_bytes, airtime_ms, tokens}`;
`POST /decode {packet_hex}` → parse result. The Windows-side Meshtastic bridge (`pip install meshtastic`;
`SerialInterface()`, `sendData(payload, destinationId=..., portNum=256, wantAck=True)`, receive via
`pubsub.pub.subscribe(on_receive, "meshtastic.receive")`) calls this service and writes to SpacetimeDB.

## 6. Proven numbers (the only performance numbers we use)

| Result | Value |
|---|---|
| 400 real disaster messages, encode and decode in separate programs | 400/400 exact |
| Total size, complete packets incl. header + CRC | 39,143 B of text → 9,662 B (4.05x smaller) |
| Typical message | 83 B → 22 B |
| Longest message | 354 B → one 70-byte packet |
| Laptop CPU speed (SmolLM2-360M) | ~0.2 s encode, ~0.4 s decode per message |
| Cross-machine (Intel cloud ↔ AMD laptop, TinyLlama) | 40/40 each direction |
| Tampered packet / wrong build | 12/12 rejected by CRC, 0 wrong texts |
| Airtime, Meshtastic LongFast | 83 B raw 1,051 ms vs 22 B packet 559 ms → ~1.9x more messages per channel |
| vs Unishox2 (simple compressor already in Meshtastic code, disabled) | 805 ms vs 559 ms → ~1.4x |
| Meshtasticator sim, 40 nodes, msg every 120 s | share of mesh reached 33.5% raw → 48.9% compressed |
| Same sim, long messages (168 B p90) | 24.8% → 44.2% |
| Same sim, 20 nodes, every 120 s | 53.2% → 63.0% (long: 41.6% → 60.8%) |
| Baselines, 400 msgs, size vs raw | zstd 0.82, brotli 0.72, Unishox2 0.62, zstd+dictionary 0.59, LLM 0.21-0.25 |
| Haitian Creole originals | LLM 0.44 of raw vs Unishox2 0.62; beat Unishox2 on 80/80 |

## 7. Data you can build the demo on

- `data/replay_400.jsonl`: the 400 real messages with their REAL compressed packets from Sud's laptop run:
  id, text, raw_bytes, packet_bytes, method, type, priority, people, location_offsets, packet_hex, airtime_raw_ms,
  airtime_packet_ms, decoded_ok. Type/priority/people/location were assigned synthetically for header testing; for the
  demo, assign realistic ones (or let Claude extract them from the text) and place points on a real map.
- `data/sample.jsonl`: same 400 messages with original category flags (Figure Eight / Appen Disaster Response
  dataset, mostly 2010 Haiti earthquake SMS translated to English, plus other disasters).
- `data/sample_creole.jsonl`: original Creole/French versions.
- `results/sim_n{20,40}_p{30,120}.json`: Meshtasticator payload sweeps (5 runs each).
- `results/res_baselines.json`: classic compressor baselines.
- `scripts/lora_math.py`: `airtime_ms(text_bytes, sf=11, bw_khz=250, cr_den=5)` (Semtech formula with Meshtastic
  overheads) and `p_hop(t, tbar, u)` collision-survival model. Use these in the simulator so every number on screen
  comes from a real formula.
- `scripts/mesh_sim.py`: how the Meshtasticator sweep was run.

## 8. Demo spec (what the judges see)

Goal: every number on screen is computed live or comes from a labeled real measurement. No hard-coded responses.

1. **Live send (real radios).** A judge types any report on the field laptop. Show the compression visually:
   each word colored by how many bits it cost (`m.explain`), the byte counter dropping (e.g. 120 B → 24 B), the
   airtime bar shrinking. The radio sends; the command laptop decodes the identical text; Claude turns it into an
   incident card on the map within a few seconds.
2. **The race (simulated congestion).** Same message stream, two copies of the mesh side by side: raw vs compressed.
   Delivered and lost counters diverge live; channel-busy gauge. Driven by `lora_math` + replayed real messages.
3. **City-scale map (simulation, clearly labeled).** Dozens of virtual nodes over a real map (Bay Area or a flood
   scenario), replaying real disaster messages; heatmap of reports delivered vs lost, raw vs compressed toggle.
4. **Safety net.** Flip one byte in a packet (or decode with the wrong model) on stage: it is rejected and falls back
   to plain text. This also covers us if something genuinely fails live.
5. **Two-way.** Command post replies ("Team en route, 20 min") go back over the mesh compressed.

Failure plan: radios on USB power, a spare pre-flashed radio, a health-check script run before every judge, the long
range run recorded on video beforehand, and the simulator running independently of the radios.

## 9. Pitch: framing that holds up under questions

Judges include sponsor engineers (Anthropic, SpacetimeDB, Microsoft). Two minutes of Q&A will test every number, and
one caught exaggeration costs more than any extra wow. Use only claims from section 6 and the facts below, each with its
source in our Devpost/README.

**Strong, true lines:**
- "When Hurricane Helene hit, 74% of North Carolina's cell towers went down." (SDxCentral, Sept 28, 2024)
- "In Harvey, Houston's emergency center got 120,000 calls in five days; some rescue calls took over 20 hours to clear."
  (Houston Chronicle)
- Satellite's limits, from Apple's own support page: a satellite text takes "30 seconds or more" with a clear view of the
  sky, up to several minutes under trees, and may not connect at all under heavy foliage or near tall buildings; you must
  be outside holding the phone; iPhone 14 or later. Satellite connects one person to the outside world. A mesh lets a
  whole neighborhood coordinate with each other, indoors, on radios the community owns.
- Satellite-to-phone carries roughly 0.33 Mbps per square kilometer in RCR Wireless's model, versus about 770 Mbps for a
  normal suburban cell grid. Say "in one industry model" when citing it.
- "Meshtastic's own team says meshes start to congest above about 60 nearby nodes; one 150-node mesh hit over 65% channel
  use." Our codec is a free software upgrade that roughly doubles what every existing radio can carry.
- "Communities already run these networks: MeshCore alone counts about 30,000 nodes worldwide, and the Bay Area mesh
  reaches from San Francisco to Monterey." (MeshCore blog; Bay Area MeshCore organizers)
- On scale: LoRa capacity is local, so a channel in one neighborhood does not compete with one across town. Capacity grows
  as communities add coverage, and our codec doubles what each channel carries.
- On prior work: "We build on the same math as Fabrice Bellard's ts_sms; what nobody had done is make it run inside a
  real mesh, decode identically across different computers, and fail safely." Saying this first turns the biggest
  attack into credibility.

**Avoid (each one is easy for a judge to break):** "first ever", "5x more messages" (it is 4x smaller and about 2x more
messages), "LoRa always fails", "works for millions of people", "Starlink takes hours", "fine-tuned" (we have not
fine-tuned), any statistic we cannot source.

## 10. Build order (now → 9 AM)

1. SpacetimeDB schema + dashboard skeleton reading `replay_400.jsonl` through the simulator (no radios needed).
2. Race view and city map with `lora_math`-driven delivery.
3. Compression visualization from `explain()` output (Sud can export a JSON of per-token costs for demo messages).
4. Claude triage agent writing `incident` rows; human-confirm button.
5. Integrate live radios through the bridge (Sud).
6. Before 3 AM: Devpost draft submitted (guide recommends submitting Saturday night), README with sources, demo video.
7. Remaining time: failure drills, health-check script, pitch rehearsal with timing.

## 11. Known pitfalls

- Determinism: same build, CPU only, same context file, same model file. Check hashes on every demo machine.
- The newline stop rule: messages are single-line; `build_packet` collapses whitespace. Do not send multi-line text.
- LILYGO T3 LoRa32 v1.6.1 boards: supported (firmware "T-LoRa V2.1-1.6") but being phased out by Meshtastic and use the
  older SX1276 chip. Get 915 MHz versions; attach antennas before powering; all radios on the same firmware and preset.
- Venue RF is noisy (3,000 people). Keep the live link short range on the table; the long range run is on video.
- The `explain()` method in this kit's `mesh_codec.py` was added after the 400/400 test; it does not touch encode/decode.
