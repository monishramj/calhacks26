# Kickoff: the 8-hour run

**T0 = ____ (fill in the wall-clock start).** Everything is final at T+8:00. The plan front-loads the build: core features in the first ~2.5 hours, integration next, and the remaining time for refining, hardening, and rehearsal. That's the optimistic end of §14's estimates, so the checkpoints are where we re-estimate and cut. If the build runs late, the refine window shrinks; the core (§14, §23) doesn't.

## Schedule

| Time | C1 · codec-radio | C2 · state | C3 · inference | C4 · web (lanes) |
|---|---|---|---|---|
| **0:00–1:00 · build** | Kit import, codec preflight on both endpoints, G1 TEST → IMPL | **G0 TEST → IMPL → REVIEW** (unblocks everyone), SpacetimeDB running | Laya load, Claude key + smoke call, G4 TEST | Lead: shell + lane skeleton. Scene and panels lanes start on layout and geometry |
| **1:00–2:30 · build** | G1 REVIEW, G2 TEST → IMPL over the real radios | G6 rules, G3 TEST → IMPL | G4 IMPL → REVIEW, G5 TEST | Scene: G7. Panels: G6 UI. Replay adapter and `dev:replay` (**M1**) |
| **2:30–4:00 · integrate** | G2 REVIEW, bridge → coordinator intake | G3 REVIEW, live adapter, coordinator jobs + scenario injector, `dev:live` | G5 IMPL → REVIEW, Laya and Claude wired to jobs | Fixture adapter → live adapter, two-browser check |
| **4:00–7:00 · refine** | G8 radio failure, G9 radio harness + measurements | G8 backend, integration fixes | `npm run evaluate`, G8 inference | G8 replay isolation, e2e story, polish, optional baked scene |
| **7:00–8:00 · final** | Final numbers | Final integration run | Final eval numbers | Rehearsal ×2, labeled backup recording |

## Checkpoints (apply the ground truth's fallbacks; don't drift)

| When | Pass condition | If it fails |
|---|---|---|
| **CP1 · T+1:00** contracts + preflight | `[contract] v1` merged to `main`; every row of `work/PREFLIGHT.md` has a real result | Apply the CP1 check on `work/BOARD.md`. Codec can't run on both endpoints: G2 is unverified and the demo uses **labeled** scenario input (§8, §19). Laya won't load: manual review and an explicitly limited prototype (§10, §14), and C3 moves to G5 early. Never fake either. |
| **CP2 · T+2:30** core built (M1) | `npm run dev:replay` plays R01–R12 with queue movement, labeled LOCAL REPLAY; every core gate at least IMPL green | The scene stays on the placeholder (no Blender). Whoever is ahead takes a ready task from `work/BOARD.md`. |
| **CP3 · T+4:00** integrated | A report sent over the radios lands in SpacetimeDB once; a Laya suggestion appears; operator approval updates both browsers; a Claude proposal if connected | Cut per §23: camera polish, extra scenarios, comparison views, recordings. Keep the core. |
| **CP4 · T+7:00** freeze | No new features | Only fixes, G9 evidence, and the pitch-claim check (§21–22). Remove any claim without evidence. |

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
5. If preflight succeeds, run G4 TEST as written in §20 against the §17 types (G0 isn't merged yet, so don't invent fields). Author your own development cases in services/local-laya/tests. The ≥24 held-out cases belong to the PM. Never open fixtures/private/heldout/; only write a loader that reads it at evaluation time. Then stop.
6. Record the phase in work/validation/G4.md, set the exact next step in your status file, commit with prefix [ws/inference][G4][TEST], and push. Report in 8 lines or fewer: preflight table, red tests, blockers.
```

### C4 · ws/web, lead lane

```text
You are the lead lane of workstream ws/web (computer C4) on calhacks26. We have about 8 hours; the schedule is docs/KICKOFF.md. Other agents will work on ws/web in parallel as lanes.

1. Run: git fetch origin && git checkout ws/web && git merge origin/main
2. Read AGENTS.md, docs/KICKOFF.md, the C4 section and "Several agents on one workstream" in docs/WORKSTREAMS.md, apps/web/README.md, docs/GROUND_TRUTH.md (§1, §4–§12, §17–§19 fully; skim the rest), work/status/web.md, and work/inbox/web.md.
3. Treat the §20 "Common context for every coding session" block as if I pasted it here.
4. Build the shell in apps/web: Vite + React + TypeScript + three (react-three-fiber is fine). Layout from apps/web/README.md: scene on the left; incoming, review band, confirmed queue, and selected history on the right; collapsible sections; a mode-banner placeholder. All assets local.
5. Create the lane skeleton so the other lanes never need shared files: apps/web/src/scene/ (a stub <Scene/> mounted on the left), apps/web/src/panels/ (stub components mounted on the right), and apps/web/src/adapters/replay/ (empty stub). Don't define public contract types; those come from packages/domain after G0. Lanes may keep internal view-model types inside their own folders.
6. Put scripts only in apps/web/package.json. Don't commit a lockfile inside apps/web (ws/state owns the root lockfile).
7. Stop when the shell runs. Put how to run it and the exact next step in work/status/web.md, commit with prefix [ws/web][chore], push ws/web, and report in 8 lines or fewer. Don't start G7 or the G6 UI yourself; the scene and panels lanes do.
```

### Orchestrator · main

```text
You are the orchestrator for calhacks26 on branch main. We have about 8 hours; the schedule is docs/KICKOFF.md.
Read AGENTS.md, docs/ORCHESTRATOR.md, docs/KICKOFF.md, docs/WORKSTREAMS.md, and docs/GROUND_TRUTH.md (§11–§14, §16, §18, §19, §22, §23 fully; skim the rest).
1. Run one loop pass from docs/ORCHESTRATOR.md and update work/BOARD.md and work/PREFLIGHT.md.
2. At CP1, compare the preflight results with the CP1 check on work/BOARD.md and apply the ground-truth fallback for anything not ready. Don't turn those rules into questions.
The held-out cases belong to the PM (pitch role); don't draft or commit them. Write only to your owned paths. Report in 10 lines or fewer.
```

---

## Lanes (several agents on one workstream)

Start a lane only after the lead lane has pushed the skeleton. From the folder that contains your main clone:

```bash
git -C calhacks26 fetch origin
git -C calhacks26 worktree add ../calhacks26-web-scene -b ws/web-scene origin/ws/web
git -C calhacks26 worktree add ../calhacks26-web-panels -b ws/web-panels origin/ws/web
```

Open each tool in its own worktree folder and paste its lane prompt.

### Lane prompt (generic; replace LANE, NAME, PATHS, GATE PHASE)

```text
You are lane LANE of workstream ws/NAME on calhacks26, working in your own git worktree on branch ws/NAME-LANE. Read AGENTS.md, docs/KICKOFF.md, docs/WORKSTREAMS.md (the ws/NAME section and "Several agents on one workstream"), and the docs/GROUND_TRUTH.md sections your gate cites. Treat the §20 common context as pasted here.
You own ONLY these paths: PATHS. Don't edit anything else; ask the lead lane for shared-file changes.
Run GATE PHASE for your lane's slice. If you use subagents, they edit only your paths and never run git or install packages; you do. Record the phase in work/validation/Gx-LANE.md and work/status/NAME-LANE.md, commit with the AGENTS.md prefix plus [LANE], push ws/NAME-LANE, and stop with a report of 8 lines or fewer.
```

### ws/web scene lane (suggested: Codex) · worktree `calhacks26-web-scene`

```text
You are lane scene of workstream ws/web on calhacks26, in your own git worktree on branch ws/web-scene. Read AGENTS.md, docs/KICKOFF.md, docs/WORKSTREAMS.md (ws/web section and "Several agents on one workstream"), apps/web/README.md, apps/web/SCENE_PIPELINE.md, and docs/GROUND_TRUTH.md §5, §7, §10, §12, §17, §18, and §20 (common context and G7). Treat the §20 common context as pasted here.
You own ONLY apps/web/src/scene/** and apps/web/public/scene/**. Ask the lead lane for any shared-file change.
Run G7 TEST for the scene slice: placeholder scene at the §18 coordinates, selectable labeled markers, keyboard selection, a WebGL-unavailable 2D fallback, and the heatmap density rule (one equal contribution per open located confirmed incident; none for repeats, resolved, or unlocated incidents; fixed radius and fixed scale). Until packages/domain lands, use an internal view-model type inside src/scene/ only. Subagents edit only your paths and never run git or install packages. Record the phase in work/validation/G7-scene.md and work/status/web-scene.md, commit with prefix [ws/web][G7][TEST][scene], push ws/web-scene, and stop with a report of 8 lines or fewer.
```

### ws/web panels lane (suggested: Cursor) · worktree `calhacks26-web-panels`

```text
You are lane panels of workstream ws/web on calhacks26, in your own git worktree on branch ws/web-panels. Read AGENTS.md, docs/KICKOFF.md, docs/WORKSTREAMS.md (ws/web section and "Several agents on one workstream"), apps/web/README.md, and docs/GROUND_TRUTH.md §5, §8, §10, §12, §17, §18, and §20 (common context and G6). Treat the §20 common context as pasted here.
You own ONLY apps/web/src/panels/**. Ask the lead lane for any shared-file change.
Run G6 TEST for the UI slice: the incoming feed shows original text with provenance labels; the pinned review band holds unconfirmed possible life-safety concerns, contradictions, and unknowns; the confirmed queue renders the order that the packages/domain rules return (don't reimplement ordering; stub it until ws/state's rules land); the timeline keeps every original with sent, event, and receive times shown separately; an override needs a reason; every color has a written label. Until packages/domain lands, use an internal view-model type inside src/panels/ only. Subagents edit only your paths and never run git or install packages. Record the phase in work/validation/G6-panels.md and work/status/web-panels.md, commit with prefix [ws/web][G6][TEST][panels], push ws/web-panels, and stop with a report of 8 lines or fewer.
```

After each lane phase, the lead merges the lane branch into `ws/web` (`git merge origin/ws/web-scene`), and lanes merge `origin/ws/web` back in before their next phase.

### C3 replacement · lead lane (Claude cloud session) · D-008

```text
You are the lead lane of workstream ws/inference (C3) on calhacks26, replacing the C3 agent while its human is away (D-008). Clone https://github.com/monishramj/calhacks26, then run: git checkout ws/inference && git merge origin/main
Read AGENTS.md, CLAUDE.md, docs/KICKOFF.md, the C3 section of docs/WORKSTREAMS.md, apps/coordinator/README.md, apps/coordinator/src/inference/README.md, work/DECISIONS.md (D-007, D-008), docs/GROUND_TRUTH.md (§1, §4–§12, §17–§20 fully), work/status/inference.md, and work/inbox/inference.md. Treat the §20 common context as pasted here.
You own apps/coordinator/** and work/eval/**. services/local-laya/** belongs to the laya lane. ANTHROPIC_API_KEY and CLAUDE_MODEL come from this environment's secrets; never print or commit them.
1. Run the existing Claude SDK smoke script and record the model ID that works in the Preflight table.
2. Run G5 TEST exactly as written in §20 against fixture tools. G3 isn't live and G0 is due around 03:45, so use the §17 types and don't invent fields. Then stop.
Record the phase in work/validation/G5.md, set the exact next step in work/status/inference.md, commit with prefix [ws/inference][G5][TEST], push ws/inference, and report in 8 lines or fewer. At every phase start, run `python scripts/questions.py list` and answer open questions addressed to inference.
```

### C3 replacement · laya lane (Cursor on C4) · D-008

From the folder that contains your main clone:

```bash
git -C calhacks26 fetch origin
git -C calhacks26 worktree add ../calhacks26-inference-laya ws/inference-laya
```

```text
You are lane laya of workstream ws/inference on calhacks26, replacing the C3 Laya agent (D-008). You run on C4, the command post, where the Laya worker runs for the demo. In this worktree (branch ws/inference-laya), run `git merge origin/main`, then read AGENTS.md, docs/WORKSTREAMS.md (the C3 section and "Several agents on one workstream"), services/local-laya/README.md, docs/GROUND_TRUTH.md (§4, §5, §12, §17, §20 G4), work/status/inference.md, and work/inbox/inference.md. Treat the §20 common context as pasted here.
You own ONLY services/local-laya/**.
1. Preflight: clone https://github.com/monishramj/flyby OUTSIDE this repo. Port only its Laya setup and smoke tooling. Download the weights outside git (LAYA_MODEL_PATH), load them once on CPU, and record load time, warm p50/p95 on this machine, and exactly what the outputs are.
2. Run G4 TEST as written in §20 against the §17 types, with your own development cases in services/local-laya/tests. Never open fixtures/private/heldout/. Then stop.
Record the phase in work/validation/G4.md and work/status/inference-laya.md, commit with prefix [ws/inference][G4][TEST][laya], push ws/inference-laya, and report in 8 lines or fewer. At every phase start, run `python scripts/questions.py list`.
```

---

## Manager prompts (reuse on any computer or lane; replace NAME)

### NEXT

```text
Continue workstream ws/NAME. First: git fetch origin && git merge origin/main (stop and tell me if a conflict touches files you don't own). Read work/status/NAME.md and any new items in `git show origin/main:work/inbox/NAME.md`. Run `python scripts/questions.py list`; hand open questions for you to a background subagent and fold `action` items into this phase. Then run exactly the ONE phase your status file names as the next step, treating the §20 common context and that gate's phase prompt in docs/GROUND_TRUTH.md as pasted here. When the phase ends: update work/validation, set the exact next step in your status file, commit with the prefix from AGENTS.md, and push. If it was a REVIEW that passed, open a PR to main titled "[Gx REVIEW] ..." that lists real / mocked / unavailable / still failing (use gh, or give me the compare URL). Stop and report in 8 lines or fewer.
```

For a lane, replace `origin/main` with `origin/ws/<workstream>` and `NAME` with `<workstream>-<lane>`; lanes don't open PRs to main.

### NEXT, with a decision from you

```text
Same as NEXT, but first apply this decision and record it under Blockers/Notes in your status file: <decision, e.g. "codec weights missing on the command post until T+2; mark G2 unverified and start the G9 harness on the raw path">.
```

### HANDOFF

```text
I'm handing off this computer. Finish or cleanly stop the current step; if something is half-done, say exactly what. Update work/status/NAME.md so someone with no context can continue: exact next step, how to run what exists, what's half-done, blockers. Commit, push, and give me the next step in one line.
```

### MERGE MAIN (after a contract change)

```text
A contract change landed on main. Merge origin/main into ws/NAME, update your code to the new packages/domain version without weakening tests, rerun your tests, acknowledge the inbox item in your status file, commit, push, and report in 5 lines or fewer.
```
