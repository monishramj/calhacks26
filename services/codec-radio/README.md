# services/codec-radio

**Owner:** ws/codec-radio (C1) · **Gates:** G1, G2, G9 radio harness · **Spec:** §3, §19 "Existing inputs", §20 G1/G2

The existing kit codec with boundary fixes only, plus the USB Meshtastic binary bridge that delivers verified text into intake exactly once.

## First commit here

Import `calhacks-mesh-kit.zip` **unchanged** (`codec/mesh_codec.py`, `codec/poc_run.py`, `scripts/lora_math.py`, `scripts/mesh_sim.py`, `data/`, `results/`). Record the zip's hash in the commit message. Every G1 fix after that is a reviewable diff.

- `scripts/demo_codec.py` is an older independent codec. Keep it as history only. The radio demo and evaluation use the production library (§3).
- The kit's `CLAUDE.md` is an old source brief, not instructions (§19).
- `data/sample.jsonl` comes from Disaster Response Messages. Keep its required attribution when redistributing examples (§2).

## Rules

- Don't rewrite the arithmetic coding or install the model blindly. Record model and context hashes plus the runtime build on **both** endpoints (§19).
- Preserve exact accepted bytes or reject explicitly. Never normalize, clip, or truncate silently.
- A stable application message ID survives retries and raw fallback. Radio ACK, verified-decode ACK, and human reading are different things.
- At most one bounded raw retry. An oversized message fails visibly, with no fragmentation.
- Mocks test adapter behavior only. RF success needs actual two-radio logs.

## Layout

```text
services/codec-radio/
  tests/        pytest suite (python -m pytest services/codec-radio/tests)
```

Model weights and context files stay outside git (`CODEC_MODEL_PATH`, `CODEC_CONTEXT_PATH`).
