# LoR@ — Mesh Codec + Incident Desk

This project helps disaster teams that use LoRa radios. Teams can send detailed reports. The desk keeps the most important unresolved incidents visible as new information arrives. It is a fictional exercise inspired by Hurricane Helene. All incident messages are synthetic.

**Status:** working live demo on `main`. See `docs/HANDOFF.md`.

## Start here

Read [`docs/GROUND_TRUTH.md`](docs/GROUND_TRUTH.md) first. It is the spec and the only planning authority. For the current state of the work, read [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Get the code

```bash
git clone https://github.com/monishramj/calhacks26.git
cd calhacks26
```

## Run

```bash
npm install
npm run dev:live     # SpacetimeDB, Laya worker, coordinator, dashboard at http://localhost:5173
npm run dev:replay   # offline: plays a recorded real run (Laya + Claude) of the 190-report exercise, no services
npm run preflight    # readiness check; add -- --smoke for one small real Claude call
npm run evaluate     # held-out Laya cases and codec size comparison; writes evaluation/report-<date>.md and .json
npm test
```

`dev:live` needs Docker, the Python venv `../laya-env`, and a root `.env` (copy `.env.example`) with `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, and `LAYA_MODEL_PATH`. `evaluate` uses the worker at `EVAL_LAYA_URL` (default `LOCAL_LAYA_URL`).
