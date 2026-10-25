# Status · ws/inference · laya lane (C3 Mac)

_Updated: 2026-10-25 by the laya lane on C3 Mac, per the current human task._

## Now

- **Gate / phase:** G4 IMPLEMENT code written; full-suite and real-model verification blocked by the execution environment. Do not mark G4 green.
- **Branch:** `ws/inference-laya`; last commit `30cabac` (existing merge of main). This implementation is uncommitted and unpushed because the required verification has not completed.
- **Owns:** `services/local-laya/**`, this file, and `work/validation/G4.md`. No other tracked files changed. Existing tests unchanged; no new suite.
- Implemented `suggest.py` / `server.py`: frozen v1.0.0 contracts, original reports in receive order, exact per-question state budget guard, explicit review for overflow/malformed/uncertain output, probability scores, operator review for lowering open concerns, one verified model load and serialized HTTP requests.
- **Evidence:** 11 unchanged safety test functions invoked directly pass, plus an in-process Worker smoke, all using the existing **mock** FakeRuntime and real domain validator. AST parsing and diff checks pass. No full pytest result, live inference, or C3 latency measurement. Prior C4 measurements remain historical in `work/validation/G4.md`.

## Exact next step

Resume in an environment that permits the sibling venv/model paths, shared worktree Git metadata, PyPI/Hugging Face/GitHub access and local port binding. Then:

1. Fetch `origin`, inspect inbox/board, and merge main if it advanced.
2. Run the native setup below, then the **unchanged full suite** with the real checkpoint. Fix any failures within this lane; do not weaken tests.
3. Start the server and run the README's authored development POST. It validates the output, requires actual model scores, and prints measured latency. Record real results in G4 validation.
4. Update this status with the results, then commit with `[ws/inference][G4][IMPL][laya] implement validated local suggestion worker` and `git push origin ws/inference-laya`. Do not claim completion before these checks and push succeed.

## Setup and run (from repo root)

```bash
python3 -m venv ../laya-env
../laya-env/bin/python -m pip install -r services/local-laya/requirements.txt
export LAYA_MODEL_PATH=../laya-models/laya
../laya-env/bin/python services/local-laya/tools/setup_laya.py
../laya-env/bin/python -m pytest services/local-laya/tests -q -rs
PYTHONPATH=services/local-laya ../laya-env/bin/python -m laya_worker.server --host 0.0.0.0 --port 8091
```

**Port:** 8091. Coordinator URL: `http://<worker-host>:8091`. `GET /health`, `POST /suggest` (JobInput → LocalSuggestion). Errors: 400/413 INVALID_INPUT, 503 SERVICE_UNAVAILABLE. Restart after repairing an unavailable startup. Weights and venv remain outside git. Native setup and the exact POST command are in `services/local-laya/README.md`.

## Blockers

- Sandbox denies `../laya-env` creation and parent worktree `FETCH_HEAD` writes. `../laya-models/laya` is absent. No installed Laya runtime/checkpoint.
- PyPI DNS/network is unavailable; pytest installation fails. A temporary check environment has real jsonschema from the existing pip cache, but no pytest. The full test command exits with `No module named pytest`.
- Server startup fails at socket bind with `PermissionError: Operation not permitted`. No running server remains, and no real suggestion was made.
- Hence real model behavior, C3 latency and full regression results remain **unverified**. No commit/push was attempted before the user's required verification.

## Needs from others

- Execution environment/operator: make the documented setup, network, port and Git worktree paths available for the remaining verification and push.
- Lead lane: use the URL and request/response above; this lane is not yet validated for integration. Review-only output without scores can mean a context/option-budget guard; v1 has no reason field, so the reason is logged. Do not reuse C4 latency as a C3 measurement.

## Inbox acknowledged

Items 1–9 from locally available `origin/main:work/inbox/inference.md`; contract v1 and D-009 ship mode followed. Current user explicitly assigns C3 Mac, superseding the older C4 lane handoff for this run. Questions-board check reported no items. No held-out fixtures read.
