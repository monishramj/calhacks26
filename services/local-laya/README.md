# services/local-laya

**Spec:** §4, §5, §17 `LocalSuggestion`, §20 Useful local inference

This is a local Python worker. It loads Laya once and answers bounded action, relationship, and attention questions about the current candidates. It serves at `LOCAL_LAYA_URL`. It has no generated summaries, cloud dependency, or retrieval service. Stock inference is the default; an optional scorer head is described below. It runs natively on the command post.

## Setup (once per machine)

```bash
py -3.11 -m venv ../laya-env                      # outside the repo
../laya-env/Scripts/python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
../laya-env/Scripts/python -m pip install -r services/local-laya/requirements.txt
export LAYA_MODEL_PATH=<dir outside git>          # the command post: ../laya-models/laya
../laya-env/Scripts/python services/local-laya/tools/setup_laya.py   # pinned download + provenance.json
../laya-env/Scripts/python services/local-laya/tools/laya_smoke.py   # load time, outputs, warm latency
../laya-env/Scripts/python -m pytest services/local-laya/tests -rs   # model tests skip as "unavailable" without LAYA_MODEL_PATH
```

If a verified checkpoint already exists on this machine, point `LAYA_MODEL_PATH` at it and skip `setup_laya.py`. The worker checks the weights SHA-256 at load. `LAYA_DEVICE` selects the torch device (default `cpu`).

## Layout

```text
services/local-laya/
  laya_worker/   config (env), runtime (load once, typed-answer checks, token room), suggest + server
  tools/         setup_laya.py, laya_smoke.py (ported from flyby)
  results/       laya_smoke_cpu.json (measured on the command post)
  tests/         pytest suite: mocked contract tests, plus `-m model` real-checkpoint tests
```

## What the runtime does (measured on the command post, 2026-10-25)

- `laya==0.3.20`, English root checkpoint `convaiinnovations/laya@55cf4c4e…`. `model.safetensors` is 842,609,210 bytes, SHA-256 `891102d372688fc2a094dac56a384bc537b87c63f21f9f3dac0be2b7cbc8d86c`.
- **512 tokens total** (`max_len`). The question header plus options are capped at 192 (`head_max_len`). The SDK **silently cuts off the end** of the state when it passes the room left (`laya/common.py` `build_sequence`). So the worker must count tokens itself and send oversize jobs to review.
- `choice` gives `probabilities` over exactly the option keys asked (sum 1, rounded to 4 places): `kind: 'probability'`. `score` gives the expected ordinal `0..n-1`, not a percentage: `kind: 'score'`. `noul` gives P(true). Each answer also carries the SDK's `confidence` (normalized entropy for choice and score), `answer_confidence`, and `action.act_probability`. None of these is urgency.
- The checkpoint warns that choice questions with **11 or more options** use a clamped, uncalibrated temperature.
- Laya scored at chance on raw JSON in flyby. Render the state as plain sentences.

Weights stay outside git (`LAYA_MODEL_PATH`).

## Optional incident scorer

`finetune/make_data.py` authors 200 synthetic examples with generic places; it reads no fixtures.
The fixed split has 160 training examples and 40 validation examples with disjoint wording groups.
Places are shared across the split. This is limited synthetic validation, not calibration.
`finetune/train.py` freezes stock Laya and trains only a copy of its 1,052,673-parameter scorer
for action and attention. It selects the epoch by synthetic validation cross entropy and saves
`models/laya_incident_scorer.pt` plus `.json` metrics, data digest, and pinned base revision/digest.

```bash
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
python services/local-laya/finetune/make_data.py
python services/local-laya/finetune/train.py
LAYA_SCORER_PATH="$PWD/models/laya_incident_scorer.pt" PYTHONPATH=services/local-laya \
  python -m laya_worker.server --host 127.0.0.1 --port 8094
```

Use the installed Laya environment and set `LAYA_MODEL_PATH` to the verified stock checkpoint first.
Without `LAYA_SCORER_PATH`, behavior and health output remain stock. When set, `/health.scorer`
identifies **uncalibrated fine-tuned-head scores**, the head/data hashes, and the base revision.
Action and attention use `kind: "score"`; candidate selection retains stock probabilities.
The contract's provider remains `local_laya`. Invalid or incompatible heads fail unavailable.
The review thresholds and open-candidate guard remain; plausible harm from either the stock or
tuned attention scores blocks a downgrade. Configure the environment before worker startup.

The saved experiment selected epoch 394/400: synthetic validation accuracy is 70% action and
80% attention (cross entropy 0.814 and 0.679). This split has no `ACTIVE_NEED` or `REQUEST_REVIEW`
validation labels, so those accuracies do not establish performance across every class.
`models/laya_incident_evaluation.json` records the unchanged `scripts/evaluate.py:laya` evaluation
through `Worker.handle`: stock → tuned counts across 26 cases are false links 0 → 0, missed
corrections 2 → 2, attention confusions 1 → 2, unjustified downgrades 0 → 0, and review 26 → 26.
All 26 actions remain `REQUEST_REVIEW`: this head **has not demonstrated reduced review load**.
The port-8094 worker could not bind in the sandbox (`PermissionError: [Errno 1] Operation not permitted`),
so these are in-process results, not HTTP verification. The evaluator's git/codec main was not run.
The 80-epoch initial run is retained separately; the extension addressed synthetic underfitting,
with checkpoint selection using only the synthetic validation loss. No evaluation text or labels
entered training. All 100 service tests passed with the local real model; the only warning was
the stock checkpoint's existing temperature clamp for 11+ choices.

## Native Mac worker

Use Python 3.11 or newer. The pins above were measured on the command post. The Mac installation and inference are unverified until the real-model check below succeeds.

```bash
python3 -m venv ../laya-env
../laya-env/bin/python -m pip install -r services/local-laya/requirements.txt
export LAYA_MODEL_PATH=../laya-models/laya
../laya-env/bin/python services/local-laya/tools/setup_laya.py
../laya-env/bin/python -m pytest services/local-laya/tests -q -rs
PYTHONPATH=services/local-laya ../laya-env/bin/python -m laya_worker.server --host 0.0.0.0 --port 8091
```

The server loads once, checks the installed Laya version and the pinned weights SHA-256, and handles requests one at a time. Set the coordinator's `LOCAL_LAYA_URL` to `http://<worker-host>:8091`. `GET /health` returns readiness plus runtime and revision, or 503. `POST /suggest` accepts the v1.0.0 `JobInput` and returns the validated `LocalSuggestion` directly. Invalid input is 400, an oversized body is 413, and unavailable inference is 503. Errors use the contract error codes and do not expose provider internals.

Every original delivered report is included, in receive-sequence order. If the complete state does not fit the SDK's measured per-question token room, no model call runs. The result is `REQUEST_REVIEW`, null attention, and empty scores, with a truncation warning in the server log. More than ten candidates also requires review without inference. These are boundary decisions, not successful model predictions. v1 has no reason field. The worker does not drop any reports or pending corrections to make them fit.

Scores keep the model's choice probabilities, including candidate choices. The SDK's entropy confidence is never an urgency score. An authored 0.6 winning probability and 0.2 margin send uncertain choices to review with null attention. These thresholds are not calibrated accuracy claims. If a suggestion would lower the attention of an existing open candidate, it stays unresolved for operator review, even with strong model scores. Only the backend or the operator can confirm state. If startup finds inference unavailable, it stays unavailable until restart.

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
