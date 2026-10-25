# Board

_Maintained by the orchestrator on `main`. Status comes from validation files, never from claims alone._

Status values: `not started` · `TEST red` · `IMPL green` · `REVIEW passed` · `blocked` · `unverified (provider unavailable)`

## Gates

| Gate | Pri | Workstream | Status | Evidence | Notes |
|---|---|---|---|---|---|
| G0 contracts | P0 | ws/state | not started | `work/validation/G0.md` | Blocks everyone. First. |
| G1 codec quality | P0 | ws/codec-radio | not started | `work/validation/G1.md` | Can start beside G0. |
| G2 radio path | P0 | ws/codec-radio | not started | `work/validation/G2.md` | After G1 + frozen intake contract. |
| G3 incident state | P0 | ws/state | not started | `work/validation/G3.md` | Real local SpacetimeDB. |
| G4 local Laya | P0 | ws/inference | not started | `work/validation/G4.md` | Needs a loadable Laya. |
| G5 Claude enrichment | P1 | ws/inference | not started | `work/validation/G5.md` | Fixture tools first, live after G3. |
| G6 queue and history | P0 | ws/state + ws/web | not started | `G6-state.md`, `G6-web.md` | Rules in `packages/domain/src/rules`. |
| G7 scene and heatmap | P0 | ws/web | not started | `work/validation/G7.md` | Fixture adapter first. |
| G8 resilience | P0 | all | not started | `G8-state.md`, `G8-inference.md`, `G8-web.md` | After the G3–G7 real paths. |
| G9 end-to-end | P0 | all | not started | `G9-radio.md`, `G9-integration.md` | Every pitched feature. |

## Checkpoints (schedule: `docs/KICKOFF.md`, T0 = ____)

| Checkpoint | Target | Status |
|---|---|---|
| CP1 contracts merged + preflight filled | T+1:30 | not started |
| CP2 / M1 labeled replay with basic 3D, evidence, queue movement | T+3:00 | not started |
| CP3 / M2 real local backend + Laya (+ Claude), two clients agree | T+5:30 | not started |
| CP4 feature freeze; G9 evidence and pitch-claim check | T+7:00 | not started |
| M3 radio-connected demo with failure tests and a baseline | by T+8:00 | not started |

## Preflight

See `work/PREFLIGHT.md`. Re-estimate scope here after the first preflight pass (§19).

## Ready, unowned tasks

_None yet._
