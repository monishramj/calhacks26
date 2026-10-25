"""Shared G4 test helpers: §17 labels, a test-local LocalSuggestion schema, job builders, and FakeRuntime.

Option keys asked of the model are the §17 labels themselves (LocalAction, Attention) or candidate incident IDs,
so LabelScore labels preserve the model's own labels (§17 "preserve its labels").
"""
import copy

ATTENTION = ("POSSIBLE_LIFE_SAFETY", "ACTIVE_NEED", "INFORMATION")
ACTIONS = ("NEW_INCIDENT", "ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT", "REQUEST_REVIEW")
NEEDS_CANDIDATE = ("ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT")
RUN = "run-dev"

# §17 LocalSuggestion as written. Fallback only: the `validate` fixture uses packages/domain once G0 is on this branch.
LABEL_SCORE = {
    "type": "object", "additionalProperties": False, "required": ["label", "value", "kind"],
    "properties": {"label": {"type": "string", "minLength": 1}, "value": {"type": "number"},
                   "kind": {"enum": ["probability", "score"]}},
}
LOCAL_SUGGESTION = {
    "type": "object", "additionalProperties": False,
    "required": ["runId", "reportId", "action", "candidateIncidentId", "attention", "scores",
                 "evidenceReportIds", "baseIncidentVersions", "inputSignature", "provider"],
    "properties": {
        "runId": {"type": "string", "minLength": 1},
        "reportId": {"type": "string", "minLength": 1},
        "action": {"enum": list(ACTIONS)},
        "candidateIncidentId": {"type": ["string", "null"]},
        "attention": {"enum": [*ATTENTION, None]},
        "scores": {"type": "array", "items": LABEL_SCORE},
        "evidenceReportIds": {"type": "array", "items": {"type": "string"}},
        "baseIncidentVersions": {"type": "object", "additionalProperties": {"type": "integer", "minimum": 0}},
        "inputSignature": {"type": "string", "minLength": 1},
        "provider": {"enum": ["local_laya", "claude", "operator", "recording", "fixture", "rule"]},
    },
}


def report(report_id, text, seq, sent_at=None, place=None):
    return {"reportId": report_id, "text": text, "sentAt": sent_at, "reportedEventAt": None,
            "reportedLocation": {"placeId": place, "source": "sender_explicit"} if place else None,
            "receiveSequence": seq}


def incident(incident_id, attention, report_ids, revision=1, place=None, start=1, summary=None):
    return {"runId": RUN, "incidentId": incident_id, "revision": revision, "status": "OPEN",
            "attention": attention, "confirmedPlaceId": place, "confirmedReportIds": list(report_ids),
            "summary": summary, "openCycleStartSequence": start}


def make_job(text, candidates=(), relevant=(), report_id="rep-new", seq=100, sent_at=None, signature="sig-dev-1"):
    """A LOCAL_SUGGESTION JobInput as in contract v1 (PR #2): `reports` ordered by receiveSequence, target among them."""
    reports = sorted([*relevant, report(report_id, text, seq, sent_at)], key=lambda r: r["receiveSequence"])
    return {"runId": RUN, "jobId": "job-dev-1", "kind": "LOCAL_SUGGESTION", "inputSignature": signature,
            "targetReportId": report_id, "incidentId": None, "reports": reports,
            "candidateIncidents": list(candidates), "places": [], "candidatePictures": []}


def target(job):
    return next(r for r in job["reports"] if r["reportId"] == job["targetReportId"])


def clinic_job(text="Riverside clinic: the generator is out and the lights are off."):
    """One open life-safety incident with one confirmed report: the common contract fixture."""
    confirmed = report("rep-1", "Patients may still be on the second floor of the riverside clinic.", 1)
    return make_job(text, candidates=[incident("inc-clinic", "POSSIBLE_LIFE_SAFETY", ["rep-1"], revision=3)],
                    relevant=[confirmed])


class FakeRuntime:
    """Mock runtime. Choice probabilities are proportional to `prefs[label]` (default `floor`).

    Records every (text, questions) call. `count_tokens` counts whitespace words and `state_room` is fixed,
    so budget tests are exact. `raw` lets a test hand back an arbitrary (malformed) answers dict.
    """

    ENTROPY_CONFIDENCE = 0.4242  # distinctive, so a test can spot it leaking into scores

    def __init__(self, prefs=None, floor=0.001, noul=0.5, room=400, raw=None, error=None):
        self.prefs, self.floor, self.noul, self.room = dict(prefs or {}), floor, noul, room
        self.raw, self.error = raw, error
        self.calls = []
        self.device = "fake"
        self.load_ms = 0.0
        self.max_len, self.head_max_len = 512, 192

    def count_tokens(self, text):
        return len(text.split())

    def state_room(self, question):
        return self.room

    def _answer(self, question):
        kind = question["type"]
        if kind == "choice":
            keys = list(question["criteria"])
            weights = [self.prefs.get(k, self.floor) for k in keys]
            probs = {k: w / sum(weights) for k, w in zip(keys, weights)}
            return {"type": "choice", "choice": max(probs, key=probs.get), "probabilities": probs,
                    "confidence": self.ENTROPY_CONFIDENCE, "answer_confidence": max(probs.values())}
        if kind == "score":
            top = len(question["criteria"]) - 1
            return {"type": "score", "score": top / 2, "confidence": self.ENTROPY_CONFIDENCE}
        return {"type": "noul", "noul": self.noul, "confidence": self.ENTROPY_CONFIDENCE}

    def ask(self, text, questions):
        self.calls.append((text, copy.deepcopy(questions)))
        if self.error:
            raise self.error
        if self.raw is not None:
            answers = self.raw(questions) if callable(self.raw) else copy.deepcopy(self.raw)
        else:
            answers = {qid: self._answer(q) for qid, q in questions.items()}
        return {"answers": answers, "latency_ms": 1.0}
