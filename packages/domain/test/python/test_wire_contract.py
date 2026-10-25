"""G0 TEST · Python boundary: the codec bridge and Laya worker validate the same
committed JSON Schema and corpus as TypeScript (test/schema-corpus.test.ts)."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

DOMAIN = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DOMAIN / "python"))

import domain_contract  # noqa: E402

SCHEMA = json.loads((DOMAIN / "schema" / "contract.schema.json").read_text(encoding="utf-8"))
CORPUS = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((DOMAIN / "test" / "corpus").glob("*.json"))]

# The bridge (C1) produces ReportInput; the Laya worker (C3) consumes JobInput and
# produces LocalSuggestion. These must be strict on the Python side too.
PYTHON_SEAM_TYPES = ["ReportInput", "JobInput", "LocalSuggestion", "LabelScore", "IncidentView", "ContractError"]


def validator(name: str) -> Draft202012Validator:
    return Draft202012Validator({"$ref": f"#/$defs/{name}", **{k: v for k, v in SCHEMA.items() if k != "$id"}})


def cases(kind: str):
    for doc in CORPUS:
        for case in doc[kind]:
            yield pytest.param(doc["type"], case["payload"], id=f"{doc['type']}: {case['name']}")


def test_schema_is_valid_draft_2020_12():
    Draft202012Validator.check_schema(SCHEMA)


def test_schema_version_is_frozen():
    assert str(SCHEMA.get("x-contractVersion", "")).startswith("1."), "contract not frozen at v1"


@pytest.mark.parametrize("name", PYTHON_SEAM_TYPES)
def test_python_seam_types_are_closed_objects(name):
    d = SCHEMA["$defs"][name]
    assert isinstance(d, dict), f"{name} is still a placeholder"
    assert d.get("additionalProperties") is False or d.get("unevaluatedProperties") is False


@pytest.mark.parametrize("type_name,payload", list(cases("valid")))
def test_schema_accepts_valid(type_name, payload):
    assert list(validator(type_name).iter_errors(payload)) == []


@pytest.mark.parametrize("type_name,payload", list(cases("invalid")))
def test_schema_rejects_invalid(type_name, payload):
    assert list(validator(type_name).iter_errors(payload)) != []


@pytest.mark.parametrize("type_name,payload", list(cases("valid")))
def test_helper_validate_accepts_valid(type_name, payload):
    assert domain_contract.validate(type_name, payload) == []


@pytest.mark.parametrize("type_name,payload", list(cases("invalid")))
def test_helper_validate_rejects_invalid(type_name, payload):
    assert domain_contract.validate(type_name, payload) != []


def bridge_report_input(text: str) -> dict:
    """Shaped like the C1 bridge's output after a verified decode."""
    return {
        "runId": "run-001",
        "sourceId": "field-team-a",
        "messageId": "msg-0042",
        "text": text,
        "origin": "radio",
        "sentAt": "2026-10-25T09:00:00Z",
        "reportedEventAt": None,
        "reportedLocation": None,
        "transport": {
            "verification": "verified",
            "encoding": "llm",
            "measurementSource": "measured",
            "originalBytes": len(text.encode("utf-8")),
            "applicationPacketBytes": 40,
        },
    }


EXACT_TEXT = "  Água subindo — 2 pessoas no andar de cima 🙏\nR03  "


def test_dumps_keeps_exact_utf8_text():
    wire = domain_contract.dumps(bridge_report_input(EXACT_TEXT))
    assert wire, "dumps returned nothing"
    assert json.loads(wire)["text"] == EXACT_TEXT
    assert "Água" in wire, "dumps must not escape non-ASCII (keeps byte counts honest)"


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_dumps_refuses_non_finite_scores(bad):
    suggestion = json.loads(json.dumps(CORPUS_BY_TYPE()["LocalSuggestion"]["valid"][0]["payload"]))
    suggestion["scores"][0]["value"] = bad
    with pytest.raises(ValueError):
        domain_contract.dumps(suggestion)


def test_bridge_payload_validates_after_a_round_trip():
    payload = json.loads(json.dumps(bridge_report_input(EXACT_TEXT), ensure_ascii=False, allow_nan=False))
    assert payload["text"] == EXACT_TEXT
    assert domain_contract.validate("ReportInput", payload) == []


def test_bridge_cannot_supply_receive_order():
    payload = bridge_report_input("Shelter needs blankets for tonight.")
    payload["receiveSequence"] = 1
    assert list(validator("ReportInput").iter_errors(payload)) != []
    assert domain_contract.validate("ReportInput", payload) != []


def test_bridge_python_bool_is_not_a_byte_count():
    payload = bridge_report_input("Shelter needs blankets for tonight.")
    payload["transport"]["originalBytes"] = True  # bool is an int subclass in Python
    assert list(validator("ReportInput").iter_errors(payload)) != []


def CORPUS_BY_TYPE() -> dict:
    return {doc["type"]: doc for doc in CORPUS}


def test_worker_echoes_job_signature_unchanged():
    job = CORPUS_BY_TYPE()["JobInput"]["valid"][0]["payload"]
    received = json.loads(json.dumps(job))
    suggestion = {
        "runId": received["runId"],
        "reportId": received["targetReportId"],
        "action": "REQUEST_REVIEW",
        "candidateIncidentId": None,
        "attention": None,
        "scores": [],
        "evidenceReportIds": [received["targetReportId"]],
        "baseIncidentVersions": {i["incidentId"]: i["revision"] for i in received["candidateIncidents"]},
        "inputSignature": received["inputSignature"],
        "provider": "local_laya",
    }
    assert suggestion["inputSignature"] == job["inputSignature"]
    assert domain_contract.validate("LocalSuggestion", json.loads(json.dumps(suggestion))) == []
