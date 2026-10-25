# services/local-laya

**Owner:** ws/inference (inference laptop), laya lane on the Windows laptop (D-008) · **Areas:** Local Laya suggestions, resilience (Laya failure) · **Spec:** §4, §5, §17 `LocalSuggestion`, §20 local Laya suggestions

A local Python worker that loads Laya once and answers bounded action, relationship, and attention questions over the current candidates. It serves at `LOCAL_LAYA_URL`. No generated summaries, no cloud dependency, no retrieval service, no fine-tuning project (§20 local Laya suggestions). It runs natively on the Windows laptop, the command post (D-008).

## Setup (once per machine)

```bash
py -3.11 -m venv ../laya-env                      # outside the repo
../laya-env/Scripts/python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
../laya-env/Scripts/python -m pip install -r services/local-laya/requirements.txt
export LAYA_MODEL_PATH=<dir outside git>          # the Windows laptop: ../laya-models/laya
../laya-env/Scripts/python services/local-laya/tools/setup_laya.py   # pinned download + provenance.json
../laya-env/Scripts/python services/local-laya/tools/laya_smoke.py   # load time, outputs, warm latency
../laya-env/Scripts/python -m pytest services/local-laya/tests -rs   # model tests skip as "unavailable" without LAYA_MODEL_PATH
```

## Layout

```text
services/local-laya/
  laya_worker/   config (env), runtime (load once, typed-answer checks, token room), suggest + server (local Laya suggestions IMPLEMENT)
  tools/         setup_laya.py, laya_smoke.py (ported from flyby)
  results/       laya_smoke_cpu.json (measured on the Windows laptop)
  tests/         pytest suite: mocked contract tests + `-m model` real-checkpoint tests
```

## What the runtime does (measured on the Windows laptop, 2026-10-25)

- `laya==0.3.20`, English root checkpoint `convaiinnovations/laya@55cf4c4e…`, `model.safetensors` 842,609,210 bytes, SHA-256 `891102d372688fc2a094dac56a384bc537b87c63f21f9f3dac0be2b7cbc8d86c`.
- **512 tokens total** (`max_len`), question header plus options capped at 192 (`head_max_len`). The SDK **silently right-truncates** state past the room left (`laya/common.py` `build_sequence`), so the worker must count tokens itself and send oversize jobs to review.
- `choice` → `probabilities` over exactly the option keys asked (sum 1, rounded to 4 places): `kind: 'probability'`. `score` → expected ordinal `0..n-1`, not a percentage: `kind: 'score'`. `noul` → P(true). Each answer also carries the SDK's `confidence` (normalized entropy for choice/score), `answer_confidence`, and `action.act_probability`; none of those is urgency.
- The checkpoint warns that choice questions with **11 or more options** use a clamped, uncalibrated temperature.
- Laya scored at chance on raw JSON in flyby: render state as plain sentences.

Weights stay outside git (`LAYA_MODEL_PATH`).

## Native Mac worker (local Laya suggestions IMPLEMENT)

Use Python 3.11 or newer. The pins above were measured on the Windows laptop; the inference laptop's Mac installation and
inference remain unverified until the real-model check below succeeds.

```bash
python3 -m venv ../laya-env
../laya-env/bin/python -m pip install -r services/local-laya/requirements.txt
export LAYA_MODEL_PATH=../laya-models/laya
../laya-env/bin/python services/local-laya/tools/setup_laya.py
../laya-env/bin/python -m pytest services/local-laya/tests -q -rs
PYTHONPATH=services/local-laya ../laya-env/bin/python -m laya_worker.server --host 0.0.0.0 --port 8091
```

The server loads once, checks the installed Laya version and pinned weights SHA-256, and serializes
requests. Set the coordinator's `LOCAL_LAYA_URL` to `http://<worker-host>:8091`. `GET /health`
returns readiness plus runtime/revision, or 503. `POST /suggest` accepts the v1.0.0 `JobInput` and
returns the validated `LocalSuggestion` directly. Invalid input is 400, an oversized body is 413,
and unavailable inference is 503, with contract error codes and no provider internals.

Every original delivered report is included in receive-sequence order. If the complete state cannot
fit the SDK's measured per-question token room, no model call runs: the result is `REQUEST_REVIEW`,
null attention, and empty scores, with a truncation warning in the server log. More than ten candidates
also requires review without inference. These are boundary decisions, not successful model predictions;
v1 has no reason field. No reports or pending corrections are selected away to fit.

Scores preserve the model's choice probabilities, including candidate choices; SDK entropy confidence
is never an urgency score. An authored 0.6 winning probability and 0.2 margin gate uncertain choices
into review/null attention. These thresholds are not calibrated accuracy claims. Lowering the attention
of an existing open candidate remains unresolved for operator review even with strong model scores.
Only the backend/operator can confirm state. An unavailable startup stays unavailable until restart.

With the server running, send one **authored development input** (no expectations or future events):

```bash
PYTHONPATH=services/local-laya/tests ../laya-env/bin/python - <<'PY'
import json
import sys
from time import perf_counter
from urllib.request import Request, urlopen
from laya_g4_helpers import clinic_job
sys.path.insert(0, 'packages/domain/python')
import domain_contract
request = Request('http://127.0.0.1:8091/suggest',
                  data=json.dumps(clinic_job()).encode(),
                  headers={'Content-Type': 'application/json'})
start = perf_counter()
with urlopen(request, timeout=30) as response:
    suggestion = json.load(response)
elapsed_ms = (perf_counter() - start) * 1000
assert domain_contract.validate('LocalSuggestion', suggestion) == []
assert suggestion['scores'], 'No real inference scores; inspect server review warnings'
print(json.dumps({'label': 'live local Laya; authored input',
                  'latency_ms': elapsed_ms, 'suggestion': suggestion}, indent=2))
PY
```
