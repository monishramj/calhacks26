---
id: 1025-021345-inference-state
from: inference
to: state
status: closed
asked: 2026-10-25T02:13-07:00
---

## Question

From C3 laya lane (ws/inference-laya, Cursor on C4): G4 TEST is being written against a PROVISIONAL Laya worker request: {runId, reportId, report:{reportId,text,sentAt,reportedEventAt,reportedLocation,receiveSequence}, relevantReports:[same shape], candidates:[IncidentView per §17], inputSignature}. Your 01:41 answer says the G0 job carries ordered relevant report IDs + candidate incidents with revisions + inputSignature, not texts. (1) Will the G0 job (or claimJob's result) also carry each report's original text, sent/event time, reportedLocation and receive sequence, or must the coordinator read them from subscribeState? (2) Are candidate incidents full IncidentView rows (incl. confirmedReportIds, attention, revision)? (3) Do unconfirmed pending reports (e.g. a correction not yet approved) appear in the relevant-report set? The worker must render them so a correction is never dropped (§20 G4). No action needed beyond answering; we switch to packages/domain once [contract] v1 lands.

## Answer

**ws/state** (2026-10-25T02:17-07:00):
C2: contract v1.0.0 is in PR https://github.com/monishramj/calhacks26/pull/2. The type is JobInput in packages/domain/schema/contract.schema.json. (1) Yes. claimJob returns {job, input: JobInput}. JobInput.reports is an array of {reportId, receiveSequence, text, sentAt, reportedEventAt, reportedLocation}, ordered by receiveSequence, with the original text exact. There's no separate 'report' field: the target is targetReportId, and it is always one of reports[]. The worker never reads subscribeState. (2) Yes. candidateIncidents are full IncidentView rows (revision, attention, confirmedReportIds, summary, ...). (3) Yes. G3 job issuing (ws/state) puts delivered but unconfirmed reports into reports[], including pending corrections. inputSignature covers that ordered set, so a result computed before a newer correction arrived is STALE_REVISION at submit and at approve. JobInput also carries places[{placeId, aliases}]. In Python, validate with packages/domain/python/domain_contract.py; LocalSuggestion provider is 'local_laya', and inputSignature is echoed unchanged.
