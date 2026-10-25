# Inbox · ws/web

_Written by the orchestrator. Acknowledge items by number in `work/status/web.md`._

1. Hour 0: app shell and layout with a placeholder scene. Don't bind data until `[contract] v1` merges.
2. Scene geometry from BLOSM is proposal D-004 in `work/DECISIONS.md`. Keep the procedural placeholder working until it's approved, and timebox the Blender work.
3. M1 (labeled replay with 3D, evidence, and queue movement) is the first team milestone and runs through you.
4. ws/web will run several agents (Opus, Codex, Cursor). Use lanes per `docs/WORKSTREAMS.md`, "Several agents on one workstream": the lead lane builds the shell and folder skeleton first, then scene and panels start in their own worktrees.
5. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
6. **Your machine is the second radio and codec endpoint (D-003).** C1 will need the pinned runtime and codec model on C4 for G1 REVIEW, and the C4 radio bridge for G2. It runs alongside the web lanes, not inside apps/web.
7. **Docker (D-006):** the web app and `dev:replay` stay native. Use ws/state's compose file only if you want a local SpacetimeDB on C4. The codec endpoint on C4 stays native.
8. **D-003 (02:00): your machine is the command post.** It runs SpacetimeDB in Docker (start Docker Desktop), the receiving radio, codec endpoint B, and by default the coordinator. Web clients connect to C4's SpacetimeDB; the second demo screen connects over the LAN.
9. **Contract v1.0.0 (G0) is on main.** Merge origin/main (MERGE MAIN prompt in KICKOFF) and switch to `packages/domain` imports. Its 'Ready work packages' section in `work/validation/G0.md` lists what's ready for you.
10. **Merge request from the scene lane (02:50).** `origin/ws/web-scene` (1c1f820, G7 REVIEW) already contains `ws/web-panels`, and the orchestrator's test merge onto `ws/web` is a clean fast-forward. Lead: `git merge origin/ws/web-scene`, run `npm run verify`, push. Then migrate the lead-owned adapter/replay paths to v1 (questions 1025-021221, 1025-022132), merge `origin/main`, and open the `[G7 REVIEW]` PR. Textures (1025-022715) are polish under §23: only after CP2.
11. **C1 needs your machine for G1 REVIEW (02:55).** On C4: pull `origin/ws/codec-radio`, copy the codec model from C1, `pip install -r services/codec-radio/requirements.txt`, run `python services/codec-radio/tools/endpoint_check.py`. The fingerprint must be `422ac23fca10`. Paste the output to C1 or put it on the questions board (`--to codec-radio`). About 15–20 min, outside apps/web.
12. **D-009 ship mode (02:50).** No more separate TEST phases or new test suites. Each gate is one request: implement, run the real path once, a few lines in work/validation, push. Keep existing tests passing; don't add new ones. Honest labels stay. Priority is the demo path in D-009.
12. **03:00: the web lead runs from C3 now** (C4 automation paused). A C3 session runs `ws/web`: merge the scene lane, move to v1, PR to main. If C4 resumes, check `work/status/web.md` first so you don't run two leads at once.
   **03:05 STOP (C3 human, via the orchestrator).** Come to a stopping point now: finish or cleanly stop the current step, update work/status/<ws>.md (exact next step, what's half-done), commit, push, and stop. Don't start new work. This applies to every lane.
