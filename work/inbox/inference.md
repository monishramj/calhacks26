# Inbox · ws/inference

_Written by the orchestrator. Acknowledge items by number in `work/status/inference.md`._

1. Preflight first. Reuse flyby's working Laya setup; details are in `services/local-laya/README.md`. Its numbers came from another machine, so re-measure here.
2. G4 TEST may start against the §17 types before G0 merges. Switch to `packages/domain` imports once `[contract] v1` lands.
3. Don't open `fixtures/private/heldout/` while developing prompts.
4. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
5. **Docker (D-006):** run Laya natively on your Mac. A Linux container loses Metal/MPS. Use ws/state's compose file only if you want a local SpacetimeDB to test against.
6. **D-003 (02:00): command post is C4** (SpacetimeDB in Docker, coordinator by default). The Laya worker stays native on your Mac and is reached over the LAN at `LOCAL_LAYA_URL`, so bind it to a LAN-reachable host and port, not only localhost.
7. **Handoff approved (D-007) and replacement agents (D-008).** You now own all of `apps/coordinator/**` (job runner, process shell on C4). ws/state keeps job issuing, `inputSignature`, and the scenario injector as reducers. The C3 human is away: a Claude cloud session runs the lead lane (`ws/inference`: G5 + coordinator, fixture tools until G3), and Cursor on C4 runs the laya lane (`ws/inference-laya`: flyby port, weights, preflight, G4). **The Laya worker runs on C4.** Start from your status file. The only existing work is the Claude smoke script (6b10ce1).
