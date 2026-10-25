# Board

_Maintained by the orchestrator on `main`. Status comes from validation files, never from claims alone._

**Last orchestrator pass:** 2026-10-25 02:10 PDT. C1: G1 IMPL green; G1 REVIEW needs a 15–20 min slot on C4 for the cross-machine decode. C2: root package.json pushed; G0 targeted ~03:45. C3: replacement agents (D-008), none started yet. Web: replay story, panels G6 IMPL, scene G7 IMPL; D-004 (SF Embarcadero) awaiting the C4 human.

Status values: `not started` · `TEST red` · `IMPL green` · `REVIEW passed` · `blocked` · `unverified (provider unavailable)`

## Gates

| Gate | Pri | Workstream | Status | Evidence | Notes |
|---|---|---|---|---|---|
| G0 contracts | P0 | ws/state | not started | `work/validation/G0.md` | Blocks everyone. First. |
| G1 codec quality | P0 | ws/codec-radio | IMPL green (104 passed, real model) | `work/validation/G1.md` | Can start beside G0. |
| G2 radio path | P0 | ws/codec-radio | not started | `work/validation/G2.md` | After G1 + frozen intake contract. |
| G3 incident state | P0 | ws/state | not started | `work/validation/G3.md` | Real local SpacetimeDB. |
| G4 local Laya | P0 | ws/inference | not started | `work/validation/G4.md` | Needs a loadable Laya. |
| G5 Claude enrichment | P1 | ws/inference | not started | `work/validation/G5.md` | Fixture tools first, live after G3. |
| G6 queue and history | P0 | ws/state + ws/web (panels lane) | panels: IMPL on replay; rules: not started | `G6-state.md`, `G6-panels.md` | Rules in `packages/domain/src/rules`. |
| G7 scene and heatmap | P0 | ws/web (scene lane) | IMPL (305272a) | `G7-scene.md` | Fixture adapter first. |
| G8 resilience | P0 | all | not started | `G8-state.md`, `G8-inference.md`, `G8-web.md` | After the G3–G7 real paths. |
| G9 end-to-end | P0 | all | not started | `G9-radio.md`, `G9-integration.md` | Every pitched feature. |

## Checkpoints (schedule: `docs/KICKOFF.md`, T0 = ____)

| Checkpoint | Target | Status |
|---|---|---|
| CP1 contracts merged + preflight filled | T+1:00 | not started |
| CP2 / M1 core built: labeled replay with basic 3D, evidence, queue movement | T+2:30 | not started |
| CP3 integrated: radio report → SpacetimeDB → Laya → approval, two browsers agree (+ Claude) | T+4:00 | not started |
| CP4 feature freeze; G9 evidence and pitch-claim check | T+7:00 | not started |
| Final | T+8:00 | not started |

## CP1 check (T+1:00)

The ground truth already says what happens for every outcome. The orchestrator applies these rules; nobody has to decide anything.

| Check | Comes from | Ready | Not ready (rule that applies) |
|---|---|---|---|
| Codec over the radios (the radios already exchange messages): identical codec weights, context, and runtime on both endpoints, and a binary payload under the measured ceiling | C1 preflight | G2 continues on real hardware | G2 stays unverified. Others keep building against fixtures. The demo's radio step uses labeled scenario input (§8, §18, §19). |
| Laya loads locally | C3 preflight | G4 continues | Reports stay visible and manually reviewable. G4 is unverified, and the demo is presented as an explicitly limited prototype (§10, §14). C3 moves to G5. |
| Claude reachable with an account-accessible model | C3 smoke call | Pin it in `CLAUDE_MODEL` (§6, §19) | G5 unverified. The local path is unaffected (§10). |
| Local SpacetimeDB server/client pair | C2 preflight | Pin versions; G3 continues | G3 blocked. The UI continues on the fixture adapter, labeled, never as a silent substitute (§16). |
| Scope | all of the above | No change | Re-estimate and cut in §23 order, keeping the §14 core (§19). |

**Command post: C4** runs SpacetimeDB (Docker), the receiving radio, codec endpoint B, and by default the coordinator. Laya runs natively on a Mac over the LAN. C2 develops and publishes the module to C4 (D-003). Runtime binaries may be committed (D-005). Docker only for SpacetimeDB and optionally the coordinator (D-006).

## Preflight

See `work/PREFLIGHT.md`. Re-estimate scope here after the first preflight pass (§19).

## Ready, unowned tasks

_None yet._
