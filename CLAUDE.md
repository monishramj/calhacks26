# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- **Find your workstream from the branch:** `git branch --show-current`. `ws/codec-radio` is C1, `ws/state` is C2, `ws/inference` is C3, `ws/web` is C4. A branch like `ws/web-scene` is a **lane** of that workstream: you own only that lane's paths (`docs/WORKSTREAMS.md`, "Several agents on one workstream"). On `main` you are the orchestrator (see `docs/ORCHESTRATOR.md`). If that's not your role, ask which workstream you're on before editing anything.
- **One gate phase per request.** When a TEST, IMPLEMENT, or REVIEW phase is done, record it in `work/validation/`, update your status file, and stop with a summary. Don't roll into the next phase or gate on your own.
- **Stay inside your owned paths** (table in AGENTS.md). If you need a change elsewhere, write it under "Needs from others" in your status file.
- **Before the session ends,** or when the user says they're handing off or going to sleep: update `work/status/<ws>.md`, commit, and push the `ws/*` branch.
- **Claude API work (G5, `apps/coordinator/src/inference/`):** use the official Anthropic SDK, read the model from `CLAUDE_MODEL`, and keep the key only in the coordinator's environment. Tools are exactly `readIncident`, `readReports`, `listCandidateIncidents`, `submitIncidentProposal`: no approval or dispatch tools (§6).
- **Long-running processes** (SpacetimeDB server, Laya worker, radio listener, dev servers) run in the background or a separate terminal, never as a blocking foreground command.
