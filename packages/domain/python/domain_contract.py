"""Python side of the wire contract (v1), for the codec bridge and the Laya worker.

    import sys; sys.path.insert(0, "<repo>/packages/domain/python")
    import domain_contract
    errors = domain_contract.validate("ReportInput", payload)   # [] = valid
    wire = domain_contract.dumps(payload)                        # UTF-8 kept, NaN refused

Needs `jsonschema` (pinned in packages/domain/requirements-test.txt). Mirrors the
cross-field rules in src/validate.ts; the schema's x-crossFieldRules lists them.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "contract.schema.json"


@lru_cache(maxsize=1)
def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


CONTRACT_VERSION: str = _schema()["x-contractVersion"]
MAX_REPORT_TEXT_BYTES: int = _schema()["x-maxReportTextBytes"]


@lru_cache(maxsize=None)
def _validator(type_name: str):
    from jsonschema import Draft202012Validator

    root = {k: v for k, v in _schema().items() if k != "$id"}
    return Draft202012Validator({"$ref": f"#/$defs/{type_name}", **root})


def _finite(v) -> bool:
    if isinstance(v, bool):
        return True
    if isinstance(v, float):
        return math.isfinite(v)
    if isinstance(v, list):
        return all(_finite(x) for x in v)
    if isinstance(v, dict):
        return all(_finite(x) for x in v.values())
    return True


def _too_long(text: str) -> bool:
    return len(text.encode("utf-8")) > MAX_REPORT_TEXT_BYTES


def _cross_field(type_name: str, v: dict) -> list[str]:
    if type_name == "ReportInput":
        return [f"text is over the {MAX_REPORT_TEXT_BYTES}-byte limit; rejected, not truncated"] if _too_long(v["text"]) else []
    if type_name == "Report":
        return _cross_field("ReportInput", v["input"])
    if type_name == "JobInput":
        return [f"report {r['reportId']} text is over the byte limit" for r in v["reports"] if _too_long(r["text"])]
    if type_name == "LocalSuggestion":
        c = v["candidateIncidentId"]
        return ["candidateIncidentId must appear in baseIncidentVersions"] if c is not None and c not in v["baseIncidentVersions"] else []
    if type_name == "IncidentProposal":
        errs = [] if v["incidentId"] in v["baseIncidentVersions"] else ["baseIncidentVersions must include incidentId"]
        if any(r["reportId"] == r["targetReportId"] for r in v["relations"]):
            errs.append("a relation cannot point a report at itself")
        return errs
    if type_name == "ReportRelation":
        return ["a relation cannot point a report at itself"] if v["reportId"] == v["targetReportId"] else []
    if type_name == "ReviewEvent":
        return [] if v["newRevision"] > v["priorRevision"] else ["newRevision must be greater than priorRevision"]
    if type_name in ("SuggestionRecord", "SubmitLocalSuggestionCommand"):
        return _cross_field("LocalSuggestion", v["suggestion"])
    if type_name in ("ProposalRecord", "SubmitIncidentProposalCommand"):
        return _cross_field("IncidentProposal", v["proposal"])
    return []


def validate(type_name: str, payload: object) -> list[str]:
    """Return a list of contract violations for `payload` as `type_name` (empty = valid)."""
    if type_name not in _schema()["$defs"]:
        return [f"unknown wire type {type_name!r}"]
    if not _finite(payload):
        return [f"{type_name}: numbers must be finite"]
    errors = [f"{type_name}{'/' + '/'.join(map(str, e.absolute_path)) if e.absolute_path else ''}: {e.message}"
              for e in _validator(type_name).iter_errors(payload)]
    if errors:
        return errors
    return [f"{type_name}: {m}" for m in _cross_field(type_name, payload)]


def dumps(payload: object) -> str:
    """Serialize for the wire: UTF-8 text kept as-is, NaN/Infinity refused (ValueError)."""
    return json.dumps(payload, ensure_ascii=False, allow_nan=False)
