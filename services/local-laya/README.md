# services/local-laya

**Owner:** ws/inference (C3), laya lane on C4 (D-008) · **Gates:** G4, G8 (Laya failure) · **Spec:** §4, §5, §17 `LocalSuggestion`, §20 G4

A local Python worker that loads Laya once and answers bounded action, relationship, and attention questions over the current candidates. It serves at `LOCAL_LAYA_URL`. No generated summaries, no cloud dependency, no retrieval service, no fine-tuning project (§20 G4). It runs natively on C4, the command post (D-008).

## Setup (once per machine)

```bash
py -3.11 -m venv ../laya-env                      # outside the repo
../laya-env/Scripts/python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
../laya-env/Scripts/python -m pip install -r services/local-laya/requirements.txt
export LAYA_MODEL_PATH=<dir outside git>          # C4: ../laya-models/laya
../laya-env/Scripts/python services/local-laya/tools/setup_laya.py   # pinned download + provenance.json
../laya-env/Scripts/python services/local-laya/tools/laya_smoke.py   # load time, outputs, warm latency
../laya-env/Scripts/python -m pytest services/local-laya/tests -rs   # model tests skip as "unavailable" without LAYA_MODEL_PATH
```

## Layout

```text
services/local-laya/
  laya_worker/   config (env), runtime (load once, typed-answer checks, token room), suggest + server (G4 IMPLEMENT)
  tools/         setup_laya.py, laya_smoke.py (ported from flyby)
  results/       laya_smoke_cpu.json (measured on C4)
  tests/         pytest suite: mocked contract tests + `-m model` real-checkpoint tests
```

## What the runtime does (measured on C4, 2026-10-25)

- `laya==0.3.20`, English root checkpoint `convaiinnovations/laya@55cf4c4e…`, `model.safetensors` 842,609,210 bytes, SHA-256 `891102d372688fc2a094dac56a384bc537b87c63f21f9f3dac0be2b7cbc8d86c`.
- **512 tokens total** (`max_len`), question header plus options capped at 192 (`head_max_len`). The SDK **silently right-truncates** state past the room left (`laya/common.py` `build_sequence`), so the worker must count tokens itself and send oversize jobs to review.
- `choice` → `probabilities` over exactly the option keys asked (sum 1, rounded to 4 places): `kind: 'probability'`. `score` → expected ordinal `0..n-1`, not a percentage: `kind: 'score'`. `noul` → P(true). Each answer also carries the SDK's `confidence` (normalized entropy for choice/score), `answer_confidence`, and `action.act_probability`; none of those is urgency.
- The checkpoint warns that choice questions with **11 or more options** use a clamped, uncalibrated temperature.
- Laya scored at chance on raw JSON in flyby: render state as plain sentences.

Weights stay outside git (`LAYA_MODEL_PATH`).
