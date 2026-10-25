"""Shared fixtures for the local-laya tests (G4 onward).

Two kinds of test live here and the output keeps them apart (§20 G4):

* contract tests run against `FakeRuntime`, a mock. They prove worker behavior, never model quality.
* `@pytest.mark.model` tests load the real Laya checkpoint from LAYA_MODEL_PATH (weights stay outside git).
  Without it they SKIP with an "unavailable" reason. A skip is unavailable evidence, never a pass.

Helpers (labels, schema mirror, job builders, FakeRuntime) live in laya_g4_helpers.py.
"""
import os
import sys
from pathlib import Path

import pytest

SERVICE = Path(__file__).resolve().parent.parent
if str(SERVICE) not in sys.path:
    sys.path.insert(0, str(SERVICE))

from laya_g4_helpers import LOCAL_SUGGESTION  # noqa: E402


CONTRACT_PY = SERVICE.parent.parent / "packages" / "domain" / "python"


def domain_contract():
    """packages/domain's Python validator, or None until G0 [contract] v1 is merged into this branch."""
    if not (CONTRACT_PY / "domain_contract.py").is_file():
        return None
    if str(CONTRACT_PY) not in sys.path:
        sys.path.insert(0, str(CONTRACT_PY))
    import domain_contract as contract
    return contract


@pytest.fixture
def validate():
    contract = domain_contract()

    def check(suggestion):
        if contract:
            assert contract.validate("LocalSuggestion", suggestion) == []
        else:
            import jsonschema
            jsonschema.validate(suggestion, LOCAL_SUGGESTION)
        return suggestion
    return check


@pytest.fixture
def contract():
    found = domain_contract()
    if found is None:
        pytest.skip("unavailable: packages/domain contract v1 not merged into this branch yet")
    return found


def pytest_configure(config):
    config.addinivalue_line("markers", "model: needs the real Laya checkpoint at LAYA_MODEL_PATH")


@pytest.fixture(scope="session")
def real_runtime():
    """The real model, loaded once per session. Skips as unavailable when the weights are absent."""
    if not os.environ.get("LAYA_MODEL_PATH"):
        pytest.skip("unavailable: LAYA_MODEL_PATH is not set")
    try:
        import laya  # noqa: F401
    except ImportError as error:
        pytest.skip(f"unavailable: laya runtime not installed ({error})")
    from laya_worker.runtime import LayaUnavailable, load
    try:
        return load()
    except LayaUnavailable as error:
        pytest.skip(f"unavailable: {error}")
