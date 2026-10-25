"""JobInput in, §17 LocalSuggestion out.

Input is a contract v1 `JobInput` with kind LOCAL_SUGGESTION (packages/domain): `reports` ordered by receiveSequence
with exact original text, including delivered but unconfirmed ones; `targetReportId` is one of them;
`candidateIncidents` are full IncidentView rows. The worker only suggests: it never changes confirmed state.
"""
import sys
from math import isfinite
from pathlib import Path

from .runtime import LayaUnavailable, check_answers

ATTENTION = ("POSSIBLE_LIFE_SAFETY", "ACTIVE_NEED", "INFORMATION")
ATTENTION_RANK = {"INFORMATION": 0, "ACTIVE_NEED": 1, "POSSIBLE_LIFE_SAFETY": 2}
ACTIONS = ("NEW_INCIDENT", "ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT", "REQUEST_REVIEW")
NEEDS_CANDIDATE = ("ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT")

# Engineering settings, not calibrated probabilities (§5). Below them the outcome is review / unknown.
ACTION_MIN = 0.5
CANDIDATE_MIN = 0.5
ATTENTION_MIN = 0.5
DOWNGRADE_MIN = 0.8  # a lower attention than the linked incident's needs at least this much support
HARM_FLOOR = 0.25    # P(POSSIBLE_LIFE_SAFETY) at or above this keeps an uncertain lower label from winning
MAX_CANDIDATES = 10  # the checkpoint's choice temperatures are uncalibrated at 11+ options
MAX_LABEL = 64       # contract LabelScore.label maxLength
MAX_TEXT_BYTES = 1000

JOB_KEYS = {"runId", "jobId", "kind", "inputSignature", "targetReportId", "incidentId", "reports",
            "candidateIncidents", "places"}
REPORT_KEYS = {"reportId", "receiveSequence", "text", "sentAt", "reportedEventAt", "reportedLocation"}
INCIDENT_KEYS = {"runId", "incidentId", "revision", "status", "attention", "confirmedPlaceId",
                 "confirmedReportIds", "summary", "openCycleStartSequence"}

ACTION_QUESTION = {
    "NEW_INCIDENT": "it is about a different place or problem than every open incident",
    "ATTACH_REPORT": "it adds information to one open incident",
    "FLAG_CORRECTION": "it corrects or narrows something an earlier report said",
    "FLAG_CONFLICT": "it contradicts an earlier report",
    "REQUEST_REVIEW": "it is unclear; a person should decide",
}
ATTENTION_QUESTION = {
    "POSSIBLE_LIFE_SAFETY": "someone may be hurt, trapped, or in danger",
    "ACTIVE_NEED": "people need supplies or help, but no one is said to be in danger",
    "INFORMATION": "status or background with no open need",
}
ATTENTION_WORDS = {"POSSIBLE_LIFE_SAFETY": "possible life-safety concern", "ACTIVE_NEED": "active need",
                   "INFORMATION": "information", None: "attention not set"}


class InvalidJob(ValueError):
    code = "INVALID_INPUT"


def _contract():
    path = Path(__file__).resolve().parents[3] / "packages" / "domain" / "python"
    if not (path / "domain_contract.py").is_file():
        return None
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
    import domain_contract
    return domain_contract


def _require(condition, message):
    if not condition:
        raise InvalidJob(message)


def validate_job(job) -> None:
    _require(isinstance(job, dict), "job must be an object")
    _require(set(job) == JOB_KEYS, "job fields differ from JobInput")
    _require(job["kind"] == "LOCAL_SUGGESTION", "the Laya worker only answers LOCAL_SUGGESTION jobs")
    for key in ("runId", "jobId", "inputSignature", "targetReportId"):
        _require(isinstance(job[key], str) and job[key], f"{key} must be a non-empty string")
    reports, candidates = job["reports"], job["candidateIncidents"]
    _require(isinstance(reports, list) and reports, "reports must be a non-empty list")
    _require(isinstance(candidates, list) and isinstance(job["places"], list), "lists expected")
    seen = set()
    for item in reports:
        _require(isinstance(item, dict) and set(item) == REPORT_KEYS, "report fields differ from the contract")
        _require(isinstance(item["reportId"], str) and item["reportId"] not in seen, "duplicate or bad reportId")
        seen.add(item["reportId"])
        text = item["text"]
        _require(isinstance(text, str) and text and len(text.encode("utf-8")) <= MAX_TEXT_BYTES,
                 "report text must be 1..1000 bytes")
        _require(isinstance(item["receiveSequence"], int) and item["receiveSequence"] >= 1, "bad receiveSequence")
    _require(job["targetReportId"] in seen, "targetReportId is not among the delivered reports")
    ids = set()
    for incident in candidates:
        _require(isinstance(incident, dict) and set(incident) == INCIDENT_KEYS,
                 "candidate fields differ from IncidentView")
        _require(incident["incidentId"] not in ids, "duplicate candidate incident")
        ids.add(incident["incidentId"])
        _require(incident["runId"] == job["runId"], "candidate belongs to another run")
        _require(isinstance(incident["revision"], int) and incident["revision"] >= 1, "bad revision")
        _require(incident["attention"] in (*ATTENTION, None), "unknown attention label")
    contract = _contract()
    if contract:
        errors = contract.validate("JobInput", job)
        _require(not errors, "job does not match contract JobInput")


def _place_names(job):
    return {p["placeId"]: (p["aliases"][0] if p.get("aliases") else p["placeId"]) for p in job["places"]}


def render(job, include_confirmed=True):
    """Plain sentences, never JSON. Returns (text, rendered report IDs)."""
    places = _place_names(job)
    target = next(r for r in job["reports"] if r["reportId"] == job["targetReportId"])
    owner = {rid: c["incidentId"] for c in job["candidateIncidents"] for rid in c["confirmedReportIds"]}
    lines = []
    if job["candidateIncidents"]:
        for c in job["candidateIncidents"]:
            where = f" at {places.get(c['confirmedPlaceId'], c['confirmedPlaceId'])}" if c["confirmedPlaceId"] else ""
            state = "open" if c["status"] == "OPEN" else "resolved"
            line = f"Incident {c['incidentId']}{where} is {state}, {ATTENTION_WORDS[c['attention']]}."
            if c["summary"]:
                line += f" Summary: {c['summary']}"
            lines.append(line)
    else:
        lines.append("There are no open incidents.")
    shown = []
    hidden = 0
    earlier = [r for r in job["reports"] if r["reportId"] != target["reportId"]]
    for r in earlier:
        confirmed_in = owner.get(r["reportId"])
        if confirmed_in and not include_confirmed:
            hidden += 1
            continue
        tag = f"Report in incident {confirmed_in}" if confirmed_in else "Unconfirmed report"
        sent = f" (sent {r['sentAt']} by the sender's clock)" if r["sentAt"] else ""
        lines.append(f"{tag}{sent}: {r['text']}")
        shown.append(r["reportId"])
    if hidden:
        lines.append(f"{hidden} earlier confirmed reports are not shown.")
    sent = f" (sent {target['sentAt']} by the sender's clock)" if target["sentAt"] else ""
    lines.append(f"New report{sent}: {target['text']}")
    return "\n".join(lines), [target["reportId"], *shown]


def questions_for(job):
    candidates = [c["incidentId"] for c in job["candidateIncidents"]]
    offered = ACTIONS if candidates else ("NEW_INCIDENT", "REQUEST_REVIEW")
    questions = {
        "action": {"type": "choice", "instructions": "What should the incident desk do with the new report?",
                   "criteria": {a: ACTION_QUESTION[a] for a in offered}},
        "attention": {"type": "choice", "instructions": "Which attention category fits the new report?",
                      "criteria": dict(ATTENTION_QUESTION)},
    }
    if candidates:
        questions["incident"] = {"type": "choice", "instructions": "Which incident is the new report about?",
                                 "criteria": {cid: f"incident {cid}" for cid in candidates}}
    return questions


def _review(job, scores=(), candidate=None):
    return _suggestion(job, "REQUEST_REVIEW", candidate, None, list(scores), [job["targetReportId"]])


def _suggestion(job, action, candidate, attention, scores, evidence):
    return {
        "runId": job["runId"],
        "reportId": job["targetReportId"],
        "action": action,
        "candidateIncidentId": candidate,
        "attention": attention,
        "scores": scores,
        "evidenceReportIds": list(dict.fromkeys(evidence)),
        "baseIncidentVersions": {c["incidentId"]: c["revision"] for c in job["candidateIncidents"]},
        "inputSignature": job["inputSignature"],
        "provider": "local_laya",
    }


def _top(probs):
    label = max(probs, key=probs.get)
    return label, probs[label]


def decide_attention(probs, linked):
    """Unknown (None) instead of a weakly supported label; never a weak downgrade of the linked incident."""
    label, p = _top(probs)
    if p < ATTENTION_MIN:
        return None
    if label != "POSSIBLE_LIFE_SAFETY" and probs.get("POSSIBLE_LIFE_SAFETY", 0) >= HARM_FLOOR and p < DOWNGRADE_MIN:
        return None
    if linked and linked["attention"] and ATTENTION_RANK[label] < ATTENTION_RANK[linked["attention"]] \
            and p < DOWNGRADE_MIN:
        return None
    return label


def suggest(job: dict, runtime) -> dict:
    validate_job(job)
    if runtime is None:
        raise LayaUnavailable("Laya runtime is not loaded")
    if len(job["candidateIncidents"]) > MAX_CANDIDATES:
        return _review(job)
    questions = questions_for(job)
    room = min(runtime.state_room(q) for q in questions.values())
    text, evidence = render(job)
    if runtime.count_tokens(text) > room:
        text, evidence = render(job, include_confirmed=False)
        if runtime.count_tokens(text) > room:
            return _review(job)
    try:
        answers = check_answers(runtime.ask(text, questions)["answers"], questions)
    except LayaUnavailable:
        raise
    except (ValueError, KeyError, TypeError, AttributeError):
        return _review(job)
    action_p = answers["action"]["probabilities"]
    attention_p = answers["attention"]["probabilities"]
    incident_p = answers.get("incident", {}).get("probabilities", {})
    scores = [{"label": label, "value": float(value), "kind": "probability"}
              for probs in (action_p, attention_p, incident_p) for label, value in probs.items()
              if len(label) <= MAX_LABEL and isfinite(value)]

    action, action_conf = _top(action_p)
    candidate = None
    if incident_p:
        best, best_p = _top(incident_p)
        candidate = best if best_p >= CANDIDATE_MIN else None
    if action_conf <= ACTION_MIN:
        action = "REQUEST_REVIEW"
    if action in NEEDS_CANDIDATE and candidate is None:
        action = "REQUEST_REVIEW"
    if action == "NEW_INCIDENT":
        candidate = None
    linked = next((c for c in job["candidateIncidents"] if c["incidentId"] == candidate), None)
    attention = decide_attention(attention_p, linked)
    return _suggestion(job, action, candidate, attention, scores, evidence)
