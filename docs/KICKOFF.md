# Kickoff: the 8-hour run

**T0 = ____ (fill in the wall-clock start).** About 8 hours of implementation. §14 targets an 8-hour build only when prerequisites cooperate, so the checkpoints below are where we re-estimate and cut. We don't push through them.

## Schedule

| Time | C1 · codec-radio | C2 · state | C3 · inference | C4 · web |
|---|---|---|---|---|
| **0:00–1:30** | Kit import, preflight, G1 TEST → IMPL | **G0 TEST → IMPL → REVIEW**, install SpacetimeDB | Laya + Claude preflight, G4 TEST | App shell + placeholder scene, G7 TEST |
| **1:30–3:00** | G1 REVIEW (cross-machine), G2 TEST | G6 rules TEST → IMPL → REVIEW | G4 IMPL | Replay adapter, G7 IMPL, `dev:replay` (**M1**) |
| **3:00–5:30** | G2 IMPL → REVIEW on real radios | G3 TEST → IMPL → REVIEW, live adapter, coordinator intake/jobs/scenario injector | G4 REVIEW, G5 TEST → IMPL | G6 UI, G7 REVIEW, hook up live adapter |
| **5:30–7:00** | Bridge → coordinator, G8 radio failure, G9 radio harness | `dev:live`, G8 backend, merge integration | G5 REVIEW, `npm run evaluate`, G8 inference | G8 replay isolation, e2e story, optional baked scene |
| **7:00–8:00** | G9 radio measurements | G9 integration run | G9 eval numbers | Rehearsal ×2, labeled backup recording |

## Checkpoints (apply the ground truth's fallbacks; don't drift)

| When | Pass condition | If it fails |
|---|---|---|
| **CP1 · T+1:30** contracts + preflight | `[contract] v1` merged to `main`; every row of `work/PREFLIGHT.md` filled with a real result | Apply the CP1 check on `work/BOARD.md`. No radios or codec weights: G2 is unverified and the demo uses **labeled** scenario input (§8, §19). Laya won't load: manual review and an explicitly limited prototype (§10, §14), and C3 moves to G5 early. Never fake either. |
| **CP2 · T+3:00** M1 | `npm run dev:replay` plays R01–R12 with queue movement, labeled LOCAL REPLAY | Freeze the scene at the placeholder (no Blender). C2 pairs on rules if those are the blocker. |
| **CP3 · T+5:30** M2 | Report → SpacetimeDB → Laya suggestion → operator approval → both browsers agree; a Claude proposal if connected | Whoever is ahead takes a ready G3 or integration task from `work/BOARD.md`. Cut per §23: camera polish, extra scenarios, comparison views, recordings. |
| **CP4 · T+7:00** feature freeze | No new features | Only fixes, G9 evidence, and the pitch-claim check (§21–22). Remove any claim without evidence. |

**Baked BLOSM scene:** only after CP2 passes and D-004 is approved. Hard stop at T+5:00.

## Running four computers when you're the only one awake

Each agent runs **one gate phase per prompt** (§12), then stops with a report of 8 lines or fewer. The phases are the review points. Your loop:

1. Go round-robin, **C2 first** (it's on the critical path until G3), then C1, C3, C4.
2. Read each report. If it looks right, send **NEXT**. If it's blocked, decide now (cut, re-order, or give it a ready task) and say so in the prompt.
3. Every 30–45 minutes, run an orchestrator pass on `main` (prompt in `docs/ORCHESTRATOR.md`) to refresh the board and inboxes, and merge PRs that are ready.
4. Before anyone hands a computer back or sleeps, send **HANDOFF**.

Keep unattended machines plugged in with sleep disabled. Use a permission mode that won't stall waiting for approval, so a phase isn't stuck when you come back.

---

## Start prompts (paste one into a fresh Claude Code session in the repo)

### C1 · ws/codec-radio

```text
You are the coding agent for workstream ws/codec-radio (computer C1) on calhacks26. We have about 8 hours; the schedule is docs/KICKOFF.md.

1. Run: git fetch origin && git checkout ws/codec-radio && git merge origin/main
2. Read AGENTS.md, docs/KICKOFF.md, the C1 section of docs/WORKSTREAMS.md, services/codec-radio/README.md, docs/GROUND_TRUTH.md (§1, §3–§12, §17–§19 fully; skim the rest), work/status/codec-radio.md, and work/inbox/codec-radio.md.
3. Treat the §20 "Common context for every coding session" block as if I pasted it here.
4. Hour-0 setup: import calhacks-mesh-kit.zip into services/codec-radio/ UNCHANGED as its own commit, with the zip's SHA-256 in the message (ask me where the zip is if you can't find it). Inventory callers of codec/mesh_codec.py. Set up a pinned Python environment. Look for the codec model file and shared context and record their hashes. Run `meshtastic --info` on any connected radio. Fill in the Preflight table in work/status/codec-radio.md.
5. Then run G1 TEST exactly as written in §20, and stop.
6. Record the phase in work/validation/G1.md, set the exact next step in your status file, commit with prefix [ws/codec-radio][G1][TEST], and push. Report in 8 lines or fewer: preflight results, red tests and why, blockers.
```

### C2 · ws/state

```text
You are the coding agent for workstream ws/state (computer C2) on calhacks26. We have about 8 hours; the schedule is docs/KICKOFF.md. G0 blocks every other computer, so it comes first.

1. Run: git fetch origin && git checkout ws/state && git merge origin/main
2. Read AGENTS.md, docs/KICKOFF.md, the C2 section and seams table of docs/WORKSTREAMS.md, packages/domain/README.md, docs/GROUND_TRUTH.md (§1, §3–§12, §17–§19 fully; skim the rest), work/status/state.md, and work/inbox/state.md.
3. Treat the §20 "Common context for every coding session" block as if I pasted it here.
4. Run G0 TEST exactly as written in §20. You own the root package.json: create it with npm workspaces (packages/*, apps/*) plus the minimal test harness. Cover the radio-intake payload ws/codec-radio will send, the adapter interface ws/web and ws/inference consume, and a held-out case format the evaluator can load. The §18 exercise goes in fixtures/private/exercise/ as private assertions.
5. In a background terminal, install local SpacetimeDB and record its versions in the Preflight table. Don't build the module yet.
6. Record the phase in work/validation/G0.md, set the exact next step in your status file, commit with prefix [ws/state][G0][TEST], and push. Report in 8 lines or fewer: red tests and why, SpacetimeDB preflight, and anything in §17 that's ambiguous. List ambiguities; don't resolve them by inventing fields.
```

### C3 · ws/inference

```text
You are the coding agent for workstream ws/inference (computer C3) on calhacks26. We have about 8 hours; the schedule is docs/KICKOFF.md.

1. Run: git fetch origin && git checkout ws/inference && git merge origin/main
2. Read AGENTS.md, docs/KICKOFF.md, the C3 section of docs/WORKSTREAMS.md, services/local-laya/README.md, apps/coordinator/src/inference/README.md, docs/GROUND_TRUTH.md (§1, §3–§12, §17–§19 fully; skim the rest), work/status/inference.md, and work/inbox/inference.md.
3. Treat the §20 "Common context for every coding session" block as if I pasted it here.
4. Preflight, with no feature code: clone https://github.com/monishramj/flyby OUTSIDE this repo for reference. Port only its Laya setup and smoke tooling into services/local-laya. Download the weights outside git, load Laya once, measure load time and warm p50/p95 on this machine, and record exactly what the outputs are. Then make one official Anthropic SDK smoke call with CLAUDE_MODEL from .env (ask me for the key; never commit it) and record the model ID that works. Fill in the Preflight table in work/status/inference.md.
5. If preflight succeeds, run G4 TEST as written in §20 against the §17 types (G0 isn't merged yet, so don't invent fields). Author your own development cases in services/local-laya/tests. The orchestrator drafts the ≥24 held-out cases separately. Never open fixtures/private/heldout/; only write a loader that reads it at evaluation time. Then stop.
6. Record the phase in work/validation/G4.md, set the exact next step in your status file, commit with prefix [ws/inference][G4][TEST], and push. Report in 8 lines or fewer: preflight table, red tests, blockers.
```

### C4 · ws/web

```text
You are the coding agent for workstream ws/web (computer C4) on calhacks26. We have about 8 hours; the schedule is docs/KICKOFF.md.

1. Run: git fetch origin && git checkout ws/web && git merge origin/main
2. Read AGENTS.md, docs/KICKOFF.md, the C4 section of docs/WORKSTREAMS.md, apps/web/README.md, apps/web/SCENE_PIPELINE.md, docs/GROUND_TRUTH.md (§1, §4–§12, §17–§19 fully; skim the rest), work/status/web.md, and work/inbox/web.md.
3. Treat the §20 "Common context for every coding session" block as if I pasted it here.
4. Hour-0 shell: in apps/web, set up Vite + React + TypeScript + three (react-three-fiber is fine). Build the layout from apps/web/README.md: scene on the left; incoming, review band, confirmed queue, and selected history on the right; collapsible sections; a mode-banner placeholder. Placeholder scene: ground plane, box clusters at the §18 coordinates (school (0,0), residence (80,20), shelter (-120,40)), a flat river strip, all assets local. Add WebGL detection with a 2D fallback skeleton. Use obviously fake placeholder text, and don't define contract types; those come from packages/domain after G0. Put scripts only in apps/web/package.json, and don't commit a lockfile inside apps/web (ws/state owns the root lockfile).
5. Then run G7 TEST exactly as written in §20, against a fixture adapter shaped like the §17 adapter, and stop.
6. Record the phase in work/validation/G7.md, put how to run the shell and the exact next step in your status file, commit with prefix [ws/web][G7][TEST], and push. Report in 8 lines or fewer.
```

### Orchestrator · main

```text
You are the orchestrator for calhacks26 on branch main. We have about 8 hours; the schedule is docs/KICKOFF.md.
Read AGENTS.md, docs/ORCHESTRATOR.md, docs/KICKOFF.md, docs/WORKSTREAMS.md, and docs/GROUND_TRUTH.md (§11–§14, §16, §18, §19, §22, §23 fully; skim the rest).
Hour-0 tasks:
1. Draft ≥24 held-out cases (§13: paraphrase, hearsay, negation, rescue questions, partial all-clear, delayed old reports, nearby separate incidents) in fixtures/private/heldout/, using the format ws/state defines in G0 (until then, a plain JSON draft). Don't commit them until I've reviewed them; the reviewer must not be on ws/inference.
2. Run one loop pass from docs/ORCHESTRATOR.md and update work/BOARD.md and work/PREFLIGHT.md.
3. At CP1, compare the preflight results with the CP1 check on work/BOARD.md and apply the ground-truth fallback for anything not ready. Don't turn those rules into questions.
Write only to your owned paths. Report in 10 lines or fewer.
```

### Lane (any tool; one per extra agent on a workstream)

Set up the worktree first (`docs/WORKSTREAMS.md`, "Several agents on one workstream"), then open the tool in that folder:

```text
You are lane LANE of workstream ws/NAME on calhacks26, working in your own git worktree on branch ws/NAME-LANE. Read AGENTS.md, docs/KICKOFF.md, docs/WORKSTREAMS.md (the ws/NAME section and "Several agents on one workstream"), and the docs/GROUND_TRUTH.md sections your gate cites. Treat the §20 common context as pasted here.
You own ONLY these paths: PATHS. Don't edit anything else; ask the lead lane for shared-file changes.
Run GATE PHASE for your lane's slice. If you use subagents, they edit only your paths and never run git or install packages; you do. Record the phase in work/validation/Gx-LANE.md and work/status/NAME-LANE.md, commit with the AGENTS.md prefix plus [LANE], push ws/NAME-LANE, and stop with a report of 8 lines or fewer.
```

---

## Manager prompts (reuse on any computer; replace NAME)

### NEXT

```text
Continue workstream ws/NAME. First: git fetch origin && git merge origin/main (stop and tell me if a conflict touches files you don't own). Read work/status/NAME.md and any new items in `git show origin/main:work/inbox/NAME.md`. Then run exactly the ONE phase your status file names as the next step, treating the §20 common context and that gate's phase prompt in docs/GROUND_TRUTH.md as pasted here. When the phase ends: update work/validation, set the exact next step in your status file, commit with the prefix from AGENTS.md, and push. If it was a REVIEW that passed, open a PR to main titled "[Gx REVIEW] ..." that lists real / mocked / unavailable / still failing (use gh, or give me the compare URL). Stop and report in 8 lines or fewer.
```

### NEXT, with a decision from you

```text
Same as NEXT, but first apply this decision and record it under Blockers/Notes in your status file: <decision, e.g. "radios unavailable until T+4; mark G2 unverified and start the G9 harness on the raw path">.
```

### HANDOFF

```text
I'm handing off this computer. Finish or cleanly stop the current step; if something is half-done, say exactly what. Update work/status/NAME.md so someone with no context can continue: exact next step, how to run what exists, what's half-done, blockers. Commit, push, and give me the next step in one line.
```

### MERGE MAIN (after a contract change)

```text
A contract change landed on main. Merge origin/main into ws/NAME, update your code to the new packages/domain version without weakening tests, rerun your tests, acknowledge the inbox item in your status file, commit, push, and report in 5 lines or fewer.
```
