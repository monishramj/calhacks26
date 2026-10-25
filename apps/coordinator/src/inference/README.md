# apps/coordinator/src/inference

This folder holds the local Laya suggestions (client side), the online Claude enrichment, and the inference side of resilience.

- **Laya client:** sends a job's relevant reports and candidates to `LOCAL_LAYA_URL`. It returns a `LocalSuggestion` with `inputSignature` unchanged.
- **Claude:** one official-SDK client-tool loop with exactly `readIncident`, `readReports`, `listCandidateIncidents`, and `submitIncidentProposal`. There is no approval or dispatch tool. The code validates every argument and result. Every new factual claim cites a received source ID. Late or stale results stay reviewable and are never applied.
- **Triggers:** conflicts, ambiguous cross-incident links, a cluster of updates that needs a summary, or an explicit operator request. Repeated packets never trigger a call (§6).
