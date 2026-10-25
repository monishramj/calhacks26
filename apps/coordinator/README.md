# apps/coordinator

**Spec:** §6, §9, §17, §19

This is the server-side process on the command post. It holds the only secrets (`.env`).

- **Radio intake endpoint:** accepts a schema-valid `ReportInput` from the authorized bridge identity and passes it to the adapter.
- **Job issuing:** creates `inputSignature` from the ordered relevant report IDs and incident revisions. It merges jobs by incident revision and allows one active job per incident.
- **Scenario injector:** delivers the §18 exercise one event at a time. R07 waits for the presenter's "Send next report" and never uses a timer. In radio mode it skips its own copy of R01.
- `npm run dev:live` and `npm run preflight` wiring.
- `src/inference/`: the Laya client and the bounded Claude tool loop. The limits are four responses, eight tool executions, twenty seconds, and one transient retry (§6).
