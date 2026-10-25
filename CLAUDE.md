# CLAUDE.md

See [docs/HANDOFF.md](docs/HANDOFF.md) for the current state.

## Claude Code notes

- **Claude API work (`apps/coordinator/src/inference/`):** use the official Anthropic SDK. Read the model from `CLAUDE_MODEL`. Keep the API key only in the coordinator's environment. The tools are exactly `readIncident`, `readReports`, `listCandidateIncidents`, `submitIncidentProposal` (optional, for material queue changes) and `submitIncidentPicture` (required, ends the job). There are no approval or dispatch tools (§6).
- **Long-running processes** (SpacetimeDB server, Laya worker, radio listener, dev servers) must run in the background or in a separate terminal. Never run them as a blocking foreground command.
