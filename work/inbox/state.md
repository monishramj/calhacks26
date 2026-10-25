# Inbox · ws/state

_Written by the orchestrator. Acknowledge items by number in `work/status/state.md`._

1. **G0 is first and blocks everyone.** Run TEST → IMPLEMENT → REVIEW as three requests, then open `[contract] v1` against `main`.
2. During G0, freeze the radio-intake transport with ws/codec-radio, and the adapter interface that ws/web and ws/inference consume.
3. After G0, do the G6 rules as pure functions in `packages/domain/src/rules` before G3, so ws/web can build the replay early (M1).
4. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
