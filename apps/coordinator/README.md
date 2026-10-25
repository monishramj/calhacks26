# apps/coordinator

**Owner:** ws/state (state laptop), except `src/inference/` (ws/inference, the inference laptop) · **Spec:** §6, §9, §17, §19

The server-side process on the command post. It holds the only secrets (`.env`).

- Radio intake endpoint: accepts schema-valid `ReportInput` from the authorized bridge identity and forwards it through the adapter.
- Job issuing: creates `inputSignature` from the ordered relevant report IDs and incident revisions, coalesces by incident revision, one active job per incident.
- Scenario injector: delivers the §18 exercise one event at a time. R07 waits for the presenter's "Send next report", never a timer. In radio mode it skips its copy of R01.
- `npm run dev:live` and `npm run preflight` wiring.
- `src/inference/` (ws/inference): Laya client and the bounded Claude tool loop. Four responses, eight tool executions, twenty seconds, and one transient retry (§6).
