# Inbox · ws/inference

_Written by the orchestrator. Acknowledge items by number in `work/status/inference.md`._

1. Preflight first. Reuse flyby's working Laya setup; details are in `services/local-laya/README.md`. Its numbers came from another machine, so re-measure here.
2. G4 TEST may start against the §17 types before G0 merges. Switch to `packages/domain` imports once `[contract] v1` lands.
3. Don't open `fixtures/private/heldout/` while developing prompts.
4. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
5. **Docker (D-006):** run Laya natively on your Mac. A Linux container loses Metal/MPS. Use ws/state's compose file only if you want a local SpacetimeDB to test against.
6. **D-003 (02:00): command post is C4** (SpacetimeDB in Docker, coordinator by default). The Laya worker stays native on your Mac and is reached over the LAN at `LOCAL_LAYA_URL`, so bind it to a LAN-reachable host and port, not only localhost.
7. **Handoff approved (D-007) and replacement agents (D-008).** You now own all of `apps/coordinator/**` (job runner, process shell on C4). ws/state keeps job issuing, `inputSignature`, and the scenario injector as reducers. The C3 human is away: a Claude cloud session runs the lead lane (`ws/inference`: G5 + coordinator, fixture tools until G3), and Cursor on C4 runs the laya lane (`ws/inference-laya`: flyby port, weights, preflight, G4). **The Laya worker runs on C4.** Start from your status file. The only existing work is the Claude smoke script (6b10ce1).
8. **Contract v1.0.0 (G0) is on main.** Merge origin/main (MERGE MAIN prompt in KICKOFF) and switch to `packages/domain` imports. Its 'Ready work packages' section in `work/validation/G0.md` lists what's ready for you.
9. **D-009 ship mode (02:50).** No more separate TEST phases or new test suites. Each gate is one request: implement, run the real path once, a few lines in work/validation, push. Keep existing tests passing; don't add new ones. Honest labels stay. Priority is the demo path in D-009.
   Laya lane: G4 IMPLEMENT now (worker + server reading v1 JobInput). Lead lane: G5 + coordinator job runner is unowned; whoever is on C3 takes it, fixture tools until G3 is live.
   **D-010 (03:10): the Laya worker runs on C4 for the demo.** Set `LOCAL_LAYA_URL` to C4's worker; a Laya on C3 is for development only.
   **03:05 STOP (C3 human, via the orchestrator).** Come to a stopping point now: finish or cleanly stop the current step, update work/status/<ws>.md (exact next step, what's half-done), commit, push, and stop. Don't start new work. This applies to every lane.
