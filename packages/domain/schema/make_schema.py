"""Generate schema/contract.schema.json, the committed wire contract (§17).

TypeScript (src/validate.ts) and Python (python/domain_contract.py) both validate
against the generated file. Rules that JSON Schema cannot express (comparing two
fields) live in both validators as CROSS_FIELD rules; see packages/domain/README.md.

Run: python3 schema/make_schema.py           (writes the file)
     python3 schema/make_schema.py --check   (exit 1 if the committed file is stale)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path(__file__).parent / "contract.schema.json"

CONTRACT_VERSION = "1.0.0"
MAX_ID_LENGTH = 128
# Authored bound, not a measured one: ~4x the 233-byte packet ceiling so llm-coded
# radio text fits, while operator text stays short. Revisit with C1's measured ratio.
MAX_REPORT_TEXT_BYTES = 1000
MAX_SHORT_TEXT = 500
# Boundary limits for wire text from another process: checked before/while parsing.
MAX_WIRE_BYTES = 1_048_576
MAX_DEPTH = 16
MAX_SUMMARY = 2000
INT32_MAX = 2**31 - 1

# `(?![\s\S])` instead of `$`: Python's re.search lets `$` match before a trailing
# newline, ECMAScript doesn't. This form means "true end of string" in both.
END = r"(?![\s\S])"
ID = {"type": "string", "minLength": 1, "maxLength": MAX_ID_LENGTH,
      "pattern": r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}" + END}
TIMESTAMP = {"type": "string", "maxLength": 40,
             "pattern": r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})" + END}
TEXT = {"type": "string", "minLength": 1, "maxLength": MAX_REPORT_TEXT_BYTES}
SHORT_TEXT = {"type": "string", "minLength": 1, "maxLength": MAX_SHORT_TEXT}
SUMMARY = {"type": "string", "minLength": 1, "maxLength": MAX_SUMMARY}
COUNT = {"type": "integer", "minimum": 0, "maximum": INT32_MAX}
POSITIVE = {"type": "integer", "minimum": 1, "maximum": INT32_MAX}
NULL = {"type": "null"}


def described(s: dict, text: str) -> dict:
    return {**s, "description": text}


SENT_AT = described(TIMESTAMP, "Sender's clock when the report was sent (RFC 3339). Unverified; null if unknown.")
EVENT_AT = described(TIMESTAMP, "Time the report says the event happened (RFC 3339). Null if the report gives none.")
RECEIVED_AT = described(TIMESTAMP, "Backend receive time (RFC 3339, backend clock). Never sender-supplied.")
LEASE_AT = described(TIMESTAMP, "Backend time when the worker's claim lapses (RFC 3339).")

ATTENTION = ["POSSIBLE_LIFE_SAFETY", "ACTIVE_NEED", "INFORMATION"]
LOCAL_ACTIONS = ["NEW_INCIDENT", "ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT", "REQUEST_REVIEW"]
RELATION_KINDS = ["REPEAT", "UPDATE", "CORRECTION", "CONFLICT"]
ERROR_CODES = ["STALE_REVISION", "INVALID_SOURCE", "INVALID_INPUT", "UNAUTHORIZED", "WRONG_RUN", "SERVICE_UNAVAILABLE"]
REVIEW_STATES = ["PENDING", "APPROVED", "REJECTED", "STALE"]
JOB_KINDS = ["LOCAL_SUGGESTION", "INCIDENT_PROPOSAL"]
JOB_STATES = ["QUEUED", "CLAIMED", "DONE", "FAILED", "INVALIDATED"]
CHANGE_FIELDS = ["status", "attention", "confirmedPlaceId", "summary", "addReportIds", "relations"]


def ref(name: str) -> dict:
    return {"$ref": f"#/$defs/{name}"}


def nullable(s: dict) -> dict:
    return {"anyOf": [s, NULL]}


def enum(values: list[str]) -> dict:
    return {"type": "string", "enum": values}


def ids(max_items: int = 256, **extra) -> dict:
    return {"type": "array", "items": ID, "uniqueItems": True, "maxItems": max_items, **extra}


def closed(props: dict, *rules: dict) -> dict:
    out = {"type": "object", "additionalProperties": False, "required": sorted(props), "properties": props}
    if rules:
        out["allOf"] = list(rules)
    return out


def when(cond: dict, then: dict, otherwise: dict | None = None) -> dict:
    rule = {"if": {"properties": cond, "required": sorted(cond)}, "then": {"properties": then}}
    if otherwise is not None:
        rule["else"] = {"properties": otherwise}
    return rule


VERSIONS = {"type": "object", "propertyNames": ID, "maxProperties": 64,
            "additionalProperties": {"type": "integer", "minimum": 0, "maximum": INT32_MAX}}
LOCATION = closed({"placeId": ID, "source": enum(["sender_explicit", "operator"])})
TRANSPORT = closed(
    {
        "verification": enum(["verified", "not_applicable"]),
        "encoding": enum(["raw", "lightweight", "llm", "not_applicable"]),
        "measurementSource": enum(["measured", "calculated", "simulated", "not_applicable"]),
        "originalBytes": nullable(COUNT),
        "applicationPacketBytes": nullable(COUNT),
    },
    when(
        {"measurementSource": {"const": "not_applicable"}},
        {"originalBytes": NULL, "applicationPacketBytes": NULL},
        {"originalBytes": {"type": "integer"}, "applicationPacketBytes": {"type": "integer"}},
    ),
)

defs: dict[str, dict] = {}

defs["ReportInput"] = closed(
    {
        "runId": ID,
        "sourceId": ID,
        "messageId": ID,
        "text": TEXT,
        "origin": enum(["radio", "scenario", "operator"]),
        "sentAt": nullable(SENT_AT),
        "reportedEventAt": nullable(EVENT_AT),
        "reportedLocation": nullable(LOCATION),
        "transport": TRANSPORT,
    },
    # Radio input must come verified and measured from the bridge; nothing else may claim verification.
    when(
        {"origin": {"const": "radio"}},
        {"transport": {"properties": {
            "verification": {"const": "verified"},
            "measurementSource": {"const": "measured"},
            "encoding": enum(["raw", "lightweight", "llm"]),
        }}},
        {"transport": {"properties": {"verification": {"const": "not_applicable"}}}},
    ),
    when({"origin": {"const": "operator"}}, {"transport": {"properties": {"encoding": {"const": "not_applicable"}}}}),
)

defs["Report"] = closed({
    "reportId": ID,
    "receiveSequence": described(POSITIVE, "Backend-assigned, monotonic per run. The only receive order."),
    "receivedAt": RECEIVED_AT,
    "provenance": enum(["live", "simulated", "recorded", "fixture"]),
    "input": ref("ReportInput"),
})

defs["IncidentView"] = closed({
    "runId": ID,
    "incidentId": ID,
    "revision": POSITIVE,
    "status": enum(["OPEN", "RESOLVED"]),
    "attention": nullable(enum(ATTENTION)),
    "confirmedPlaceId": nullable(ID),
    "confirmedReportIds": ids(),
    "summary": nullable(SUMMARY),
    "openCycleStartSequence": POSITIVE,
})

defs["LabelScore"] = closed(
    {"label": {"type": "string", "minLength": 1, "maxLength": 64}, "value": {"type": "number"}, "kind": enum(["probability", "score"])},
    when({"kind": {"const": "probability"}}, {"value": {"minimum": 0, "maximum": 1}}),
)

defs["LocalSuggestion"] = closed(
    {
        "runId": ID,
        "reportId": ID,
        "action": enum(LOCAL_ACTIONS),
        "candidateIncidentId": nullable(ID),
        "attention": nullable(enum(ATTENTION)),
        "scores": {"type": "array", "items": ref("LabelScore"), "maxItems": 64},
        "evidenceReportIds": ids(),
        "baseIncidentVersions": VERSIONS,
        "inputSignature": ID,
        "provider": enum(["local_laya", "recording", "fixture"]),
    },
    when({"action": {"const": "NEW_INCIDENT"}}, {"candidateIncidentId": NULL}),
    when({"action": enum(["ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT"])}, {"candidateIncidentId": ID}),
)

RELATION = closed({"reportId": ID, "targetReportId": ID, "kind": enum(RELATION_KINDS)})
defs["IncidentProposal"] = closed(
    {
        "runId": ID,
        "proposalId": ID,
        "incidentId": ID,
        "baseIncidentVersions": {**VERSIONS, "minProperties": 1},
        "inputSignature": ID,
        "addReportIds": ids(),
        "relations": {"type": "array", "items": RELATION, "maxItems": 256},
        "suggestedStatus": nullable(enum(["OPEN", "RESOLVED"])),
        "suggestedAttention": nullable(enum(ATTENTION)),
        "suggestedSummary": nullable(SUMMARY),
        "evidenceReportIds": ids(),
        "uncertainties": {"type": "array", "items": SHORT_TEXT, "maxItems": 32},
        "provider": enum(["claude", "operator", "recording", "fixture"]),
    },
    # A summary is a claim; it needs cited evidence or it goes back to review.
    when({"suggestedSummary": {"type": "string"}}, {"evidenceReportIds": {"minItems": 1}}),
)

defs["ReportRelation"] = closed(
    {
        "runId": ID,
        "relationId": ID,
        "reportId": ID,
        "targetReportId": ID,
        "kind": enum(RELATION_KINDS),
        "incidentId": ID,
        "state": enum(["PROVISIONAL", "CONFIRMED"]),
        "proposalId": nullable(ID),
        "reviewer": nullable(ID),
    },
    when({"state": {"const": "CONFIRMED"}}, {"reviewer": ID}, {"reviewer": NULL}),
)

defs["SuggestionRecord"] = closed({
    "suggestionId": ID,
    "jobId": ID,
    "reviewState": enum(REVIEW_STATES),
    "suggestion": ref("LocalSuggestion"),
})

defs["ProposalRecord"] = closed(
    {
        "jobId": nullable(ID),
        "submittedByRole": enum(["worker", "operator"]),
        "reviewState": enum(REVIEW_STATES),
        "proposal": ref("IncidentProposal"),
    },
    when({"submittedByRole": {"const": "operator"}}, {"proposal": {"properties": {"provider": {"const": "operator"}}}}),
    when({"submittedByRole": {"const": "worker"}}, {"proposal": {"properties": {"provider": enum(["claude", "recording", "fixture"])}}}),
)

CLAIM = closed({"workerIdentity": ID, "leaseExpiresAt": LEASE_AT})
defs["Job"] = closed(
    {
        "runId": ID,
        "jobId": ID,
        "kind": enum(JOB_KINDS),
        "reportId": nullable(ID),
        "incidentId": nullable(ID),
        "baseIncidentVersions": described(VERSIONS, "Incident revisions the job was issued against (also folded into inputSignature)."),
        "inputSignature": ID,
        "state": enum(JOB_STATES),
        "attempts": {"type": "integer", "minimum": 0, "maximum": 1000},
        "claim": nullable(CLAIM),
    },
    when({"state": {"const": "CLAIMED"}}, {"claim": {"type": "object"}}, {"claim": NULL}),
    when({"kind": {"const": "LOCAL_SUGGESTION"}}, {"reportId": ID}),
    when({"kind": {"const": "INCIDENT_PROPOSAL"}}, {"incidentId": ID}),
)

JOB_REPORT = closed({
    "reportId": ID,
    "receiveSequence": POSITIVE,
    "text": TEXT,
    "sentAt": nullable(SENT_AT),
    "reportedEventAt": nullable(EVENT_AT),
    "reportedLocation": nullable(LOCATION),
})
PLACE = closed({"placeId": ID, "aliases": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 100}, "maxItems": 32}})
defs["JobInput"] = closed(
    {
        "runId": ID,
        "jobId": ID,
        "kind": enum(JOB_KINDS),
        "inputSignature": ID,
        "targetReportId": nullable(ID),
        "incidentId": nullable(ID),
        "reports": {"type": "array", "items": JOB_REPORT, "maxItems": 256},
        "candidateIncidents": {"type": "array", "items": ref("IncidentView"), "maxItems": 32},
        "places": {"type": "array", "items": PLACE, "maxItems": 64},
    },
    when({"kind": {"const": "LOCAL_SUGGESTION"}}, {"targetReportId": ID, "reports": {"minItems": 1}}),
    when({"kind": {"const": "INCIDENT_PROPOSAL"}}, {"incidentId": ID}),
)

defs["ReviewEvent"] = closed(
    {
        "runId": ID,
        "sequence": POSITIVE,
        "commandId": ID,
        "actorRole": {"const": "operator"},
        "actorIdentity": ID,
        "incidentId": ID,
        "proposalId": nullable(ID),
        "priorRevision": COUNT,
        "newRevision": POSITIVE,
        "acceptedChanges": {"type": "array", "items": enum(CHANGE_FIELDS), "uniqueItems": True, "minItems": 1},
        "reason": nullable(SHORT_TEXT),
        "sourceReportIds": ids(),
    },
    # A manual change (no proposal) records a reason or the source reports it rests on (§17).
    {"if": {"properties": {"proposalId": NULL}, "required": ["proposalId"]},
     "then": {"anyOf": [{"properties": {"reason": {"type": "string"}}}, {"properties": {"sourceReportIds": {"minItems": 1}}}]}},
)

defs["ScenarioState"] = closed({
    "runId": ID,
    "exerciseVersion": ID,
    "seed": ID,
    "logicalClock": COUNT,
    "deliveredCount": COUNT,
    "totalCount": COUNT,
    "awaitingPresenter": {"type": "boolean"},
    "nextGate": nullable({"const": "SEND_NEXT_REPORT"}),
})

defs["ContractError"] = closed({"code": enum(ERROR_CODES), "message": SHORT_TEXT})

defs["ApproveProposalCommand"] = closed({
    "commandId": ID,
    "runId": ID,
    "proposalId": ID,
    "inputSignature": ID,
    "baseIncidentVersions": {**VERSIONS, "minProperties": 1},
})
defs["RejectProposalCommand"] = closed({"commandId": ID, "runId": ID, "proposalId": ID, "reason": SHORT_TEXT})
CHANGES = {
    "type": "object",
    "additionalProperties": False,
    "minProperties": 1,
    "properties": {
        "status": enum(["OPEN", "RESOLVED"]),
        "attention": nullable(enum(ATTENTION)),
        "confirmedPlaceId": nullable(ID),
        "summary": nullable(SUMMARY),
        "addReportIds": ids(minItems=1),
    },
}
defs["OperatorEditCommand"] = closed(
    {
        "commandId": ID,
        "runId": ID,
        "incidentId": ID,
        "baseRevision": COUNT,
        "changes": CHANGES,
        "reason": nullable(SHORT_TEXT),
        "sourceReportIds": ids(),
    },
    {"if": {"properties": {"reason": NULL}, "required": ["reason"]}, "then": {"properties": {"sourceReportIds": {"minItems": 1}}}},
)
defs["ClaimJobCommand"] = closed({"runId": ID, "kinds": {"type": "array", "items": enum(JOB_KINDS), "uniqueItems": True, "minItems": 1}})
defs["SubmitLocalSuggestionCommand"] = closed({"jobId": ID, "suggestion": ref("LocalSuggestion")})
defs["SubmitIncidentProposalCommand"] = closed({"jobId": nullable(ID), "proposal": ref("IncidentProposal")})
defs["AdvanceScenarioCommand"] = closed({"commandId": ID, "runId": ID, "expectedDeliveredCount": COUNT})
defs["ResetRunCommand"] = closed({"commandId": ID, "runId": ID})

SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://calhacks26.local/contract.schema.json",
    "title": "Mesh Codec + Incident Desk wire contract",
    "description": "Generated by schema/make_schema.py. Cross-field rules (x-crossFieldRules) are enforced by the TS and Python validators, not by JSON Schema.",
    "x-contractVersion": CONTRACT_VERSION,
    "x-maxIdLength": MAX_ID_LENGTH,
    "x-maxReportTextBytes": MAX_REPORT_TEXT_BYTES,
    "x-maxWireBytes": MAX_WIRE_BYTES,
    "x-maxDepth": MAX_DEPTH,
    "x-crossFieldRules": [
        "LocalSuggestion: a non-null candidateIncidentId is a key of baseIncidentVersions",
        "IncidentProposal: incidentId is a key of baseIncidentVersions",
        "IncidentProposal: no relation has reportId == targetReportId",
        "ReportRelation: reportId != targetReportId",
        "ReviewEvent: newRevision > priorRevision",
        "ReportInput.text, Report.input.text, JobInput.reports[].text: at most x-maxReportTextBytes UTF-8 bytes",
    ],
    "$defs": defs,
}


def render() -> str:
    return json.dumps(SCHEMA, indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if OUT.read_text(encoding="utf-8") == render() else 1)
    OUT.write_text(render(), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(defs)} types, contract {CONTRACT_VERSION}")
