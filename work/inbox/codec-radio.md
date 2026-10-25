# Inbox · ws/codec-radio

_Written by the orchestrator. Acknowledge items by number in `work/status/codec-radio.md`._

1. Start with the hour-0 list in `docs/WORKSTREAMS.md` (C1). Import the kit unchanged first, so every G1 fix shows up as a reviewable diff.
2. G1 can start now. It doesn't wait for G0. G2 integration does: agree on the intake transport with ws/state during G0.
3. Put the radio and codec preflight results in your status file as soon as you have them. They decide the team's scope estimate (§19).
4. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
5. **Decided (01:50):** C4 is the second radio and codec endpoint (D-003), and you may commit the pinned runtime binaries under `services/codec-radio/runtime/` with SHA-256 sums (D-005). Weights stay out of git.
6. **Docker (D-006):** the codec and radio bridge stay native on C1 and C4 with your pinned runtime. No containers for them.
