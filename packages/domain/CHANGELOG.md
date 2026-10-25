# Contract changelog

One line per `CONTRACT_VERSION`. Newest first.

- v1.4.0 · 2026-10-25 · Claude checks Laya: job kind `LOCAL_CHECK`, `ClaudeCheck`, `SubmitClaudeCheckCommand`, method `autoConfirm` (worker), `ReviewEvent.actorRole` may be `claude_check`, optional `DeskState.checks`.
- v1.3.0 · 2026-10-25 · Claude working picture: `IncidentPicture` (area → site → subarea → claims, unconfirmed), `IncidentPictureDraft`, `SubmitIncidentPictureCommand`, optional `JobInput.candidatePictures`.
- v1.2.0 · 2026-10-25 · Removed provider `gemini`; incident proposals come from `claude`.
- v1.1.0 · 2026-10-25 · Added provider `gemini` (incident proposals from the coordinator; same worker rules as `claude`).
- v1.0.0 · 2026-10-25 · Shared contracts frozen (review passed).
  - §17 types, verbatim.
  - §9 records: `Report`, `ReportRelation`, `SuggestionRecord`, `ProposalRecord`, `Job` (with `baseIncidentVersions`), `JobInput`, `ReviewEvent`, `ScenarioState`.
  - Commands, roles, errors, and `DeskState`/`DeskAdapter` (with backend `inputSignatures`), as in `schema/contract.schema.json`.
  - Wire limits: 1000 B text, 1 MiB JSON, depth 16.
  - Radio intake: the bridge calls the `receive_report` reducer over SpacetimeDB HTTP with its own identity, and `sourceId = mesh_source_id(node)` (see README).
