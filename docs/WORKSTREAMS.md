# Workstreams: four computers

The ground truth (§11, §16) is written for three developers plus a PM. We have four computers, so package B is split into **state** and **inference**, the split §11 itself anticipates ("a finished developer can take its isolated Laya or Claude task"). The PM's bookkeeping goes to the orchestrator agent; a human still signs off on contract changes and held-out labels. Recorded as D-001 in `work/DECISIONS.md`.

## At a glance

```text
                  ┌────────────── G0 contracts (C2) ──────────────┐
                  ▼                    ▼                          ▼
C1 codec-radio   G1 ─► G2 ─────────────────────────────► G9 radio harness
C2 state         G0 ─► G6 rules ─► G3 SpacetimeDB ─► live adapter ─► G8 backend
C3 inference     preflight ─► G4 Laya ─► G5 Claude ─► evaluate ─► G8 inference
C4 web           shell+scene ─► G7 ─► G6 UI ─► replay adapter ─► G8 replay ─► e2e
                                                     ▼
                                     integration ─► G8 ─► G9 (all)
```

Milestones from §14 (estimates, not promises): **M1** labeled replay with basic 3D, evidence, and queue movement (C4 + C2 rules). **M2** real local backend, Laya, and Claude integrated with core tests. **M3** radio-connected demo with failure tests and a baseline.

## Integration seams

These are the only places workstreams touch. Each is defined by `packages/domain` (G0).

| Seam | Producer | Consumer | Shape |
|---|---|---|---|
| Radio intake | C1 bridge (Python) | C2 coordinator | Schema-valid `ReportInput` with `origin: 'radio'`, sent with the bridge's authorized identity. Proposal: local HTTP POST to the coordinator. Freeze the transport in G0. |
| Adapter | C2 (live, on SpacetimeDB) | C4 web, C3 inference | `subscribeState`, `receiveReport`, `submitLocalSuggestion`, `submitIncidentProposal`, `approveProposal`, `rejectProposal`, `operatorEdit`, `claimJob`, `advanceScenario`, `resetRun` (§17). The interface lives in `packages/domain`. |
| Replay adapter | C4 (in-browser) | C4 web | The same interface with no DB, models, or internet. Every output is labeled `fixture` or `recording`. Writes never reach live. |
| Local Laya | C3 worker (`LOCAL_LAYA_URL`) | C3 `apps/coordinator/src/inference` | Job input (relevant reports, candidate incidents, `inputSignature`) in, `LocalSuggestion` out. |
| Claude | C3 `apps/coordinator/src/inference` | C2 adapter | Tool loop over the four §6 tools, producing an `IncidentProposal` that goes to review. |
| Derived views | C2 `packages/domain/src/rules` | C4 web, C2 backend tests | Pure functions: confirmed queue order, review band, timeline, change flags. Replay and live use the same code. |

**Command post:** the machine that runs SpacetimeDB, the coordinator, the Laya worker, and the receiving radio for the demo. That's **C4**: SpacetimeDB in Docker, the receiving radio, codec endpoint B, and by default the coordinator. C2 develops the module and publishes to C4 over the LAN, and Laya runs natively on a Mac (D-003). The sending radio and first codec endpoint sit on C1's computer.

---

## C1 · `ws/codec-radio` · package A

**Owns:** `services/codec-radio/**`. **Gates:** G1, G2, then the radio harness for G9.

**Hour 0 (alongside G0)**
1. Import the kit codec into `services/codec-radio/` **unchanged** as its own commit. Record the zip's hash in the commit message. `scripts/demo_codec.py` is history only and never becomes the production path (§19).
2. Inventory callers of `codec/mesh_codec.py`. Set up a pinned Python environment.
3. Find the intended codec model file and shared context. Record hashes, runtime build, and CPU/OS on **both** endpoint machines.
4. Radios: firmware version, LoRa preset, serial port on each machine, and whether `meshtastic --info` works. Put the results under **Preflight** in your status file.

**Then:** G1 TEST → IMPLEMENT → REVIEW, then G2 TEST → IMPLEMENT → REVIEW. G2 integration needs the G0 `ReportInput` and envelope contract frozen.

**Needs:** a second machine for the cross-machine decode check (G1 REVIEW, G2). Use the command post.

## C2 · `ws/state` · shared foundation + B-state

> **D-007:** the coordinator process moved to ws/inference. ws/state keeps contracts, the database, G6 rules, the live adapter, and job issuing, `inputSignature`, and the scenario injector as reducers.

**Owns:** `packages/domain/**`, `spacetimedb/**`, `apps/coordinator/**` except `src/inference/`, `fixtures/private/exercise/`, root `package.json` and lockfile. Integration owner for generated bindings.

**Hour 0:** G0 TEST → IMPLEMENT → REVIEW. **G0 unblocks everyone, so it comes first.** In parallel, install local SpacetimeDB and pin the server/client pair. Pick the module language from what actually installs and runs. A TypeScript module can import `packages/domain` rules directly; Rust or C# means the rules are duplicated and checked against shared fixtures.

**Then:**
1. G6 rules as pure functions in `packages/domain/src/rules`, so C4 can build the replay early.
2. G3 against a real local SpacetimeDB, plus the official TypeScript client adapter.
3. Coordinator: job issuing with `inputSignature`, radio intake endpoint, scenario injector (R07 gated on "Send next report", never a timer, §18), `npm run dev:live`, `npm run preflight` wiring.
4. G8 backend: DB loss stops writes, reset invalidates jobs.

## C3 · `ws/inference` · B-inference

> **D-007/D-008:** ws/inference also owns `apps/coordinator/**`. While the C3 human is away, a Claude cloud session runs the lead lane (G5 + coordinator) and Cursor on C4 runs the laya lane. The Laya worker runs on C4.

**Owns:** `services/local-laya/**`, `apps/coordinator/src/inference/**`, `work/eval/**`. **Gates:** G4, G5, `npm run evaluate`, G8 inference.

**Hour 0 (alongside G0):** preflight before writing any features.
1. **Laya:** reuse flyby's working setup (`tools/setup_laya.py`, `tools/laya_smoke.py`, `server/triage/laya_runtime.py`, `docs/LAYA.md`); see `services/local-laya/README.md`. Get the weights and load them locally once. Measure load time and per-call latency on a toy input. Find out exactly what the model returns (probabilities over options, logits, or text). This decides score `kind` (§17). If it won't load, put that in **Blockers** right away so the team can re-estimate (§19).
2. **Claude:** an official-SDK smoke call with `CLAUDE_MODEL` from `.env`. Record the model ID that works for this account.

**Then:** G4 TEST → IMPLEMENT → REVIEW (G4 TEST may start against the §17 types before G0 merges), then G5 TEST → IMPLEMENT → REVIEW, then `npm run evaluate`.

**Rule:** don't open `fixtures/private/heldout/` while developing prompts. Run it only for evaluation, and never tune on it (§13).

## C4 · `ws/web` · package C (dashboard + replay)

**Owns:** `apps/web/**`, `fixtures/replay/**`, `tests/e2e/**`. **Gates:** G7, G6 UI, G8 replay, e2e, `npm run build`.

**Hour 0 (alongside G0):** app shell with the layout only: scene left; incoming / review band / confirmed queue / selected history on the right; collapsible sections. Add a placeholder scene with the three places at the §18 coordinates and WebGL detection with a 2D fallback skeleton. **Don't invent data contracts.** Bind real data after G0 merges. Scene asset work can run in parallel (see `apps/web/SCENE_PIPELINE.md`).

**Then:**
1. G7 TEST → IMPLEMENT → REVIEW against a fixture adapter.
2. G6 UI: timeline, review band, queue, override controls, built on C2's rules.
3. Replay adapter and `npm run dev:replay` (milestone M1).
4. G8 replay isolation, then e2e: browser story, two clients, fault injection.

## Orchestrator · `main` · PM bookkeeping

See `docs/ORCHESTRATOR.md`. Hour 0: initialize `work/BOARD.md` and `work/PREFLIGHT.md`, and review C2's authored exercise expectations. The ≥24 held-out cases (§13) belong to the PM (pitch role).

---

## Several agents on one workstream (lanes)

A workstream can run several agents in parallel, from any tool (Claude Code, Codex, Cursor), and with subagents inside each. That includes a teammate's computer while they sleep. Lanes keep them from colliding:

1. **One worktree and one branch per agent.** Never put two agents in the same folder.
   ```bash
   git fetch origin
   git worktree add ../calhacks26-<ws>-<lane> -b ws/<ws>-<lane> origin/ws/<ws>
   ```
2. **Lane paths don't overlap.** Each lane owns subfolders inside the workstream's paths. The **lead lane** creates the folder skeleton first and keeps the shared files: `package.json`, configs, entry/App shell, shared types, and `work/status/<ws>.md`.
3. **The lead merges lanes into `ws/<ws>`** often. Lane branches never PR straight to `main`; `ws/<ws>` does, as usual.
4. **Each lane records its own evidence:** `work/validation/Gx-<lane>.md` and `work/status/<ws>-<lane>.md` on its lane branch. Same TEST → IMPLEMENT → REVIEW phases.
5. **Subagents inside a lane** edit only that lane's paths and never run git or install dependencies. The lane's main agent does both.
6. **Lane branch names use a hyphen** (`ws/web-scene`), never a slash. `ws/web/scene` can't coexist with `ws/web` in git.

### Suggested lanes for ws/web (C4)

| Lane | Suggested tool | Branch | Owns | Work |
|---|---|---|---|---|
| lead | main Opus chat | `ws/web` | `apps/web` root files (package.json, configs, `src/main.tsx`, `src/App.tsx`), `src/layout/**`, `src/adapters/**` except `replay/`, `work/status/web.md` | Shell, layout, adapter wiring, merging lanes, integration with live |
| scene | Codex | `ws/web-scene` | `apps/web/src/scene/**`, `apps/web/public/scene/**` | G7: placeholder scene, markers, heatmap + density function, WebGL fallback; baked BLOSM scene after CP2 |
| panels | Cursor | `ws/web-panels` | `apps/web/src/panels/**` | G6 UI: incoming feed, review band, confirmed queue, timeline, override controls |
| replay | whichever lane frees up first | `ws/web-replay` | `apps/web/src/adapters/replay/**`, `fixtures/replay/**`, `tests/e2e/**` | G8 replay isolation, `dev:replay`, e2e story |

The lead creates `src/scene/`, `src/panels/`, and `src/adapters/replay/` with a stub component or interface in each before the other lanes start. Lanes import from `packages/domain` and the lead's adapter interface. They never define their own contract types.

## When you finish early or get blocked

- **Blocked on a prerequisite** (weights, radios, credentials): record it, tell the orchestrator via your status file, and keep building against fixtures. Don't generate features to avoid a blocking compatibility test (§19).
- **Finished:** take a ready, unowned task from `work/BOARD.md`. Don't expand your own feature (§16).
- **Short on time:** cut in §23 order: camera polish, extra scenarios, token coloring, extra comparison views, optional recordings.

## Bootstrap prompt for each computer

**For the 8-hour run, use the per-computer start prompts in `docs/KICKOFF.md`.** They also start the first phase. Use this generic one to resume a workstream in a fresh session:

```text
You are the coding agent for workstream <ws/NAME> (computer <Cn>) on calhacks26.
Read AGENTS.md, docs/WORKSTREAMS.md (your section and the seams table), and
docs/GROUND_TRUTH.md (§1, §3–§12, §17–§19 fully; skim the rest). Then read
work/status/<NAME>.md and `git show origin/main:work/inbox/<NAME>.md`.
Merge origin/main into this branch if it's behind. Report: current gate and phase,
the exact next step, blockers, and inbox items. Don't edit anything until I name
the phase to run.
```

Then, for each gate phase, paste the §20 **common context** followed by that gate's TEST, IMPLEMENT, or REVIEW prompt as its own request.
