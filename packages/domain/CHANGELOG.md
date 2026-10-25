# Contract changelog

One line per `CONTRACT_VERSION`. Newest first.

- v1.0.0 · 2026-10-25 · G0 freeze. §17 types verbatim; §9 records (`Report`, `ReportRelation`, `SuggestionRecord`, `ProposalRecord`, `Job`, `JobInput`, `ReviewEvent`, `ScenarioState`), commands, roles, and errors as listed in `schema/contract.schema.json` and `work/validation/G0.md`. Radio intake: the bridge calls the `receive_report` reducer over SpacetimeDB HTTP with its own identity (README).
