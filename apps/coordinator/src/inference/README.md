# apps/coordinator/src/inference

**Owner:** ws/inference (inference laptop) · **Areas:** Local Laya suggestions (client side), online Claude enrichment, resilience inference

- **Laya client:** sends a job's relevant reports and candidates to `LOCAL_LAYA_URL` and returns a `LocalSuggestion` with `inputSignature` unchanged.
- **Claude:** one official-SDK client-tool loop with exactly `readIncident`, `readReports`, `listCandidateIncidents`, `submitIncidentProposal`. No approval or dispatch tool. Every argument and result is validated in code. Every new factual claim cites a received source ID. Late or stale results stay reviewable and are never applied.
- Triggers: conflicts, ambiguous cross-incident links, a cluster of updates needing a summary, or an explicit operator request. Repeated packets never trigger a call (§6).
