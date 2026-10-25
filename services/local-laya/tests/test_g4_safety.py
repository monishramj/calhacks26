"""G4 safety: uncertainty never hides possible harm, suggestions never mutate truth, future truth stays out.

Mocked runtime only. "Low" and "flat" here are clear-cut distributions so the tests don't pin a threshold.
"""
import copy

from laya_g4_helpers import ATTENTION, FakeRuntime, clinic_job, incident, make_job, report
from laya_worker.suggest import InvalidJob, suggest

FLAT_ATTENTION = {"POSSIBLE_LIFE_SAFETY": 1.0, "ACTIVE_NEED": 1.0, "INFORMATION": 1.0}


def test_flat_attention_stays_unknown_and_keeps_its_scores():
    out = suggest(make_job("Something happened near the old mill."), FakeRuntime(prefs={"NEW_INCIDENT": 0.9,
                                                                                         **FLAT_ATTENTION}))
    assert out["attention"] is None
    assert {"POSSIBLE_LIFE_SAFETY", "ACTIVE_NEED", "INFORMATION"} <= {s["label"] for s in out["scores"]}


def test_flat_action_goes_to_review():
    prefs = {a: 1.0 for a in ("NEW_INCIDENT", "ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT",
                              "REQUEST_REVIEW")}
    out = suggest(clinic_job(), FakeRuntime(prefs={**prefs, "inc-clinic": 1.0, "POSSIBLE_LIFE_SAFETY": 0.9}))
    assert out["action"] == "REQUEST_REVIEW"


def test_low_confidence_lower_label_cannot_downgrade_an_existing_concern():
    prefs = {"ATTACH_REPORT": 0.9, "inc-clinic": 0.9,
             "INFORMATION": 0.55, "POSSIBLE_LIFE_SAFETY": 0.40, "ACTIVE_NEED": 0.05}
    out = suggest(clinic_job(), FakeRuntime(prefs=prefs))
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)


def test_uncertain_possible_harm_is_not_defaulted_to_a_lower_label():
    prefs = {"NEW_INCIDENT": 0.9, "POSSIBLE_LIFE_SAFETY": 0.45, "ACTIVE_NEED": 0.30, "INFORMATION": 0.25}
    out = suggest(make_job("Might have seen a light moving in the flooded farmhouse."), FakeRuntime(prefs=prefs))
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)


def test_late_older_all_clear_cannot_quietly_downgrade_a_newer_concern():
    newer = report("rep-2", "Someone may still be upstairs in the clinic.", 5, sent_at="2026-10-25T09:40:00Z")
    job = make_job("Earlier this morning: clinic fully evacuated.", seq=9, sent_at="2026-10-25T08:00:00Z",
                   relevant=[newer],
                   candidates=[incident("inc-clinic", "POSSIBLE_LIFE_SAFETY", ["rep-2"], revision=4)])
    prefs = {"ATTACH_REPORT": 0.9, "inc-clinic": 0.9, "INFORMATION": 0.6, "POSSIBLE_LIFE_SAFETY": 0.4}
    out = suggest(job, FakeRuntime(prefs=prefs))
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)


def test_suggest_never_mutates_the_job_or_its_confirmed_incidents():
    job = clinic_job()
    before = copy.deepcopy(job)
    suggest(job, FakeRuntime(prefs={"FLAG_CORRECTION": 0.9, "inc-clinic": 0.9, "INFORMATION": 0.99}))
    assert job == before


def test_a_suggestion_carries_no_confirmed_state_fields():
    out = suggest(clinic_job(), FakeRuntime(prefs={"ATTACH_REPORT": 0.9, "inc-clinic": 0.9}))
    assert not {"status", "revision", "confirmedReportIds", "summary", "approved"} & set(out)


def test_future_truth_in_a_job_never_reaches_the_model():
    job = clinic_job()
    job["expectedAttention"] = "SENTINEL_EXPECTED_LABEL"
    job["futureReports"] = [{"text": "SENTINEL_FUTURE_REPORT"}]
    job["candidateIncidents"][0]["desiredRank"] = "SENTINEL_DESIRED_RANK"
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9})
    try:
        suggest(job, runtime)
    except InvalidJob:
        pass
    sent = " ".join(text + repr(questions) for text, questions in runtime.calls)
    assert "SENTINEL" not in sent


def test_model_state_is_plain_sentences_not_json():
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9})
    suggest(clinic_job(), runtime)
    for text, _ in runtime.calls:
        assert "{" not in text and '"reportId"' not in text and "confirmedReportIds" not in text


def test_original_report_text_reaches_the_model_unchanged():
    original = "Clinic:  2nd-floor window — someone waving?  Can't tell."
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9})
    suggest(clinic_job(original), runtime)
    assert runtime.calls and all(original in text for text, _ in runtime.calls)


def test_attention_output_only_uses_section5_labels():
    out = suggest(clinic_job(), FakeRuntime(prefs={"ATTACH_REPORT": 0.9, "inc-clinic": 0.9,
                                                   "ACTIVE_NEED": 0.95}))
    assert out["attention"] in (*ATTENTION, None)
