# packages/domain

**Owner:** ws/state (C2) · **Gates:** G0, G6 rules · **Spec:** §9, §17, §18

The shared wire contract. Everything that crosses a workstream seam is defined here once.

- TypeScript types and enums from §17: `Attention`, `LocalAction`, `Provider`, `ReportInput`, `IncidentView`, `LabelScore`, `LocalSuggestion`, `IncidentProposal`, and the §9 records.
- Committed **JSON Schema** generated from or alongside the types, so Python services (codec bridge, Laya worker) validate the same payloads.
- Typed errors: `STALE_REVISION`, `INVALID_SOURCE`, `INVALID_INPUT`, `UNAUTHORIZED`, `WRONG_RUN`, `SERVICE_UNAVAILABLE`.
- The adapter interface (`subscribeState`, `receiveReport`, ... `resetRun`). Implementations live with their owners: live in ws/state, replay in ws/web.
- `src/rules/` (G6): pure derived views shared by replay and live. Confirmed queue order, review band, timeline, change flags.

## Changing the contract

PR titled `[contract] ...`, bump `CONTRACT_VERSION`, add a line to `CHANGELOG.md`. The orchestrator announces it in every inbox. See `AGENTS.md`.
