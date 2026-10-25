# Inbox · ws/state

_Written by the orchestrator. Acknowledge items by number in `work/status/state.md`._

1. **G0 is first and blocks everyone.** Run TEST → IMPLEMENT → REVIEW as three requests, then open `[contract] v1` against `main`.
2. During G0, freeze the radio-intake transport with ws/codec-radio, and the adapter interface that ws/web and ws/inference consume.
3. After G0, do the G6 rules as pure functions in `packages/domain/src/rules` before G3, so ws/web can build the replay early (M1).
4. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
5. **G0 is now the critical path (01:45).** ws/web and ws/inference are coding against interim copies of §17. ws/web's `apps/web/src/adapters/contract.ts` (on ws/web) also proposes snapshot and command shapes for the adapter, so review them in G0. C3 is waiting on the root `package.json` to add `@anthropic-ai/sdk` to apps/coordinator (question 1025-011817). Two board questions for you are waiting: 1025-005903 (needs your human) and 1025-011817.
6. **D-003 revised:** the receiving radio and second codec endpoint are on **C4**, not C2. Radio intake is a LAN hop (C4 bridge → C2 coordinator). Freeze that transport in G0 (host/port config, not localhost-only).
