# services/local-laya

**Owner:** ws/inference (C3) · **Gates:** G4, G8 (Laya failure) · **Spec:** §4, §5, §17 `LocalSuggestion`, §20 G4

A local Python worker that loads Laya once and answers bounded action, relationship, and attention questions over the current candidates. It serves at `LOCAL_LAYA_URL`. No generated summaries, no cloud dependency, no retrieval service, no fine-tuning project (§20 G4).

## Start from flyby, not from scratch

`monishramj/flyby` already has a working Laya runtime. Port these files, then adapt:

- `docs/LAYA.md`: runtime provenance
- `tools/setup_laya.py`: one-time weight download, pinned revision
- `tools/laya_smoke.py`: hand-labeled cases, warm latency, timeout recommendation
- `server/triage/laya_runtime.py`: loading, plus rendering state to plain sentences

What flyby recorded (re-measure on this machine before relying on any of it):

- `laya==0.3.20`, English root checkpoint, revision pinned in config. About 843 MB on disk and about 1.7 GB in fp32 memory.
- **512 tokens total,** including the question and options (up to 192). Budget candidates accordingly, and never silently drop a relevant correction (§20 G4).
- Render state as plain-language sentences. Laya scored at chance on raw JSON in flyby.
- `choice.probabilities` is a distribution over action keys: `kind: 'probability'`. `score.score` is an expected ordinal (0–3): `kind: 'score'`, not a percentage. `noul.noul` is P(true). Don't use the SDK's entropy `confidence` as urgency.
- CPU warm latency on their machine was about 154 ms p50 and 167 ms p95. That's another machine and another task, so it's not our number.

## Layout

```text
services/local-laya/
  tests/        pytest suite (python -m pytest services/local-laya/tests)
```

Weights stay outside git (`LAYA_MODEL_PATH`).
