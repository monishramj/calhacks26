# Status · ws/codec-radio (C1)

_Updated: 2026-10-25 02:30 PDT by the C1 agent (Claude, new session after the 01:50 handoff). Works from a cloud clone of `ws/codec-radio` and drives C1 through the device bridge._

## Now

- **Process change (02:30, Sud, C1 human):** the separate TEST/IMPLEMENT/REVIEW stops for the rest of C1's work are cut to avoid re-verifying what is already proven (G1 suite, 400/400 decode, C1's 40/40 Windows decode). The work is now three blocks: **1** the C4 endpoint check, **2** the radio bridge with its tests, **3** one real C1→C4 radio run. The hard rules and honest labels are unchanged. Not yet in `work/DECISIONS.md`: **the orchestrator needs to log it.**

- **Gate / phase:** G1 / **IMPLEMENT green and complete**: 104 passed, 0 skipped (real model), and the 400-packet regression is **400/400** (`work/validation/G1.md`). Next is G1 REVIEW, which waits for the human's go-ahead.
- **Last commits:** this commit (400/400 regression recorded); `9ad02f3` merge of `origin/main`; `6b8cbed` G1 IMPL, then a chore commit adding `tools/runtime-build/` (the repo's `.gitignore` ignores `build/`, so the recipe had been left out). Earlier: `11d8df2` G1 TEST, `3d99370` kit import.
- **Exact next steps, in order:**
  1. **Block 1, C4 endpoint check (in progress).** `services/codec-radio/requirements.txt` pins the deps. `tools/endpoint_check.py` prints the hashes and the fingerprint, decodes 20 C1-encoded kit packets and checks 8 probe encodings byte for byte against `tools/endpoint_ref.json`. It passes on Linux. Waiting on the C4 run.
     - On **C1 (native Windows)**: run the suite with `runtime/win-x64`.
     - On **C4 (command post, i7-11800H)**: copy the model, pull this branch, check the fingerprint is `422ac23fca10`, then cross-decode both ways (C1-encoded packets on C4, C4-encoded on C1).
     - Try the failure cases; record real versus unavailable; open a `[G1 REVIEW]` PR to `main`.
  2. Then G2 TEST → IMPLEMENT → REVIEW (radio bridge).
     - Intake per D-007: G0's proposal is that the C4 bridge calls the SpacetimeDB `receiveReport` reducer directly with its own identity. The fallback is an HTTP POST to the coordinator (now ws/inference's), host/port from env.
     - Wait for G0 to freeze `ReportInput` + envelope.

## How to run what exists

```bash
pip install -r services/codec-radio/requirements.txt   # numpy + the pure-Python deps of the vendored third_party/llama_cpp; Unishox2 and llama.cpp are pinned in runtime/<platform>/
CODEC_MODEL_PATH=/path/to/SmolLM2-360M.Q8_0.gguf python services/codec-radio/tools/endpoint_check.py   # endpoint proof, exit 0 = PASS
CODEC_MODEL_PATH=/path/to/SmolLM2-360M.Q8_0.gguf python -m pytest services/codec-radio/tests -q -rs
```

- Without `CODEC_MODEL_PATH` the `model` tests skip as **unavailable**, never as passed. Without `diskcache`/`jinja2`/`typing_extensions` they **error** (`ModuleNotFoundError`); they never pass. Versions verified: diskcache 5.6.3, jinja2 3.1.6, markupsafe 3.0.4, typing_extensions 4.16.0.
- In Python, from `services/codec-radio/codec/`: `import runtime; m = runtime.load(); print(runtime.fingerprint(m))`. `load()` checks the runtime, model and context hashes.
- `codec/poc_run.py encode|decode <model> 2 <context> <in.jsonl> <out.jsonl> a:b` is the batch driver. It needs `LLAMA_CPP_LIB_PATH=runtime/<platform>` and `PYTHONPATH=third_party`.
- `tools/payload_probe.py --ports COMa COMb` measures the payload ceiling. `tools/runtime-build/build_runtime.sh` rebuilds the pinned binaries.
- The model weights are not in git. On C1 they are at `D:\Projects\calhacks-mesh\models\SmolLM2-360M.Q8_0.gguf` (SHA-256 `8e0b159d…995eb4`).

## Handoff notes (context a new agent won't have)

- **Determinism finding.** A stock MinGW build of llama.cpp used x87 `fsincos` for RoPE. It gave different logits from Linux, and x87 microcode can differ between Intel and AMD.
  - Fix: `runtime/win-x64` links glibc 2.39 float math (`third_party/detmath`). It is bit-identical to the system glibc over all 2^32 inputs for sinf/cosf/sincosf/expf/logf.
  - The Windows DLLs then matched the Linux build's logits over 182 steps × 49,152 values (run under Wine).
  - Native Windows on C1 printed the fingerprint `422ac23fca10` and decoded 40/40 kit packets. Recipe: `tools/runtime-build/`.
- **Tooling on C1, outside the repo.** There is a non-repo working copy at `D:\Projects\calhacks-mesh\calhacks26\`. It is **not** a git checkout and **not** authority.
  - It holds a draft radio bridge (`bridge/core.py`, `hub.py`, `field.py`), `tools/bringup.py`, double-click `.bat` launchers, and a Python 3.11 `.venv` with `meshtastic` 2.7.11.
  - Same-laptop rehearsal: separate processes on COM4/COM5, 5/5 codec packets with radio ACK, decode receipt and reply (log `logs\field-demo-20261025-004225.txt`).
  - Use it as G2 input only. Its hub HTTP API and auto-replies are **out of scope** for C1, and its whitespace normalization violates G1.
- **Driving C1's Windows from a cloud agent.** The Cowork device bridge's Linux VM can read and write the connected folder `D:\Projects\calhacks-mesh` but cannot see USB/COM ports. Computer use is click-only for terminals and Explorer.
  - Pattern: write a `.bat` into the folder, double-click it in File Explorer, read the log it writes.
  - Re-sending a file with the same name through `device_commit_files` once delivered a stale copy. Use new names, or write through `device_bash`.
- **Radios.** "MeshSOS A" (`!f99260d4`) goes to **C4**; "MeshSOS B" (`!06fca5ec`) stays on C1 (COM4). The channel link (key) is not in the repo. A size probe may still be running on C1; its results are confounded (see Preflight).
- **C4 is busy.** It is the command post (D-003) and also runs the coordinator (D-007) and the Laya worker (D-008). Budget its CPU when timing codec decode there.
- **Questions board:** nothing open for codec-radio at handoff. At 02:20, C1 answered `1025-020711-state-codec-radio` (status `action`): it accepts ws/state's direct-HTTP `receive_report` intake for G2, keeps the coordinator fallback, accepts the 1000 B text bound, and sets `sentAt: null` unless the G2 framing adds one. One correction: the answer cites the 233 B snapshot ceiling as §17; it is §19.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| Radio 1: firmware, preset, serial port | working | "MeshSOS A" `!f99260d4`, LilyGO T3 LoRa32 V1.6.1 (`TLORA_V2_1_1P6`, SX1276), Meshtastic **2.7.26.54e0d8d**, region US, **LONG_FAST**, private channel "MeshSOS", tx_power setting 30 (firmware clamps to the board max). COM5 on C1 for bench tests; **moves to C4** (D-003). |
| Radio 2: firmware, preset, serial port | working | "MeshSOS B" `!06fca5ec`, same board, firmware, region, preset and channel. COM4 on C1 (Windows 11, CH9102 driver OK). |
| Codec model file + shared context hashes (endpoint A, C1) | measured | AMD Ryzen 9 270, Windows 11 Home 10.0.26200. Model SHA-256 `8e0b159d81bce47993580827a26ec01e64092edd55165b6076e6fbfa37995eb4` (386,404,864 B). Context = `services/codec-radio/data/context_primed.txt`, SHA-256 `55d73dd75f06c70a4ec84c7d0c9cad2ae71601e4e1956cba9d322719576d5e43`. |
| Codec model file + shared context hashes (endpoint B, C4) | unknown | C4 = Intel i7-11800H, x86-64 + AVX2, Windows 11 Home 10.0.26300, 15.7 GB RAM (D-003): meets the requirement. Hashes not checked yet. |
| Codec runtime build runs on both endpoints | A: yes (draft copy); B: unknown | Endpoint A ran the identical `win-x64` DLLs from the non-repo copy: fingerprint `422ac23fca10`, 40/40 cross-machine decodes. Not yet rerun from `runtime/win-x64` in the repo. Endpoint B untested. |
| Meshtastic SDK path and actual payload ceiling | path working; ceiling **not established** | Python `meshtastic` 2.7.11; `sendData` on PRIVATE_APP (256) as a direct message with `wantAck`; 18–26 B packets 5/5. Size probe at the same desk, full power: 64 B 2/2, 128 B 1/2, 180–210 B 0/2. That is receiver overload, not a ceiling. Re-measure with the boards ≥3 m apart (C1 ↔ C4) or tx_power ≈2 dBm. |

## Blockers

None for G1 REVIEW on C1. The C4 part of the REVIEW needs a slot with the C4 human (Sud is coordinating).

## Needs from others

- **ws/state (G0):** frozen `ReportInput` + envelope (stable message ID, version) and the radio-intake transport. D-007 proposal: the C4 bridge calls `receiveReport` directly with its own identity; fallback HTTP with host/port from env.
- **C4 human (command post):** prep was sent to Sud at 02:17: copy and hash-check the model, clone `ws/codec-radio`, create a venv with `numpy pytest diskcache jinja2 typing_extensions`, plug in "MeshSOS A". The rest comes with REVIEW. For G1 REVIEW, copy the model to C4, pull `ws/codec-radio` and run the checks (~15–20 min); for G2, plug in "MeshSOS A" ≥3 m from C1's board. All native, outside `apps/web`.

## Inbox acknowledged

1–4: kit imported first; G1 started without waiting for G0; preflight above; questions board checked each phase.
5: C4 is endpoint B; runtime binaries are in git (D-005).
6: codec and bridge stay native.
7: C4 is the command post; bridge → coordinator is local there, address configurable.
