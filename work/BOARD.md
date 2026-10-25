# Board

_Maintained by the orchestrator on `main`. Status comes from validation files, never from claims alone._

**Last orchestrator pass:** 2026-10-25 02:45 PDT, by the C3 human's Claude Code session (orchestration handed to C3 at 02:30). No open PRs. Health: every branch except ws/state still needs to merge main (contract v1.0.0); inboxes already say so.

Status values: `not started` · `TEST red` · `IMPL green` · `REVIEW passed` · `blocked` · `unverified (provider unavailable)`

## Open items at handoff (keep current)

_Snapshot 02:30 PDT, written by the C4 orchestrator session as it hands off._

- **G0:** merged to main as contract v1.0.0, and the Windows test fix too (verified on C4: TS 777/777, Py 486/486). Every branch except ws/state needs to merge main; each inbox says so.
- **C2 (ws/state):** told to do G6 rules first (about 45 min), then G3 right away. **G3 (the database) is the biggest remaining risk.** Review its gate PRs fast.
- **C1:** G1 IMPLEMENT green. G1 REVIEW needs a 15–20 min slot on C4 for the cross-machine decode. G2 (radio bridge) can start: G0 froze the intake transport (bridge calls the `receive_report` reducer directly; see packages/domain/README.md).
- **Orchestrator:** now the C3 human's Claude Code session (02:45). D-008 lanes: laya lane active on C4; lead lane (G5 + coordinator) has no commits past the smoke script.
- **C3:** replacement agents (D-008) never started; the C3 computer is back. If the C3 human resumes ws/inference, D-008's lanes go to them. The Laya worker stays on C4 unless they record otherwise.
- **Web:** viz automation paused by the C4 human to save usage. Scene lane finished G7 REVIEW (SF map, D-004 guardrails checked). Panels G6 IMPL is on its lane. Lanes not yet merged into ws/web, and there's no web PR to main yet.
- **PRs:** #1 merged. Merge [contract] and gate PRs per "Loop" in docs/ORCHESTRATOR.md, running tests on a fresh checkout first.
- **Docker:** installed on C4, engine not running. C2 owns `docker-compose.yml` (D-006).
- **Health noise:** `apps/coordinator/package.json` on ws/state predates D-007, so ignore it.

## Gates

| Gate | Pri | Workstream | Status | Evidence | Notes |
|---|---|---|---|---|---|
| G0 contracts | P0 | ws/state | REVIEW passed, merged as v1.0.0 (PR #2, #3) | `work/validation/G0.md` | Every other branch must merge main. |
| G1 codec quality | P0 | ws/codec-radio | REVIEW in progress (3320e3e): 400/400 kit packets decode; `tools/endpoint_check.py` PASS on Linux | `work/validation/G1.md` | Waiting on C4 endpoint check + native Windows suite on C1. |
| G2 radio path | P0 | ws/codec-radio | not started | `work/validation/G2.md` | After G1 + frozen intake contract. |
| G3 incident state | P0 | ws/state (spacetimedb lane) | IMPL in progress (C3 session, `ws/state-spacetimedb`) | `work/validation/G3.md` | Critical path. |
| G4 local Laya | P0 | ws/inference (laya lane) | TEST red (37074d8: 81 red on stubs, against v1) | `G4.md` on ws/inference-laya | Laya loads on C4 CPU: warm p50 1,064 ms / p95 1,322 ms for 3 questions. Next: IMPLEMENT. |
| G5 Claude enrichment | P1 | ws/inference (lead lane) | IMPL in progress (C3 session, ship mode) | `work/validation/G5.md` | Fixture tools until G3. |
| G6 queue and history | P0 | ws/state + ws/web (panels lane) | rules: REVIEW passed on ws/state (51a9238, 40 reordered replays, stale second window, 24/24 mutations caught), no PR yet; panels: IMPL green on replay, v1 move in progress (web-lead session) | `G6-state.md`, `G6-panels.md` | C2 should open the PR so web can import the rules from main. |
| G7 scene and heatmap | P0 | ws/web (scene lane) | REVIEW passed, slice (30adf68: v1 types, CC0 textures, 70/70 + 5 scene e2e) | `G7-scene.md` on ws/web-scene | Not merged into ws/web yet. Lead adapter/panels v1 migration still open (question 1025-022132). |
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

1. **G5 + coordinator job runner** (`apps/coordinator/**`, ws/inference lead lane): Claude tool loop with the four §6 tools against fixture tools, then live after G3. Nobody owns it right now.
2. **ws/web lead:** merge `origin/ws/web-scene`, migrate the adapter/replay to v1, PR to main (web inbox 10).
3. **C4 endpoint check for G1** (web inbox 11).
