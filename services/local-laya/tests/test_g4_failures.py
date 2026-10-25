"""G4 failure paths: malformed model output, unavailable model, input limits. Mocked runtime only."""
import json
import math

import pytest

from laya_g4_helpers import ATTENTION, FakeRuntime, clinic_job, incident, make_job, report, target
from laya_worker.runtime import LayaUnavailable
from laya_worker.server import Worker
from laya_worker.suggest import InvalidJob, suggest


def malformed(kind):
    """Answers that break one rule each. The worker must not trust the runtime's validation."""
    def build(questions):
        answers = {}
        for qid, q in questions.items():
            if q["type"] == "choice":
                keys = list(q["criteria"])
                probs = {k: 1 / len(keys) for k in keys}
                choice = keys[0]
                if kind == "nan":
                    probs[keys[0]] = float("nan")
                elif kind == "missing_label":
                    probs.pop(keys[-1])
                elif kind == "extra_label":
                    probs["SOMETHING_ELSE"] = 0.0
                elif kind == "sum":
                    probs = {k: 0.7 for k in keys}
                elif kind == "negative":
                    probs[keys[0]], probs[keys[1]] = -0.2, probs[keys[1]] + 0.2
                elif kind == "unknown_choice":
                    choice = "SOMETHING_ELSE"
                answers[qid] = {"type": "choice", "choice": choice, "probabilities": probs}
            elif q["type"] == "score":
                answers[qid] = {"type": "score", "score": 99.0 if kind != "missing_key" else 1.0}
            else:
                answers[qid] = {"type": "noul", "noul": 1.7 if kind == "nan" else 0.5}
        if kind == "missing_key":
            answers.pop(next(iter(answers)))
        return answers
    return build


MALFORMED = ("nan", "missing_label", "extra_label", "sum", "negative", "unknown_choice", "missing_key")


@pytest.mark.parametrize("kind", MALFORMED)
def test_malformed_model_output_becomes_review_never_a_low_default(kind, validate):
    out = validate(suggest(clinic_job(), FakeRuntime(raw=malformed(kind))))
    assert out["action"] == "REQUEST_REVIEW"
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)
    assert all(math.isfinite(s["value"]) for s in out["scores"])


def test_runtime_validation_error_becomes_review(validate):
    out = validate(suggest(clinic_job(), FakeRuntime(error=ValueError("Laya returned unexpected answer keys"))))
    assert out["action"] == "REQUEST_REVIEW"
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)


def test_no_runtime_is_unavailable_not_a_suggestion():
    with pytest.raises(LayaUnavailable):
        suggest(clinic_job(), None)


def test_runtime_failure_is_unavailable_not_a_suggestion():
    with pytest.raises(LayaUnavailable):
        suggest(clinic_job(), FakeRuntime(error=LayaUnavailable("Laya call failed: RuntimeError")))


@pytest.mark.parametrize("mutate", [
    lambda j: j.pop("inputSignature"),
    lambda j: j.update(inputSignature=""),
    lambda j: j.update(kind="INCIDENT_PROPOSAL"),
    lambda j: j.update(targetReportId=None),
    lambda j: j.update(targetReportId="rep-not-delivered"),
    lambda j: target(j).update(text=""),
    lambda j: target(j).pop("text"),
    lambda j: target(j).update(text="x" * 1001),
    lambda j: j["reports"].append(dict(target(j))),
    lambda j: j["candidateIncidents"][0].update(revision=0),
    lambda j: j["candidateIncidents"][0].update(attention="SEVERE"),
    lambda j: j["candidateIncidents"].append(dict(j["candidateIncidents"][0])),
    lambda j: j["candidateIncidents"][0].update(runId="another-run"),
], ids=["no-signature", "empty-signature", "proposal-kind", "no-target", "target-not-in-reports", "empty-text",
        "no-text", "text-over-contract-limit", "duplicate-report", "zero-revision", "unknown-attention",
        "duplicate-candidate", "wrong-run"])
def test_invalid_jobs_are_rejected_before_the_model(mutate):
    job, runtime = clinic_job(), FakeRuntime()
    mutate(job)
    with pytest.raises(InvalidJob):
        suggest(job, runtime)
    assert runtime.calls == []


def test_every_model_input_fits_the_measured_room():
    """The SDK silently right-truncates state past its room (laya/common.py build_sequence)."""
    relevant = [report(f"rep-{i}", f"Older clinic note number {i} " + "word " * 20, i) for i in range(1, 9)]
    job = make_job("Clinic generator is out.", relevant=relevant,
                   candidates=[incident("inc-clinic", "POSSIBLE_LIFE_SAFETY", [r["reportId"] for r in relevant])])
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9}, room=60)
    suggest(job, runtime)
    for text, questions in runtime.calls:
        assert runtime.count_tokens(text) <= min(runtime.state_room(q) for q in questions.values())


def test_a_pending_correction_is_never_dropped_to_fit():
    filler = [report(f"rep-{i}", f"Routine clinic note {i} " + "word " * 15, i) for i in range(1, 7)]
    correction = report("rep-fix", "Correction: patients were moved; the second floor is empty.", 7)
    job = make_job("Clinic generator is out.", relevant=[*filler, correction],
                   candidates=[incident("inc-clinic", "POSSIBLE_LIFE_SAFETY", [r["reportId"] for r in filler])])
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9}, room=50)
    out = suggest(job, runtime)
    asked = [text for text, _ in runtime.calls]
    kept = asked and all(correction["text"] in t and target(job)["text"] in t for t in asked)
    assert kept or out["action"] == "REQUEST_REVIEW"


def test_a_report_too_long_for_the_model_goes_to_review_untruncated(validate):
    long_text = "Clinic update: " + "the hallway is flooded and dark " * 25  # within the 1000-char contract cap
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9}, room=50)
    out = validate(suggest(clinic_job(long_text), runtime))
    assert out["action"] == "REQUEST_REVIEW"
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)
    assert all(long_text in text for text, _ in runtime.calls)


def worker(runtime=None, fail=False):
    calls = []

    def loader():
        calls.append(1)
        if fail:
            raise LayaUnavailable("Laya model is not installed at LAYA_MODEL_PATH. Missing: model.safetensors")
        return runtime
    return Worker(loader), calls


def body(job):
    return json.dumps(job).encode()


def test_worker_loads_the_model_once_across_requests():
    w, calls = worker(FakeRuntime(prefs={"ATTACH_REPORT": 0.9}))
    for _ in range(3):
        status, _ = w.handle("POST", "/suggest", body(clinic_job()))
        assert status == 200
    w.handle("GET", "/health", b"")
    assert len(calls) == 1


def test_health_reports_ready_with_provenance():
    status, payload = worker(FakeRuntime())[0].handle("GET", "/health", b"")
    assert status == 200
    assert payload["status"] == "ready"
    assert payload["runtime"] == "laya==0.3.20"
    assert payload["revision"]


def test_unloadable_model_is_service_unavailable_without_internals():
    w, _ = worker(fail=True)
    status, payload = w.handle("GET", "/health", b"")
    assert status == 503 and payload["status"] == "unavailable"
    status, payload = w.handle("POST", "/suggest", body(clinic_job()))
    assert status == 503
    assert payload["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert "safetensors" not in json.dumps(payload) and "LAYA_MODEL_PATH" not in json.dumps(payload)


@pytest.mark.parametrize("raw", [b"", b"not json", b"[]", json.dumps({"runId": "run-dev"}).encode()])
def test_malformed_requests_are_invalid_input(raw):
    w, _ = worker(FakeRuntime())
    status, payload = w.handle("POST", "/suggest", raw)
    assert status == 400
    assert payload["error"]["code"] == "INVALID_INPUT"


def test_oversized_request_is_rejected_visibly_not_truncated():
    job = clinic_job("x" * 2_000_000)
    status, payload = worker(FakeRuntime())[0].handle("POST", "/suggest", body(job))
    assert status in (400, 413)
    assert payload["error"]["code"] == "INVALID_INPUT"


def test_suggest_response_is_the_suggestion(validate):
    status, payload = worker(FakeRuntime(prefs={"ATTACH_REPORT": 0.9}))[0].handle(
        "POST", "/suggest", body(clinic_job()))
    assert status == 200
    validate(payload)
    assert payload["attention"] in (*ATTENTION, None)
