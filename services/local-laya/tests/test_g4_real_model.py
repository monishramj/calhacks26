"""G4 against the real local Laya checkpoint (`-m model`). Skips as unavailable without LAYA_MODEL_PATH.

These assert the contract and the safety invariants on actual model output. Label accuracy against EXPECT is
model evaluation, reported separately (work/validation/G4.md), never a hidden pass/fail threshold here.
"""
import math

import pytest

from laya_g4_dev_cases import EXPECT, JOBS
from laya_g4_helpers import ATTENTION, NEEDS_CANDIDATE
from laya_worker.suggest import suggest

pytestmark = pytest.mark.model


def test_runtime_loads_once_on_the_configured_device(real_runtime):
    assert real_runtime.load_ms > 0
    assert real_runtime.device == "cpu" or real_runtime.device.startswith(("cuda", "mps"))
    assert (real_runtime.max_len, real_runtime.head_max_len) == (512, 192)


def test_real_typed_outputs_match_their_documented_semantics(real_runtime):
    questions = {
        "attention": {"type": "choice", "instructions": "Which attention category fits the new report?",
                      "criteria": list(ATTENTION)},
        "level": {"type": "score", "instructions": "How much help is needed?",
                  "criteria": ["none", "some", "a lot", "urgent"]},
        "harm": {"type": "noul", "instructions": "Could someone still be in danger?"},
    }
    answers = real_runtime.ask("New report: two people heard calling for help near the old mill.",
                               questions)["answers"]
    probs = answers["attention"]["probabilities"]
    assert set(probs) == set(ATTENTION) and math.isclose(sum(probs.values()), 1, abs_tol=1e-3)
    assert 0 <= answers["level"]["score"] <= 3
    assert 0 <= answers["harm"]["noul"] <= 1


def test_dev_jobs_carry_no_expectations():
    for name, job in JOBS.items():
        flat = repr(job)
        assert "keeps_concern" not in flat and "EXPECT" not in flat, name


@pytest.mark.parametrize("name", sorted(JOBS))
def test_real_suggestion_is_contract_valid(name, real_runtime, validate):
    job = JOBS[name]
    out = validate(suggest(job, real_runtime))
    assert out["provider"] == "local_laya" and out["inputSignature"] == job["inputSignature"]
    if out["action"] in NEEDS_CANDIDATE:
        assert out["candidateIncidentId"] in {c["incidentId"] for c in job["candidateIncidents"]}
    for score in out["scores"]:
        assert math.isfinite(score["value"])


@pytest.mark.parametrize("name", sorted(n for n, e in EXPECT.items() if e.get("keeps_concern")))
def test_real_uncertain_possible_harm_never_vanishes(name, real_runtime):
    out = suggest(JOBS[name], real_runtime)
    assert out["attention"] in ("POSSIBLE_LIFE_SAFETY", None)
