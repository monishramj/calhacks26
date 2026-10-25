# Status · ws/inference · laya lane (C4, D-008)

_Updated: 2026-10-25 02:30 PDT by the laya lane (Cursor agent on C4)_

## Now

- **Gate / phase:** G4 TEST done (red, recorded), contract v1.0.0 merged and tests rerun against it (81 red on stubs, 4 green, 0 skipped). Stopped before IMPLEMENT.
- **Branch / worktree:** `ws/inference-laya` at `../calhacks26-inference-laya` (sibling of the main clone) (C4). `origin/main` merged at session start.
- **Owns:** `services/local-laya/**` only. Evidence is in `work/validation/G4.md` (as instructed; the lead's lane table says `G4-laya.md`, but G4 is laya-only, so there is no collision).
- **Exact next step:** G4 IMPLEMENT, which is a separate request. Build `laya_worker/suggest.py` and `laya_worker/server.py` until the reviewed tests in `services/local-laya/tests` pass without weakening them. The G4 worker reads a v1.0.0 `JobInput` and validates its output with `domain_contract`.

## How to run what exists

```bash
export LAYA_MODEL_PATH=../laya-models/laya      # weights outside git
../laya-env/Scripts/python services/local-laya/tools/laya_smoke.py     # venv at ../laya-env
../laya-env/Scripts/python -m pytest services/local-laya/tests -q -rs
```

Setup from scratch: `services/local-laya/README.md`.

## Preflight (§19), measured on C4 CPU

| Item | Result | Evidence |
|---|---|---|
| Laya package + checkpoint | `laya==0.3.20`, `convaiinnovations/laya@55cf4c4e…`, SHA-256 `891102d3…8d86c` | `work/validation/G4.md` |
| Loads locally | yes, CPU. 62.7 s cold first load; ≈13.4 s warm (6.4 s imports + 7.0 s model) | `results/laya_smoke_cpu.json` |
| Warm latency | 3 questions/call: p50 1,064 / p95 1,322 ms. 1 question: p50 211 / p95 288 ms | same |
| Output semantics | choice → probabilities over the asked keys (`probability`); score → expected ordinal 0..n-1 (`score`); noul → P(true). The SDK silently right-truncates state past 512 tokens. Choice with 11+ options is uncalibrated. | `work/validation/G4.md` |
| Claude model ID | not this lane's job (the lead lane does it in the cloud, D-008) | |

## Blockers

None. Contract v1.0.0 is merged; tests validate against packages/domain.

## Needs from others

- ws/state: none open. Answered on the board (`1025-021345-inference-state`): `JobInput.reports` carries exact text, including pending corrections.
- Lead lane: the coordinator client calls `POST /suggest` with a v1 `JobInput` and reads a `LocalSuggestion`. 503 means SERVICE_UNAVAILABLE and 400 means INVALID_INPUT. Budget about 4 s per job on C4 (3×p95), so ask few questions per call.

## Inbox acknowledged

Items 1–7 in `work/inbox/inference.md`. Item 5 (native Laya, no Docker) is followed on C4 per D-008.
