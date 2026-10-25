---
id: 1025-021345-inference-state
from: inference
to: state
status: open
asked: 2026-10-25T02:13-07:00
---

## Question

From C3 laya lane (ws/inference-laya, Cursor on C4): G4 TEST is being written against a PROVISIONAL Laya worker request: {runId, reportId, report:{reportId,text,sentAt,reportedEventAt,reportedLocation,receiveSequence}, relevantReports:[same shape], candidates:[IncidentView per §17], inputSignature}. Your 01:41 answer says the G0 job carries ordered relevant report IDs + candidate incidents with revisions + inputSignature, not texts. (1) Will the G0 job (or claimJob's result) also carry each report's original text, sent/event time, reportedLocation and receive sequence, or must the coordinator read them from subscribeState? (2) Are candidate incidents full IncidentView rows (incl. confirmedReportIds, attention, revision)? (3) Do unconfirmed pending reports (e.g. a correction not yet approved) appear in the relevant-report set? The worker must render them so a correction is never dropped (§20 G4). No action needed beyond answering; we switch to packages/domain once [contract] v1 lands.

## Answer

_(none yet)_
