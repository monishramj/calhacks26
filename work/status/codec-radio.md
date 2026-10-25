# Status · ws/codec-radio (C1)

_Updated: 2026-10-25 01:55 PDT by the C1 agent (Claude), with Sud_

## Now

- **Gate / phase:** G1 / TEST done (red, recorded in `work/validation/G1.md`); next is IMPLEMENT
- **Last commit:** `[ws/codec-radio][G1][TEST]` on top of `3d99370` (kit imported unchanged, zip SHA-256 `9ee7e975…41da4`)
- **Exact next step:** G1 IMPLEMENT. Fix only codec boundaries in `services/codec-radio/codec/`:
  - Stop normalizing; preserve exact text; fall back to raw when the model coder can't carry it (newline terminator).
  - Validate before parsing; reject unknown method/type, truncated fields and invalid UTF-8 with named reasons.
  - Reject out-of-range metadata with `ValueError`.
  - Bound Unishox2 decompression.
  - Make `poc_run.py` keep the original text.
  - Bring in the pinned runtime under `services/codec-radio/runtime/` with SHA-256 sums (D-005), plus a compiler-free Unishox2 for Windows. Native, no Docker (D-006).

## How to run what exists

```bash
pip install numpy unishox2-py3 pytest            # Linux/macOS; unishox2-py3 has no Windows wheels (G1 IMPLEMENT fixes that)
python -m pytest services/codec-radio/tests -q -rs
# real-model tests also need: CODEC_MODEL_PATH, CODEC_CONTEXT_PATH, and an importable llama_cpp (pinned build, see G1.md)
```

Without the model variables the `model` tests skip as **unavailable**. That is not a pass.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| Radio 1: firmware, preset, serial port | working | "MeshSOS A" `!f99260d4`, LilyGO T3 LoRa32 V1.6.1 (`TLORA_V2_1_1P6`, SX1276), Meshtastic **2.7.26.54e0d8d**, region US, **LONG_FAST**, private channel "MeshSOS", tx_power setting 30 (firmware clamps to the board max). COM5 on C1 for bench tests; **moves to C4** (D-003). |
| Radio 2: firmware, preset, serial port | working | "MeshSOS B" `!06fca5ec`, same board, firmware, region, preset and channel. COM4 on C1 (Windows 11, CH9102 driver OK). |
| Codec model file + shared context hashes (endpoint A, C1) | measured | AMD Ryzen 9 270, Windows 11 Home 10.0.26200. Model `SmolLM2-360M.Q8_0.gguf` SHA-256 `8e0b159d81bce47993580827a26ec01e64092edd55165b6076e6fbfa37995eb4` (386,404,864 B); context = kit `data/context_primed.txt` SHA-256 `55d73dd75f06c70a4ec84c7d0c9cad2ae71601e4e1956cba9d322719576d5e43`. |
| Codec model file + shared context hashes (endpoint B, C4) | unknown | C4 = Intel i7-11800H, x86-64 + AVX2, Windows 11 Home 10.0.26300, 15.7 GB RAM (D-003, `work/PREFLIGHT.md`): meets the requirement. Hashes not checked on C4 yet. |
| Codec runtime build runs on both endpoints | endpoint A: yes, endpoint B: unknown | **Endpoint A (C1, native Windows):** llama.cpp from the `llama_cpp_python-0.3.36` sdist (SHA-256 `832db069…`), cross-built with MinGW, AVX2/FMA, no AVX-512, glibc 2.39 float math compiled in. Logits fingerprint `422ac23fca10` equals the Linux build. It decoded 40/40 kit packets encoded on the AMD laptop's Linux VM. The binaries are not in the repo yet (decision needed, below). The stock MinGW build used x87 `fsincos` for RoPE and produced different logits from Linux, which would also differ between Intel and AMD; that is why glibc math is compiled in. **Endpoint B:** not checked. |
| Meshtastic SDK path and actual payload ceiling | path working; ceiling **not established** | Python `meshtastic` 2.7.11 over USB serial; `sendData` on PRIVATE_APP (256) as a direct message with `wantAck`. Over-the-air rehearsal on C1 (two processes, one board each): 5/5 codec packets of 18–26 B delivered with radio ACK, SNR +9 to +11 dB. Size probe (`services/codec-radio/tools/payload_probe.py`) at **same-desk distance, full power**: 64 B 2/2, 128 B 1/2, 180–210 B 0/2. That is consistent with SX1276 receiver overload at close range, so it is **not** a ceiling. Re-measure with the boards ≥3 m apart or tx_power ≈2 dBm. |

The rehearsal used draft bridge code that is not in the repo. That code is input to G2, not evidence for it.

## Blockers

None for G1. G1 REVIEW needs endpoint B (C4) for the cross-machine check.

## Needs from others

- **ws/state (G0):** frozen `ReportInput` + envelope (stable message ID, version) and the intake transport. Per D-003 the transport is a LAN hop from the C4 bridge to the C2 coordinator, so the host and port must be configurable, not localhost-only.
- **ws/web / C4 human:** a slot on C4 for G1 REVIEW (copy the model, run the pinned runtime, compare fingerprint and cross-decode), then the receiving board on a USB port for G2. It runs natively, outside `apps/web`.

## Inbox acknowledged

1, 2, 3, 4 (kit imported first; G1 started without waiting for G0; preflight above; questions board checked at phase start: nothing for codec-radio). 5 (C4 = endpoint B; runtime binaries go in git under services/codec-radio/runtime/). 6 (codec and bridge stay native).
