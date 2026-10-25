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
MAX_WIRE_BYTES: int = _schema()["x-maxWireBytes"]
MAX_DEPTH: int = _schema()["x-maxDepth"]


@lru_cache(maxsize=None)
def _validator(type_name: str):
    from jsonschema import Draft202012Validator

    root = {k: v for k, v in _schema().items() if k != "$id"}
    return Draft202012Validator({"$ref": f"#/$defs/{type_name}", **root})


def _shape_problem(v, depth: int = 0) -> str | None:
    """Depth-bounded walk: floats finite, nesting within MAX_DEPTH (never RecursionError)."""
    if isinstance(v, float):
        return None if math.isfinite(v) else "numbers must be finite"
    if not isinstance(v, (list, dict)):
        return None
    if depth >= MAX_DEPTH:
        return f"nesting deeper than {MAX_DEPTH}"
    for x in v if isinstance(v, list) else v.values():
        p = _shape_problem(x, depth + 1)
        if p:
            return p
    return None


def _too_long(text: str) -> bool:
    return len(text.encode("utf-8")) > MAX_REPORT_TEXT_BYTES


def _picture_problem(n: dict) -> str | None:
    """Mirror of validate.ts pictureProblem: chronology and claims cite only the node's own reports."""
    own = set(n["reportIds"])
    for e in n["chronology"]:
        if e["reportId"] not in own:
            return f"chronology in {n['label']} names {e['reportId']}, which is not one of its reports"
        if e["supersedesReportId"] is not None and e["supersedesReportId"] not in own:
            return f"chronology in {n['label']} supersedes {e['supersedesReportId']}, which is not one of its reports"
    for c in n.get("claims", []):
        stray = next((i for i in c["reportIds"] if i not in own), None)
        if stray:
            return f"claim in {n['label']} cites {stray}, which is not one of its reports"
    for child in n.get("sites", n.get("subareas", [])):
        problem = _picture_problem(child)
        if problem:
            return problem
    return None


def _cross_field(type_name: str, v: dict) -> list[str]:
    if type_name == "ReportInput":
        return [f"text is over the {MAX_REPORT_TEXT_BYTES}-byte limit; rejected, not truncated"] if _too_long(v["text"]) else []
    if type_name == "Report":
        return _cross_field("ReportInput", v["input"])
    if type_name == "JobInput":
        return [f"report {r['reportId']} text is over the byte limit" for r in v["reports"] if _too_long(r["text"])]
    if type_name in ("LocalSuggestion", "ClaudeCheck"):
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
    if type_name in ("SubmitClaudeCheckCommand", "ClaudeCheckRecord"):
        return _cross_field("ClaudeCheck", v["check"])
    if type_name in ("ProposalRecord", "SubmitIncidentProposalCommand"):
        return _cross_field("IncidentProposal", v["proposal"])
    if type_name in ("IncidentPictureDraft", "IncidentPicture"):
        return [p for a in v["areas"] if (p := _picture_problem(a))][:1]
    if type_name == "SubmitIncidentPictureCommand":
        return _cross_field("IncidentPictureDraft", v["picture"])
    return []


def validate(type_name: str, payload: object) -> list[str]:
    """Return a list of contract violations for `payload` as `type_name` (empty = valid)."""
    if type_name not in _schema()["$defs"]:
        return [f"unknown wire type {type_name!r}"]
    shape = _shape_problem(payload)
    if shape:
        return [f"{type_name}: {shape}"]
    errors = [f"{type_name}{'/' + '/'.join(map(str, e.absolute_path)) if e.absolute_path else ''}: {e.message}"
              for e in _validator(type_name).iter_errors(payload)]
    if errors:
        return errors
    return [f"{type_name}: {m}" for m in _cross_field(type_name, payload)]


def mesh_source_id(node_id: str) -> str:
    """Map a Meshtastic node ID ("!f99260d4") to a contract sourceId ("mesh-f99260d4")."""
    hex_part = node_id[1:] if node_id.startswith("!") else node_id
    if not (1 <= len(hex_part) <= 16) or any(c not in "0123456789abcdef" for c in hex_part.lower()):
        raise ValueError(f"not a Meshtastic node id: {node_id!r}")
    return f"mesh-{hex_part.lower()}"


def dumps(payload: object) -> str:
    """Serialize for the wire: UTF-8 text kept as-is, NaN/Infinity refused (ValueError)."""
    return json.dumps(payload, ensure_ascii=False, allow_nan=False)
