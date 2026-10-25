"""G4 contract: a job in, one schema-valid §17 LocalSuggestion out. Mocked runtime only (no model quality)."""
import math

import pytest

from laya_g4_helpers import (ACTIONS, ATTENTION, NEEDS_CANDIDATE, FakeRuntime, clinic_job, incident, make_job,
                             report)
from laya_worker.suggest import suggest


def run(job, **prefs):
    runtime = FakeRuntime(prefs={"ATTACH_REPORT": 0.9, "inc-clinic": 0.9, "POSSIBLE_LIFE_SAFETY": 0.9, **prefs})
    return suggest(job, runtime), runtime


def test_fixture_jobs_are_contract_job_inputs(contract):
    from laya_g4_dev_cases import JOBS
    for job in (clinic_job(), *JOBS.values()):
        assert contract.validate("JobInput", job) == []


def test_output_is_a_schema_valid_local_suggestion(validate):
    validate(run(clinic_job())[0])


def test_identity_fields_echo_the_job_and_provider_is_local_laya():
    job = clinic_job()
    out, _ = run(job)
    assert (out["runId"], out["reportId"]) == (job["runId"], job["targetReportId"])
    assert out["provider"] == "local_laya"


def test_input_signature_is_returned_unchanged():
    job = clinic_job()
    job["inputSignature"] = "sig1:rep-1.rep-new.inc-clinic.3"
    assert run(job)[0]["inputSignature"] == "sig1:rep-1.rep-new.inc-clinic.3"


def test_base_incident_versions_are_the_candidate_revisions_seen():
    job = clinic_job()
    job["candidateIncidents"].append(incident("inc-shelter", "ACTIVE_NEED", [], revision=7))
    assert run(job)[0]["baseIncidentVersions"] == {"inc-clinic": 3, "inc-shelter": 7}


@pytest.mark.parametrize("action", NEEDS_CANDIDATE)
def test_linking_actions_name_an_offered_candidate(action):
    out, _ = run(clinic_job(), **{action: 5.0})
    assert out["action"] == action
    assert out["candidateIncidentId"] == "inc-clinic"


def test_new_incident_has_no_candidate():
    out, _ = run(clinic_job("A family is on the roof of the bakery on Mill Lane."), NEW_INCIDENT=5.0)
    assert out["action"] == "NEW_INCIDENT"
    assert out["candidateIncidentId"] is None


def test_candidate_is_always_one_of_the_job_candidates():
    job = clinic_job()
    job["candidateIncidents"].append(incident("inc-shelter", "ACTIVE_NEED", [], revision=2))
    out, _ = run(job, **{"inc-shelter": 5.0})
    assert out["candidateIncidentId"] in (None, "inc-clinic", "inc-shelter")
    assert out["candidateIncidentId"] == "inc-shelter"


def test_without_candidates_nothing_can_be_attached():
    job = make_job("Two people heard calling for help near the old mill.")
    out, runtime = run(job, ATTACH_REPORT=50.0, FLAG_CORRECTION=50.0, FLAG_CONFLICT=50.0)
    assert out["action"] in ("NEW_INCIDENT", "REQUEST_REVIEW")
    assert out["candidateIncidentId"] is None
    assert runtime.calls, "the model is still asked about attention"


def test_attention_is_a_section5_label_or_null():
    out, _ = run(clinic_job())
    assert out["attention"] in (*ATTENTION, None)


def test_scores_expose_every_action_and_attention_option():
    labels = {s["label"] for s in run(clinic_job())[0]["scores"]}
    assert set(ACTIONS) <= labels
    assert set(ATTENTION) <= labels


def test_choice_scores_are_probabilities_that_sum_to_one():
    scores = run(clinic_job())[0]["scores"]
    for group in (ACTIONS, ATTENTION):
        picked = [s for s in scores if s["label"] in group]
        assert all(s["kind"] == "probability" for s in picked)
        assert all(0 <= s["value"] <= 1 for s in picked)
        assert math.isclose(sum(s["value"] for s in picked), 1, abs_tol=1e-3)


def test_score_values_are_finite_and_in_range():
    for score in run(clinic_job())[0]["scores"]:
        assert math.isfinite(score["value"])
        assert score["value"] >= 0
        if score["kind"] == "probability":
            assert score["value"] <= 1


def test_sdk_entropy_confidence_never_becomes_a_score():
    scores = run(clinic_job())[0]["scores"]
    assert not any("confidence" in s["label"].lower() for s in scores)
    assert FakeRuntime.ENTROPY_CONFIDENCE not in [s["value"] for s in scores]


def test_evidence_is_the_new_report_plus_known_inputs_only():
    job = clinic_job()
    out, _ = run(job)
    known = {r["reportId"] for r in job["reports"]}
    known |= {rid for c in job["candidateIncidents"] for rid in c["confirmedReportIds"]}
    assert job["targetReportId"] in out["evidenceReportIds"]
    assert set(out["evidenceReportIds"]) <= known


def test_model_is_asked_only_offered_labels():
    job = clinic_job()
    _, runtime = run(job)
    allowed = set(ACTIONS) | set(ATTENTION) | {c["incidentId"] for c in job["candidateIncidents"]}
    for _, questions in runtime.calls:
        for question in questions.values():
            if question["type"] == "choice":
                assert set(question["criteria"]) <= allowed


def test_reports_are_rendered_in_receive_sequence_order():
    job = make_job("Clinic: generator restarted.", seq=9,
                   candidates=[incident("inc-clinic", "POSSIBLE_LIFE_SAFETY", ["rep-a", "rep-b"])],
                   relevant=[report("rep-b", "Second floor still not checked.", 5),
                             report("rep-a", "Patients may be upstairs.", 2)])
    _, runtime = run(job)
    text = runtime.calls[0][0]
    assert text.index("Patients may be upstairs.") < text.index("Second floor still not checked.")
    assert text.index("Second floor still not checked.") < text.index("Clinic: generator restarted.")
