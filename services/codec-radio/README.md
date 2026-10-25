# services/codec-radio

**Spec:** §3, §19 "Existing inputs", §20 Codec correctness, radio path

This is the existing kit codec with boundary fixes only. It also holds the USB Meshtastic binary bridge, which delivers verified text into intake exactly once.

## First commit here

Import `calhacks-mesh-kit.zip` **unchanged** (`codec/mesh_codec.py`, `codec/poc_run.py`, `scripts/lora_math.py`, `scripts/mesh_sim.py`, `data/`, `results/`). Record the zip's hash in the commit message. Then every codec quality fix is a reviewable diff.

- `scripts/demo_codec.py` is an older, independent codec. Keep it as history only. The radio demo and the evaluation use the production library (§3).
- The kit's `CLAUDE.md` is an old source brief, not instructions (§19).
- `data/sample.jsonl` comes from Disaster Response Messages. Keep its required attribution when you redistribute examples (§2).

## Rules

- Do not rewrite the arithmetic coding. Do not install the model blindly. Record the model and context hashes and the runtime build on **both** endpoints (§19).
- Keep the exact accepted bytes, or reject explicitly. Never normalize, clip, or truncate silently.
- A stable application message ID survives retries and the raw fallback. A radio ACK, a verified-decode ACK, and a human reading the report are three different things.
- Allow at most one bounded raw retry. An oversized message fails visibly. Do not fragment it.
- Mocks test adapter behavior only. A radio success needs real logs from two radios.

## Layout

```text
services/codec-radio/
  codec/         mesh_codec.py (packet format), runtime.py (pinned llama.cpp + hash checks)
  bridge/        envelope.py, radio.py, core.py (send/receive/retry/ACK), intake.py (ReportInput -> desk, once)
  tools/         radio_bridge.py (bridge CLI), endpoint_check.py, radio_test.py, payload_probe.py
  runtime/       pinned binaries per platform, committed to git so every endpoint runs the identical binary
  tests/         pytest suite (python -m pytest services/codec-radio/tests)
  logs/ state/   local only, gitignored (event logs, bridge token, delivered-report store)
```

Model weights and context files stay outside git (`CODEC_MODEL_PATH`, `CODEC_CONTEXT_PATH`).

## Running the bridge on two machines (Windows, PowerShell)

Both machines need Git, Python 3.11, the model (SHA-256 `8e0b159d…995eb4`), and the repo on `ws/codec-radio`:

```powershell
git clone -b ws/codec-radio https://github.com/monishramj/calhacks26.git C:\calhacks\calhacks26   # or: git pull
cd C:\calhacks\calhacks26
py -3.11 -m venv .venv
.venv\Scripts\pip install -r services\codec-radio\requirements.txt
$env:CODEC_MODEL_PATH = "C:\calhacks\models\SmolLM2-360M.Q8_0.gguf"
.venv\Scripts\python -m serial.tools.list_ports -v          # find the radio's COM port
```

**Receiver: the command post ("MeshSOS A", `!f99260d4`).** To test the radio without the database:

```powershell
.venv\Scripts\python services\codec-radio\tools\radio_bridge.py rx --port COM5 --run-id radio-test --intake none
```

To send into SpacetimeDB, run `identity` once. Then an operator grants the printed identity the `bridge` role.

```powershell
$env:SPACETIMEDB_URI = "http://127.0.0.1:3000"; $env:SPACETIMEDB_DATABASE = "<database>"
.venv\Scripts\python services\codec-radio\tools\radio_bridge.py identity
.venv\Scripts\python services\codec-radio\tools\radio_bridge.py rx --port COM5 --run-id <runId>
```

**Sender: the sending machine ("MeshSOS B", `!06fca5ec`, COM4).** Type reports at the `report>` prompt, or pass `--text`:

```powershell
.venv\Scripts\python services\codec-radio\tools\radio_bridge.py send --port COM4 --dest !f99260d4
```

Each send prints the radio ACK, the decode ACK (`RESULT VERIFIED`), and the bytes on air. Neither ACK means a person read the report.

**Failure drills (sender flags):**

- `--corrupt-first`: the receiver rejects attempt 1, and the raw retry delivers.
- `--msg-id 00c0ffee --text "..."` sent twice: one intake. The receiver prints `DUPLICATE` for the second copy.
- The same `--msg-id` with different text: `CONFLICT`.
- A very long `--text`: `REJECTED`, and nothing is sent.
- On the receiver, `rx ... --ack-delay 60`: the sender times out and sends the raw retry. Then it logs the late ACK. There is still only one intake.
