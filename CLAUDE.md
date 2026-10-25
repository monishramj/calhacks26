# CLAUDE.md

See [docs/HANDOFF.md](docs/HANDOFF.md) for current state and process.

## Claude Code specifics
- **Claude API work (`apps/coordinator/src/inference/`):** use the official Anthropic SDK, read the model from `CLAUDE_MODEL`, and keep the key only in the coordinator's environment. Tools are exactly `readIncident`, `readReports`, `listCandidateIncidents`, `submitIncidentProposal`: no approval or dispatch tools (§6).
- **Questions board:** at the start of every phase, run `python scripts/questions.py list`. If `open` questions are addressed to your workstream, hand them to a background subagent that answers from the code and docs with `python scripts/questions.py answer <id> "..."` (status `action` or `needs-human` when it can't settle them) and edits nothing else. Keep going with your phase. Fold `action` items into your next step. See `docs/QUESTIONS.md`.
- **Long-running processes** (SpacetimeDB server, Laya worker, radio listener, dev servers) run in the background or a separate terminal, never as a blocking foreground command.
