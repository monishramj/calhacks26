"""Generate the shared wire-contract corpus (G0 TEST).

Each output file test/corpus/<Type>.json holds valid and invalid payloads for one
`$defs` entry of schema/contract.schema.json. TypeScript (ajv + parseWire) and Python
(jsonschema) both run every case, so producers and consumers on either side of the
Python boundary must classify each payload the same way.

Only rules a JSON Schema can express go here. Cross-record rules (source ownership,
freshness, receive order) are tested in TypeScript against the rule functions.

Run: python3 test/corpus/make_corpus.py   (stdlib only; commit the output)
     python3 test/corpus/make_corpus.py --check   (exit 1 if committed files are stale)
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

OUT = Path(__file__).parent


def with_(base: dict, **changes) -> dict:
    out = copy.deepcopy(base)
    out.update(changes)
    return out


def at(base: dict, path: str, value) -> dict:
    out = copy.deepcopy(base)
    node = out
    keys = path.split(".")
    for k in keys[:-1]:
        node = node[int(k)] if isinstance(node, list) else node[k]
    last = keys[-1]
    if isinstance(node, list):
        node[int(last)] = value
    else:
        node[last] = value
    return out


def without(base: dict, path: str) -> dict:
    out = copy.deepcopy(base)
    node = out
    keys = path.split(".")
    for k in keys[:-1]:
        node = node[k]
    del node[keys[-1]]
    return out


RUN = "run-001"
SIG = "sig1:3f9a0c41d2e7b8a65f1e0d9c8b7a69584736251403f2e1d0c9b8a79685746352"

# --- ReportInput (§17) -------------------------------------------------------

RI_RADIO = {
    "runId": RUN,
    "sourceId": "field-team-a",
    "messageId": "msg-0001",
    "text": "School gym evacuation complete. Everyone our team checked is outside.",
    "origin": "radio",
    "sentAt": "2026-10-25T09:00:00Z",
    "reportedEventAt": None,
    "reportedLocation": {"placeId": "school", "source": "sender_explicit"},
    "transport": {
        "verification": "verified",
        "encoding": "llm",
        "measurementSource": "measured",
        "originalBytes": 70,
        "applicationPacketBytes": 41,
    },
}
NA_TRANSPORT = {
    "verification": "not_applicable",
    "encoding": "not_applicable",
    "measurementSource": "not_applicable",
    "originalBytes": None,
    "applicationPacketBytes": None,
}
RI_SCENARIO = with_(
    RI_RADIO,
    sourceId="exercise",
    messageId="R02",
    text="Shelter needs blankets for tonight.",
    origin="scenario",
    sentAt=None,
    reportedLocation=None,
    transport=NA_TRANSPORT,
)
RI_OPERATOR = with_(
    RI_RADIO,
    sourceId="desk-operator",
    messageId="op-0001",
    text="Phone call from shelter staff: blankets arrived.",
    origin="operator",
    sentAt="2026-10-25T10:15:00-07:00",
    reportedEventAt="2026-10-25T10:05:00-07:00",
    reportedLocation={"placeId": "shelter", "source": "operator"},
    transport=NA_TRANSPORT,
)

report_input = {
    "valid": [
        ("radio report, verified, measured bytes", RI_RADIO),
        ("scenario report, all times and location null", RI_SCENARIO),
        ("operator report with offset timestamps", RI_OPERATOR),
        (
            "exact unicode text with emoji, newline, and surrounding spaces",
            with_(RI_RADIO, text="  Água subindo — 2 pessoas no andar de cima 🙏\nR03  "),
        ),
        (
            "scenario run through the codec in-process: calculated bytes, unverified",
            with_(RI_SCENARIO, transport={
                "verification": "not_applicable",
                "encoding": "llm",
                "measurementSource": "calculated",
                "originalBytes": 35,
                "applicationPacketBytes": 22,
            }),
        ),
        ("raw fallback encoding over radio", at(RI_RADIO, "transport.encoding", "raw")),
        ("fractional-second UTC timestamp", with_(RI_RADIO, sentAt="2026-10-25T09:00:00.250Z")),
    ],
    "invalid": [
        ("missing runId", without(RI_RADIO, "runId")),
        ("empty runId", with_(RI_RADIO, runId="")),
        ("runId with a space", with_(RI_RADIO, runId="run 001")),
        ("runId over 128 characters", with_(RI_RADIO, runId="r" * 129)),
        ("messageId with a newline", with_(RI_RADIO, messageId="msg-0001\n")),
        ("sourceId with non-ASCII", with_(RI_RADIO, sourceId="équipe-a")),
        ("sourceId leading dash", with_(RI_RADIO, sourceId="-team")),
        ("empty text", with_(RI_RADIO, text="")),
        ("text is a number", with_(RI_RADIO, text=42)),
        ("unknown origin 'browser'", with_(RI_RADIO, origin="browser")),
        ("sentAt without T separator", with_(RI_RADIO, sentAt="2026-10-25 09:00:00Z")),
        ("sentAt without offset (ambiguous local time)", with_(RI_RADIO, sentAt="2026-10-25T09:00:00")),
        ("sentAt as epoch number", with_(RI_RADIO, sentAt=1761382800)),
        ("reportedEventAt free text", with_(RI_RADIO, reportedEventAt="yesterday")),
        ("sentAt omitted instead of explicit null", without(RI_RADIO, "sentAt")),
        ("sender-supplied receivedAt", with_(RI_RADIO, receivedAt="2026-10-25T09:00:01Z")),
        ("sender-supplied receiveSequence", with_(RI_RADIO, receiveSequence=1)),
        ("sender-supplied canonical reportId", with_(RI_RADIO, reportId="rep-000001")),
        ("location source 'gps'", at(RI_RADIO, "reportedLocation.source", "gps")),
        ("location missing placeId", without(RI_RADIO, "reportedLocation.placeId")),
        ("location with raw coordinates", at(RI_RADIO, "reportedLocation", {"placeId": "school", "source": "sender_explicit", "lat": 35.6, "lon": -82.5})),
        ("radio origin without verification", at(RI_RADIO, "transport.verification", "not_applicable")),
        ("radio origin with encoding not_applicable", at(RI_RADIO, "transport.encoding", "not_applicable")),
        ("radio origin with simulated measurement", at(RI_RADIO, "transport.measurementSource", "simulated")),
        ("scenario claims radio verification", at(RI_SCENARIO, "transport.verification", "verified")),
        ("operator claims radio verification", at(RI_OPERATOR, "transport.verification", "verified")),
        ("operator report with a codec encoding", at(RI_OPERATOR, "transport.encoding", "llm")),
        ("measured but originalBytes null", at(RI_RADIO, "transport.originalBytes", None)),
        ("not_applicable measurement but bytes present", at(RI_SCENARIO, "transport.applicationPacketBytes", 41)),
        ("negative originalBytes", at(RI_RADIO, "transport.originalBytes", -1)),
        ("fractional byte count", at(RI_RADIO, "transport.originalBytes", 1.5)),
        ("byte count as string", at(RI_RADIO, "transport.applicationPacketBytes", "41")),
        ("unknown encoding", at(RI_RADIO, "transport.encoding", "zip")),
        ("headcount field", with_(RI_RADIO, peopleCount=2)),
        ("team assignment field", with_(RI_RADIO, assignedTeam="team-2")),
        ("free-text operator identity", with_(RI_OPERATOR, operatorName="Dana")),
    ],
}

# --- Report: stored record, backend-assigned fields (§9) -----------------------

REPORT = {
    "reportId": "rep-000001",
    "receiveSequence": 1,
    "receivedAt": "2026-10-25T16:00:03.120Z",
    "provenance": "live",
    "input": RI_RADIO,
}
report = {
    "valid": [
        ("live radio report", REPORT),
        ("simulated scenario report in a live run", with_(REPORT, reportId="rep-000002", receiveSequence=2, provenance="simulated", input=RI_SCENARIO)),
        ("fixture report in replay", with_(REPORT, provenance="fixture")),
        ("recorded report", with_(REPORT, provenance="recorded")),
    ],
    "invalid": [
        ("receiveSequence 0", with_(REPORT, receiveSequence=0)),
        ("fractional receiveSequence", with_(REPORT, receiveSequence=1.5)),
        ("receiveSequence beyond int32", with_(REPORT, receiveSequence=2**31)),
        ("receivedAt null", with_(REPORT, receivedAt=None)),
        ("missing input", without(REPORT, "input")),
        ("provenance is a model provider", with_(REPORT, provenance="local_laya")),
        ("nested input invalid (unverified radio)", at(REPORT, "input.transport.verification", "not_applicable")),
        ("soft-delete flag", with_(REPORT, deleted=True)),
        ("normalized text copy", with_(REPORT, normalizedText="school gym evacuation complete")),
    ],
}

# --- IncidentView (§17) ----------------------------------------------------------

INCIDENT = {
    "runId": RUN,
    "incidentId": "inc-school",
    "revision": 1,
    "status": "OPEN",
    "attention": "INFORMATION",
    "confirmedPlaceId": "school",
    "confirmedReportIds": ["rep-000001", "rep-000005"],
    "summary": "One team checked the gym; the rest of the school is not confirmed clear.",
    "openCycleStartSequence": 1,
}
incident_view = {
    "valid": [
        ("open school incident", INCIDENT),
        ("unknown attention, place, and summary", with_(INCIDENT, attention=None, confirmedPlaceId=None, summary=None)),
        ("resolved incident", with_(INCIDENT, status="RESOLVED", revision=4)),
        ("possible life safety", with_(INCIDENT, incidentId="inc-residence", attention="POSSIBLE_LIFE_SAFETY", confirmedPlaceId="residence", confirmedReportIds=["rep-000003"], openCycleStartSequence=3)),
        ("no confirmed reports yet", with_(INCIDENT, confirmedReportIds=[])),
    ],
    "invalid": [
        ("revision 0", with_(INCIDENT, revision=0)),
        ("status CLOSED", with_(INCIDENT, status="CLOSED")),
        ("attention HIGH", with_(INCIDENT, attention="HIGH")),
        ("numeric attention", with_(INCIDENT, attention=3)),
        ("numeric urgency score field", with_(INCIDENT, urgencyScore=0.93)),
        ("duplicate confirmedReportIds", with_(INCIDENT, confirmedReportIds=["rep-000001", "rep-000001"])),
        ("openCycleStartSequence 0", with_(INCIDENT, openCycleStartSequence=0)),
        ("summary key omitted", without(INCIDENT, "summary")),
        ("team assignment", with_(INCIDENT, assignedTeam="team-2")),
        ("headcount", with_(INCIDENT, peopleCount=2)),
    ],
}

# --- LabelScore (§17) -----------------------------------------------------------

label_score = {
    "valid": [
        ("probability", {"label": "POSSIBLE_LIFE_SAFETY", "value": 0.82, "kind": "probability"}),
        ("probability bounds", {"label": "INFORMATION", "value": 0, "kind": "probability"}),
        ("raw logit kept as score, not a percentage", {"label": "ATTACH_REPORT", "value": -3.2, "kind": "score"}),
    ],
    "invalid": [
        ("probability above 1", {"label": "ACTIVE_NEED", "value": 1.2, "kind": "probability"}),
        ("probability below 0", {"label": "ACTIVE_NEED", "value": -0.1, "kind": "probability"}),
        ("kind percent", {"label": "ACTIVE_NEED", "value": 82, "kind": "percent"}),
        ("value as string", {"label": "ACTIVE_NEED", "value": "0.8", "kind": "probability"}),
        ("empty label", {"label": "", "value": 0.5, "kind": "probability"}),
        ("missing kind", {"label": "ACTIVE_NEED", "value": 0.5}),
    ],
}

# --- LocalSuggestion (§17) ------------------------------------------------------

LS = {
    "runId": RUN,
    "reportId": "rep-000007",
    "action": "FLAG_CORRECTION",
    "candidateIncidentId": "inc-school",
    "attention": "POSSIBLE_LIFE_SAFETY",
    "scores": [
        {"label": "POSSIBLE_LIFE_SAFETY", "value": 0.61, "kind": "probability"},
        {"label": "INFORMATION", "value": 0.39, "kind": "probability"},
    ],
    "evidenceReportIds": ["rep-000007", "rep-000001"],
    "baseIncidentVersions": {"inc-school": 2},
    "inputSignature": SIG,
    "provider": "local_laya",
}
local_suggestion = {
    "valid": [
        ("flag correction on the school", LS),
        ("new incident has no candidate", with_(LS, action="NEW_INCIDENT", candidateIncidentId=None, baseIncidentVersions={})),
        ("request review with unknowns and no scores", with_(LS, action="REQUEST_REVIEW", candidateIncidentId=None, attention=None, scores=[], baseIncidentVersions={})),
        ("attach report", with_(LS, action="ATTACH_REPORT")),
        ("flag conflict", with_(LS, action="FLAG_CONFLICT")),
        ("recorded output with recording provenance", with_(LS, provider="recording")),
        ("fixture output (replay only)", with_(LS, provider="fixture")),
    ],
    "invalid": [
        ("NEW_INCIDENT with a candidate", with_(LS, action="NEW_INCIDENT")),
        ("ATTACH_REPORT without a candidate", with_(LS, action="ATTACH_REPORT", candidateIncidentId=None)),
        ("FLAG_CORRECTION without a candidate", with_(LS, candidateIncidentId=None)),
        ("FLAG_CONFLICT without a candidate", with_(LS, action="FLAG_CONFLICT", candidateIncidentId=None)),
        ("candidate missing from baseIncidentVersions", with_(LS, baseIncidentVersions={"inc-shelter": 1})),
        ("unknown action DELETE_REPORT", with_(LS, action="DELETE_REPORT")),
        ("provider claude for a local suggestion", with_(LS, provider="claude")),
        ("provider operator for a local suggestion", with_(LS, provider="operator")),
        ("negative base version", with_(LS, baseIncidentVersions={"inc-school": -1})),
        ("fractional base version", with_(LS, baseIncidentVersions={"inc-school": 1.5})),
        ("invalid incident id key", with_(LS, baseIncidentVersions={"inc school": 2})),
        ("empty inputSignature", with_(LS, inputSignature="")),
        ("nested probability out of range", at(LS, "scores.0.value", 1.5)),
        ("attention URGENT", with_(LS, attention="URGENT")),
        ("confidence field next to attention", with_(LS, confidence=0.61)),
        ("duplicate evidence ids", with_(LS, evidenceReportIds=["rep-000007", "rep-000007"])),
    ],
}

# --- ClaudeCheck (v1.4.0): Claude's own read of a report Laya suggested on ------------

CC = {
    "runId": RUN,
    "reportId": "rep-000007",
    "action": "ATTACH_REPORT",
    "candidateIncidentId": "inc-school",
    "attention": "INFORMATION",
    "evidenceReportIds": ["rep-000007", "rep-000001"],
    "summary": "The school gym is clear; status only.",
    "reason": "Same school gym; status only.",
    "baseIncidentVersions": {"inc-school": 2},
    "inputSignature": SIG,
    "model": "claude-test",
    "provider": "claude",
}
claude_check = {
    "valid": [
        ("attach to the school as information", CC),
        ("new incident with no candidate", with_(CC, action="NEW_INCIDENT", candidateIncidentId=None, baseIncidentVersions={})),
        ("possible life safety, no reason", with_(CC, attention="POSSIBLE_LIFE_SAFETY", reason=None)),
        ("request review with unknown attention", with_(CC, action="REQUEST_REVIEW", candidateIncidentId=None, attention=None)),
    ],
    "invalid": [
        ("no cited reports", with_(CC, evidenceReportIds=[])),
        ("NEW_INCIDENT with a candidate", with_(CC, action="NEW_INCIDENT")),
        ("FLAG_CONFLICT without a candidate", with_(CC, action="FLAG_CONFLICT", candidateIncidentId=None)),
        ("candidate missing from baseIncidentVersions", with_(CC, baseIncidentVersions={"inc-shelter": 1})),
        ("provider local_laya", with_(CC, provider="local_laya")),
        ("an approve field", with_(CC, approve=True)),
        ("scores on a Claude check", with_(CC, scores=[])),
        ("no summary", without(CC, "summary")),
        ("summary over 140 characters", with_(CC, summary="x" * 141)),
    ],
}
CCR = {"check": CC, "outcome": "AUTO_CONFIRMED", "reason": "Laya and Claude agree: add to inc-school, information."}
claude_check_record = {
    "valid": [
        ("confirmed without a person", CCR),
        ("sent to a person", with_(CCR, outcome="SENT_TO_PERSON", reason="Possible life safety, so a person decides.")),
    ],
    "invalid": [
        ("unknown outcome", with_(CCR, outcome="APPROVED")),
        ("empty reason", with_(CCR, reason="")),
        ("reason over 140 characters", with_(CCR, reason="x" * 141)),
    ],
}

# --- IncidentProposal (§17) -----------------------------------------------------

IP = {
    "runId": RUN,
    "proposalId": "prop-0001",
    "incidentId": "inc-school",
    "baseIncidentVersions": {"inc-school": 2, "inc-residence": 1},
    "inputSignature": SIG,
    "addReportIds": ["rep-000007"],
    "relations": [{"reportId": "rep-000007", "targetReportId": "rep-000001", "kind": "CORRECTION"}],
    "suggestedStatus": None,
    "suggestedAttention": "POSSIBLE_LIFE_SAFETY",
    "suggestedSummary": "Gym reported clear; someone may still be upstairs in the main building (unconfirmed).",
    "evidenceReportIds": ["rep-000007", "rep-000001"],
    "uncertainties": ["No one has confirmed a person in the main building."],
    "provider": "claude",
}
IP_OPERATOR_NEW = with_(
    IP,
    proposalId="prop-op-0001",
    incidentId="inc-new-1",
    baseIncidentVersions={"inc-new-1": 0},
    relations=[],
    suggestedStatus="OPEN",
    suggestedSummary=None,
    evidenceReportIds=["rep-000007"],
    uncertainties=[],
    provider="operator",
)
incident_proposal = {
    "valid": [
        ("claude proposal across two incidents", IP),
        ("operator-authored new incident (base version 0)", IP_OPERATOR_NEW),
        ("no suggested changes besides adding a report", with_(IP, suggestedAttention=None, suggestedSummary=None, relations=[])),
        ("recorded proposal", with_(IP, provider="recording")),
    ],
    "invalid": [
        ("baseIncidentVersions omits the target incident", with_(IP, baseIncidentVersions={"inc-residence": 1})),
        ("relation to itself", at(IP, "relations.0.targetReportId", "rep-000007")),
        ("unknown relation kind", at(IP, "relations.0.kind", "DUPLICATE_DELETE")),
        ("summary without evidence", with_(IP, evidenceReportIds=[])),
        ("provider local_laya", with_(IP, provider="local_laya")),
        ("suggestedStatus CLOSED", with_(IP, suggestedStatus="CLOSED")),
        ("deletes reports", with_(IP, removeReportIds=["rep-000008"])),
        ("sums headcounts", with_(IP, peopleCount=3)),
        ("fabricates a location", with_(IP, suggestedPlaceId="school")),
        ("empty uncertainty string", with_(IP, uncertainties=[""])),
        ("duplicate addReportIds", with_(IP, addReportIds=["rep-000007", "rep-000007"])),
        ("self-approval flag", with_(IP, approved=True)),
    ],
}

# --- ReportRelation (§9) --------------------------------------------------------

REL = {
    "runId": RUN,
    "relationId": "rel-0001",
    "reportId": "rep-000004",
    "targetReportId": "rep-000002",
    "kind": "REPEAT",
    "incidentId": "inc-shelter",
    "state": "PROVISIONAL",
    "proposalId": "prop-0002",
    "reviewer": None,
}
report_relation = {
    "valid": [
        ("provisional repeat", REL),
        ("confirmed with backend reviewer identity", with_(REL, state="CONFIRMED", reviewer="id:c20000ab")),
        ("operator relation without proposal", with_(REL, state="CONFIRMED", reviewer="id:c20000ab", proposalId=None)),
    ],
    "invalid": [
        ("confirmed without reviewer", with_(REL, state="CONFIRMED")),
        ("provisional with reviewer", with_(REL, reviewer="id:c20000ab")),
        ("relation to itself", with_(REL, targetReportId="rep-000004")),
        ("kind MERGE", with_(REL, kind="MERGE")),
        ("state AUTO", with_(REL, state="AUTO")),
    ],
}

# --- Stored suggestion / proposal records (§9 InferenceProposal) ----------------

SUG_REC = {"suggestionId": "sug-0001", "jobId": "job-0001", "reviewState": "PENDING", "suggestion": LS}
PROP_REC = {"jobId": "job-0002", "submittedByRole": "worker", "reviewState": "PENDING", "proposal": IP}
suggestion_record = {
    "valid": [
        ("pending Laya suggestion", SUG_REC),
        ("stale after new evidence", with_(SUG_REC, reviewState="STALE")),
    ],
    "invalid": [
        ("auto-approved", with_(SUG_REC, reviewState="AUTO_APPROVED")),
        ("no job id", with_(SUG_REC, jobId=None)),
        ("nested suggestion invalid", at(SUG_REC, "suggestion.action", "NEW_INCIDENT")),
    ],
}
proposal_record = {
    "valid": [
        ("pending Claude proposal", PROP_REC),
        ("approved", with_(PROP_REC, reviewState="APPROVED")),
        ("operator-authored, no job", with_(PROP_REC, jobId=None, submittedByRole="operator", proposal=IP_OPERATOR_NEW)),
    ],
    "invalid": [
        ("worker submits an operator-provider proposal", with_(PROP_REC, proposal=IP_OPERATOR_NEW)),
        ("operator submits a claude-provider proposal", with_(PROP_REC, submittedByRole="operator")),
        ("auto-approved", with_(PROP_REC, reviewState="AUTO_APPROVED")),
        ("unknown submitter role", with_(PROP_REC, submittedByRole="claude")),
    ],
}

# --- Job (§9) ---------------------------------------------------------------------

JOB = {
    "runId": RUN,
    "jobId": "job-0001",
    "kind": "LOCAL_SUGGESTION",
    "reportId": "rep-000007",
    "incidentId": None,
    "baseIncidentVersions": {"inc-school": 2},
    "inputSignature": SIG,
    "state": "QUEUED",
    "attempts": 0,
    "claim": None,
}
CLAIM = {"workerIdentity": "id:w0000001", "leaseExpiresAt": "2026-10-25T16:05:00Z"}
job = {
    "valid": [
        ("queued local suggestion", JOB),
        ("claimed with lease", with_(JOB, state="CLAIMED", attempts=1, claim=CLAIM)),
        ("incident proposal job", with_(JOB, jobId="job-0002", kind="INCIDENT_PROPOSAL", reportId=None, incidentId="inc-school")),
        ("invalidated by reset", with_(JOB, state="INVALIDATED")),
        ("done", with_(JOB, state="DONE", attempts=1)),
        ("Claude check of a Laya suggestion", with_(JOB, kind="LOCAL_CHECK")),
    ],
    "invalid": [
        ("claimed without claim", with_(JOB, state="CLAIMED")),
        ("queued but claimed", with_(JOB, claim=CLAIM)),
        ("local suggestion without report", with_(JOB, reportId=None)),
        ("Claude check without report", with_(JOB, kind="LOCAL_CHECK", reportId=None)),
        ("incident proposal without incident", with_(JOB, kind="INCIDENT_PROPOSAL", reportId=None)),
        ("negative attempts", with_(JOB, attempts=-1)),
        ("state RUNNING", with_(JOB, state="RUNNING")),
        ("kind DISPATCH", with_(JOB, kind="DISPATCH")),
        ("missing inputSignature", without(JOB, "inputSignature")),
        ("negative base version", with_(JOB, baseIncidentVersions={"inc-school": -1})),
    ],
}

# --- Claude working picture (v1.3.0): unconfirmed, area -> site -> subarea -> claims ----

def pnode(label, reports, **extra):
    return {"label": label, "severity": None, "chronology": [], "uncertainties": [], "conflicts": [], "reportIds": reports, **extra}

GYM = pnode("gym", ["rep-000001", "rep-000007"], severity="INFORMATION",
            chronology=[{"reportId": "rep-000001", "supersedesReportId": None, "late": False},
                        {"reportId": "rep-000007", "supersedesReportId": "rep-000001", "late": False}],
            claims=[{"text": "Gym is clear: the correction says everyone checked is outside.", "reportIds": ["rep-000007"]}])
MAIN = pnode("main building", ["rep-000007"], severity="POSSIBLE_LIFE_SAFETY",
             chronology=[{"reportId": "rep-000007", "supersedesReportId": None, "late": False}],
             uncertainties=["Search of the main building is not complete."],
             claims=[{"text": "Someone may still be upstairs in the main building.", "reportIds": ["rep-000007"]}])
SCHOOL = pnode("school", ["rep-000001", "rep-000007"], severity="POSSIBLE_LIFE_SAFETY", siteKind="school",
               subareas=[GYM, MAIN])
PICTURE_DRAFT = {"runId": RUN, "incidentId": "inc-school", "model": "claude-test",
                 "areas": [pnode("Waterfront", ["rep-000001", "rep-000007"], sites=[SCHOOL])]}
PICTURE = {**PICTURE_DRAFT, "status": "CURRENT", "staleSinceReportId": None, "throughSequence": 7}
picture_draft = {
    "valid": [("school gym clear, main building possible person upstairs", PICTURE_DRAFT)],
    "invalid": [
        ("claim cites a report outside its node", at(PICTURE_DRAFT, "areas.0.sites.0.subareas.1.claims.0.reportIds", ["rep-000001"])),
        ("chronology supersedes a report outside its node", at(PICTURE_DRAFT, "areas.0.sites.0.subareas.0.chronology.1.supersedesReportId", "rep-000099")),
        ("unknown severity word", at(PICTURE_DRAFT, "areas.0.sites.0.severity", "HIGH")),
        ("a status field on the draft", with_(PICTURE_DRAFT, status="CURRENT")),
        ("a claim with no cited report", at(PICTURE_DRAFT, "areas.0.sites.0.subareas.1.claims.0.reportIds", [])),
    ],
}
incident_picture = {
    "valid": [("current picture through R07", PICTURE), ("stale since R08", with_(PICTURE, status="STALE", staleSinceReportId="rep-000008"))],
    "invalid": [("unknown status", with_(PICTURE, status="PAUSED")), ("missing throughSequence", without(PICTURE, "throughSequence"))],
}
submit_picture = {
    "valid": [("worker submits a picture for its job", {"jobId": "job-0001", "picture": PICTURE_DRAFT})],
    "invalid": [("no job", {"jobId": None, "picture": PICTURE_DRAFT})],
}

# --- JobInput: what a worker (Laya / Claude) receives ------------------------------


def job_report(report_id: str, seq: int, text: str, sent=None, place=None):
    return {
        "reportId": report_id,
        "receiveSequence": seq,
        "text": text,
        "sentAt": sent,
        "reportedEventAt": None,
        "reportedLocation": None if place is None else {"placeId": place, "source": "sender_explicit"},
    }


JOB_INPUT = {
    "runId": RUN,
    "jobId": "job-0001",
    "kind": "LOCAL_SUGGESTION",
    "inputSignature": SIG,
    "targetReportId": "rep-000007",
    "incidentId": None,
    "reports": [
        job_report("rep-000001", 1, "School gym evacuation complete. Everyone our team checked is outside.", "2026-10-25T09:00:00Z", "school"),
        job_report("rep-000007", 7, "Correction: the school gym is clear, but someone may still be upstairs in the main building.", "2026-10-25T09:40:00Z"),
    ],
    "candidateIncidents": [with_(INCIDENT, revision=2)],
    "places": [
        {"placeId": "school", "aliases": ["school gym", "school sports hall", "school main building"]},
        {"placeId": "residence", "aliases": ["house beside the school"]},
        {"placeId": "shelter", "aliases": []},
    ],
    "candidatePictures": [],
}
job_input = {
    "valid": [
        ("local suggestion job", JOB_INPUT),
        ("incident proposal job", with_(JOB_INPUT, kind="INCIDENT_PROPOSAL", targetReportId=None, incidentId="inc-school")),
        ("no candidates yet", with_(JOB_INPUT, candidateIncidents=[])),
        ("Claude check job", with_(JOB_INPUT, kind="LOCAL_CHECK")),
        ("with the latest working picture as context", with_(JOB_INPUT, kind="INCIDENT_PROPOSAL", targetReportId=None, incidentId="inc-school", candidatePictures=[PICTURE])),
    ],
    "invalid": [
        ("expected label smuggled into a report", at(JOB_INPUT, "reports.1", with_(JOB_INPUT["reports"][1], expectedAttention="POSSIBLE_LIFE_SAFETY"))),
        ("expectations block", with_(JOB_INPUT, expectations={"R07": "School correction"})),
        ("future reports", with_(JOB_INPUT, futureReports=[{"messageId": "R08"}])),
        ("scenario script", with_(JOB_INPUT, script=[{"messageId": "R08"}])),
        ("desired ranking", with_(JOB_INPUT, desiredQueue=["inc-school", "inc-residence"])),
        ("report missing receiveSequence (undelivered)", at(JOB_INPUT, "reports.0", without(JOB_INPUT["reports"][0], "receiveSequence"))),
        ("local suggestion with no reports", with_(JOB_INPUT, reports=[])),
        ("local suggestion without target", with_(JOB_INPUT, targetReportId=None)),
        ("Claude check without target", with_(JOB_INPUT, kind="LOCAL_CHECK", targetReportId=None)),
        ("place with coordinates of a real geocode", at(JOB_INPUT, "places.0", {"placeId": "school", "aliases": [], "lat": 35.6})),
    ],
}


# --- ReviewEvent (§9) -------------------------------------------------------------

RE = {
    "runId": RUN,
    "sequence": 1,
    "commandId": "cmd-0001",
    "actorRole": "operator",
    "actorIdentity": "id:c20000ab",
    "incidentId": "inc-school",
    "proposalId": "prop-0001",
    "priorRevision": 2,
    "newRevision": 3,
    "acceptedChanges": ["attention", "addReportIds", "relations"],
    "reason": None,
    "sourceReportIds": ["rep-000007"],
}
review_event = {
    "valid": [
        ("approval of a proposal", RE),
        ("manual override with a reason", with_(RE, proposalId=None, reason="Presenter confirmed possible person upstairs.", sourceReportIds=[])),
        ("manual override citing sources only", with_(RE, proposalId=None)),
        ("incident creation from revision 0", with_(RE, priorRevision=0, newRevision=1, acceptedChanges=["status", "addReportIds"])),
        ("auto-confirmed after Claude agreed with Laya", with_(RE, actorRole="claude_check", proposalId=None, reason="Claude and Laya agreed: attach, information.")),
    ],
    "invalid": [
        ("worker actor", with_(RE, actorRole="worker")),
        ("claude actor", with_(RE, actorRole="claude")),
        ("laya actor", with_(RE, actorRole="local_laya")),
        ("manual override without reason or sources", with_(RE, proposalId=None, sourceReportIds=[])),
        ("empty reason string", with_(RE, proposalId=None, reason="", sourceReportIds=[])),
        ("sequence 0", with_(RE, sequence=0)),
        ("unknown accepted change", with_(RE, acceptedChanges=["deleteReport"])),
        ("free-text actor name", with_(RE, actorName="Dana")),
    ],
}

# --- ScenarioState: the client-visible part of §9 Scenario --------------------------

SCEN = {
    "runId": RUN,
    "exerciseVersion": "exercise-v1",
    "seed": "seed-001",
    "logicalClock": 6,
    "deliveredCount": 6,
    "totalCount": 12,
    "awaitingPresenter": True,
    "nextGate": "SEND_NEXT_REPORT",
}
scenario_state = {
    "valid": [
        ("waiting on presenter before R07", SCEN),
        ("finished", with_(SCEN, logicalClock=12, deliveredCount=12, awaitingPresenter=False, nextGate=None)),
    ],
    "invalid": [
        ("next report text", with_(SCEN, nextText="Correction: the school gym is clear...")),
        ("next message id", with_(SCEN, nextMessageId="R07")),
        ("script", with_(SCEN, script=[])),
        ("expectations", with_(SCEN, expectations={})),
        ("timer gate", with_(SCEN, nextGate="TIMER")),
        ("delay", with_(SCEN, nextDelayMs=5000)),
        ("negative delivered", with_(SCEN, deliveredCount=-1)),
    ],
}

# --- ContractError ------------------------------------------------------------------

contract_error = {
    "valid": [
        ("stale revision", {"code": "STALE_REVISION", "message": "Incident inc-school is at revision 3; the proposal was based on 2."}),
        *[(f"code {c}", {"code": c, "message": "x"}) for c in ["INVALID_SOURCE", "INVALID_INPUT", "UNAUTHORIZED", "WRONG_RUN", "SERVICE_UNAVAILABLE"]],
    ],
    "invalid": [
        ("unknown code", {"code": "NOT_FOUND", "message": "x"}),
        ("embedded provider response", {"code": "SERVICE_UNAVAILABLE", "message": "Claude failed", "providerResponse": {"error": "overloaded"}}),
        ("message over 500 characters", {"code": "INVALID_INPUT", "message": "x" * 501}),
        ("empty message", {"code": "INVALID_INPUT", "message": ""}),
    ],
}

# --- Commands (§17 adapter) ----------------------------------------------------------

APPROVE = {"commandId": "cmd-0001", "runId": RUN, "proposalId": "prop-0001", "inputSignature": SIG, "baseIncidentVersions": {"inc-school": 2, "inc-residence": 1}}
REJECT = {"commandId": "cmd-0002", "runId": RUN, "proposalId": "prop-0001", "reason": "The summary overstates the gym report."}
EDIT = {"commandId": "cmd-0003", "runId": RUN, "incidentId": "inc-school", "baseRevision": 3, "changes": {"attention": "POSSIBLE_LIFE_SAFETY"}, "reason": "Possible person upstairs in the main building (R07).", "sourceReportIds": ["rep-000007"]}
CLAIM_CMD = {"runId": RUN, "kinds": ["LOCAL_SUGGESTION"]}
SUBMIT_LS = {"jobId": "job-0001", "suggestion": LS}
SUBMIT_IP = {"jobId": "job-0002", "proposal": IP}
ADVANCE = {"commandId": "cmd-0004", "runId": RUN, "expectedDeliveredCount": 6}
RESET = {"commandId": "cmd-0005", "runId": RUN}

commands = {
    "ApproveProposalCommand": {
        "valid": [("approve with the versions the operator saw", APPROVE)],
        "invalid": [
            ("missing commandId", without(APPROVE, "commandId")),
            ("client-supplied operator id", with_(APPROVE, operatorId="op-1")),
            ("approvedBy field", with_(APPROVE, approvedBy="claude")),
            ("missing inputSignature", without(APPROVE, "inputSignature")),
        ],
    },
    "RejectProposalCommand": {
        "valid": [("reject with reason", REJECT)],
        "invalid": [("empty reason", with_(REJECT, reason="")), ("missing reason", without(REJECT, "reason"))],
    },
    "OperatorEditCommand": {
        "valid": [
            ("attention override with reason and sources", EDIT),
            ("resolve with reason only", with_(EDIT, changes={"status": "RESOLVED"}, sourceReportIds=[])),
            ("attach a report citing it", with_(EDIT, changes={"addReportIds": ["rep-000008"]}, reason=None, sourceReportIds=["rep-000008"])),
            ("set summary and place", with_(EDIT, changes={"summary": "Main building search not complete.", "confirmedPlaceId": "school"})),
        ],
        "invalid": [
            ("no changes", with_(EDIT, changes={})),
            ("no reason and no sources", with_(EDIT, reason=None, sourceReportIds=[])),
            ("attention CRITICAL", with_(EDIT, changes={"attention": "CRITICAL"})),
            ("numeric priority", with_(EDIT, changes={"priority": 1})),
            ("delete reports", with_(EDIT, changes={"deleteReportIds": ["rep-000008"]})),
            ("negative baseRevision", with_(EDIT, baseRevision=-1)),
            ("free-text operator name", with_(EDIT, operatorName="Dana")),
        ],
    },
    "ClaimJobCommand": {
        "valid": [("claim local suggestion jobs", CLAIM_CMD), ("claim both kinds", with_(CLAIM_CMD, kinds=["LOCAL_SUGGESTION", "INCIDENT_PROPOSAL"]))],
        "invalid": [
            ("client-supplied workerId", with_(CLAIM_CMD, workerId="w1")),
            ("no kinds", with_(CLAIM_CMD, kinds=[])),
            ("unknown kind", with_(CLAIM_CMD, kinds=["DISPATCH"])),
        ],
    },
    "SubmitLocalSuggestionCommand": {
        "valid": [("submit for a job", SUBMIT_LS)],
        "invalid": [
            ("missing jobId", without(SUBMIT_LS, "jobId")),
            ("invalid suggestion", at(SUBMIT_LS, "suggestion.provider", "claude")),
            ("self-approval", with_(SUBMIT_LS, approve=True)),
        ],
    },
    "SubmitIncidentProposalCommand": {
        "valid": [("worker proposal for a job", SUBMIT_IP), ("operator proposal without a job", with_(SUBMIT_IP, jobId=None, proposal=IP_OPERATOR_NEW))],
        "invalid": [
            ("auto-approve flag", with_(SUBMIT_IP, autoApprove=True)),
            ("invalid proposal", at(SUBMIT_IP, "proposal.provider", "local_laya")),
        ],
    },
    "AdvanceScenarioCommand": {
        "valid": [("presenter sends next report", ADVANCE)],
        "invalid": [
            ("timer delay", with_(ADVANCE, delayMs=5000)),
            ("after seconds", with_(ADVANCE, afterSeconds=3)),
            ("negative expected count", with_(ADVANCE, expectedDeliveredCount=-1)),
            ("missing commandId", without(ADVANCE, "commandId")),
        ],
    },
    "SubmitIncidentPictureCommand": submit_picture,
    "SubmitClaudeCheckCommand": {
        "valid": [("worker submits a check for its job", {"jobId": "job-0003", "check": CC})],
        "invalid": [
            ("no job", {"jobId": None, "check": CC}),
            ("check candidate missing from baseIncidentVersions", {"jobId": "job-0003", "check": with_(CC, baseIncidentVersions={})}),
        ],
    },
    "ResetRunCommand": {
        "valid": [("reset the current run", RESET)],
        "invalid": [
            ("merge replay decisions back", with_(RESET, mergeReplay=True)),
            ("missing runId", without(RESET, "runId")),
        ],
    },
}

ALL = {
    "ReportInput": report_input,
    "Report": report,
    "IncidentView": incident_view,
    "LabelScore": label_score,
    "LocalSuggestion": local_suggestion,
    "ClaudeCheck": claude_check,
    "ClaudeCheckRecord": claude_check_record,
    "IncidentProposal": incident_proposal,
    "ReportRelation": report_relation,
    "SuggestionRecord": suggestion_record,
    "ProposalRecord": proposal_record,
    "Job": job,
    "JobInput": job_input,
    "IncidentPictureDraft": picture_draft,
    "IncidentPicture": incident_picture,
    "ReviewEvent": review_event,
    "ScenarioState": scenario_state,
    "ContractError": contract_error,
    **commands,
}


# Invalid cases whose rule compares two fields, which JSON Schema cannot express.
# The raw-schema checks skip these; validateWire (TS) and domain_contract.validate
# (Python) must still reject them. Listed in the schema's x-crossFieldRules.
CROSS_FIELD = {
    ("LocalSuggestion", "candidate missing from baseIncidentVersions"),
    ("ClaudeCheck", "candidate missing from baseIncidentVersions"),
    ("SubmitClaudeCheckCommand", "check candidate missing from baseIncidentVersions"),
    ("IncidentProposal", "baseIncidentVersions omits the target incident"),
    ("IncidentProposal", "relation to itself"),
    ("ReportRelation", "relation to itself"),
    ("IncidentPictureDraft", "claim cites a report outside its node"),
    ("IncidentPictureDraft", "chronology supersedes a report outside its node"),
}


def render() -> dict[str, str]:
    out = {}
    for name, cases in ALL.items():
        doc = {
            "type": name,
            "generatedBy": "test/corpus/make_corpus.py",
            "valid": [{"name": n, "payload": p} for n, p in cases["valid"]],
            "invalid": [
                {"name": n, "payload": p, **({"crossField": True} if (name, n) in CROSS_FIELD else {})}
                for n, p in cases["invalid"]
            ],
        }
        out[f"{name}.json"] = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    return out


def main() -> None:
    files = render()
    if "--check" in sys.argv:
        stale = [n for n, text in files.items() if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != text]
        sys.exit(1 if stale else 0)
    for n, text in files.items():
        (OUT / n).write_text(text, encoding="utf-8")
    tagged = {(d, c) for d, cs in ALL.items() for c, _ in cs["invalid"]}
    assert CROSS_FIELD <= tagged, CROSS_FIELD - tagged
    print(f"wrote {len(ALL)} corpus files")


if __name__ == "__main__":
    main()
