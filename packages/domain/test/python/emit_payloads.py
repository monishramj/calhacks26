"""Emit payloads the way Python producers serialize them, for the TypeScript consumer
test (test/python-boundary.test.ts). Stdlib only. Prints one JSON object:
{case name: {"type": ..., "json": <wire text>, "expectOk": bool, "text": <expected text or null>}}
"""

import json

TEXT = "  Água subindo — 2 pessoas no andar de cima 🙏\nR03  "


def report_input(text: str) -> dict:
    return {
        "runId": "run-001",
        "sourceId": "field-team-a",
        "messageId": "msg-0042",
        "text": text,
        "origin": "radio",
        "sentAt": "2026-10-25T09:00:00Z",
        "reportedEventAt": None,
        "reportedLocation": {"placeId": "residence", "source": "sender_explicit"},
        "transport": {
            "verification": "verified",
            "encoding": "llm",
            "measurementSource": "measured",
            "originalBytes": len(text.encode("utf-8")),
            "applicationPacketBytes": 40,
        },
    }


def suggestion(value) -> dict:
    return {
        "runId": "run-001",
        "reportId": "rep-000007",
        "action": "FLAG_CORRECTION",
        "candidateIncidentId": "inc-school",
        "attention": "POSSIBLE_LIFE_SAFETY",
        "scores": [{"label": "POSSIBLE_LIFE_SAFETY", "value": value, "kind": "probability"}],
        "evidenceReportIds": ["rep-000007"],
        "baseIncidentVersions": {"inc-school": 2},
        "inputSignature": "sig1:3f9a0c41d2e7b8a65f1e0d9c8b7a69584736251403f2e1d0c9b8a79685746352",
        "provider": "local_laya",
    }


bool_bytes = report_input("Shelter needs blankets for tonight.")
bool_bytes["transport"]["originalBytes"] = True

out = {
    "bridge ReportInput, UTF-8 kept": {
        "type": "ReportInput",
        "json": json.dumps(report_input(TEXT), ensure_ascii=False, allow_nan=False),
        "expectOk": True,
        "text": TEXT,
    },
    "bridge ReportInput, ASCII-escaped by json.dumps default": {
        "type": "ReportInput",
        "json": json.dumps(report_input(TEXT)),
        "expectOk": True,
        "text": TEXT,
    },
    "bridge ReportInput with a Python bool as byte count": {
        "type": "ReportInput",
        "json": json.dumps(bool_bytes),
        "expectOk": False,
        "text": None,
    },
    "Laya LocalSuggestion": {
        "type": "LocalSuggestion",
        "json": json.dumps(suggestion(0.61), allow_nan=False),
        "expectOk": True,
        "text": None,
    },
    "Laya LocalSuggestion with NaN score (json.dumps default allows it)": {
        "type": "LocalSuggestion",
        "json": json.dumps(suggestion(float("nan"))),
        "expectOk": False,
        "text": None,
    },
    "Laya LocalSuggestion with Infinity score": {
        "type": "LocalSuggestion",
        "json": json.dumps(suggestion(float("inf"))),
        "expectOk": False,
        "text": None,
    },
}
print(json.dumps(out))
