"""Shared fixtures for the codec-radio tests (G1 onward).

Two kinds of test live here, and the output must keep them apart (§20 G1):

* model-free: header, parser, raw/Unishox2 paths. They need only numpy and a Unishox2 module.
* `@pytest.mark.model`: real SmolLM2 encode/decode. They need CODEC_MODEL_PATH (weights stay outside git). The
  context defaults to data/context_primed.txt. On x86-64 Windows/Linux they run on the pinned runtime in
  runtime/<platform>/ (codec/runtime.py checks its hashes). Elsewhere they need an importable llama_cpp. When any of
  that is missing they SKIP with an "unavailable" reason. A skip is unavailable evidence, never a pass.
"""
import importlib
import os
import sys
from pathlib import Path

import pytest

SERVICE = Path(__file__).resolve().parent.parent
CODEC_DIR = SERVICE / "codec"
MODEL_ID = 2  # the kit's model id for SmolLM2-360M (poc_run.py / stored results)

if str(CODEC_DIR) not in sys.path:
    sys.path.insert(0, str(CODEC_DIR))


def pytest_configure(config):
    config.addinivalue_line("markers", "model: needs the real codec model, context and llama.cpp runtime")


@pytest.fixture(scope="session")
def mc():
    """The production codec library (services/codec-radio/codec/mesh_codec.py)."""
    try:
        importlib.import_module("unishox2")  # mesh_codec imports it lazily; fail here with a clear reason
    except ImportError as e:
        pytest.skip(f"unavailable: no Unishox2 module ({e})")
    import mesh_codec
    return mesh_codec


@pytest.fixture(scope="session")
def model(mc):
    """A real SharedModel, or a skip that says exactly what is unavailable."""
    import runtime
    if not os.environ.get("CODEC_MODEL_PATH"):
        pytest.skip("unavailable: CODEC_MODEL_PATH not set")
    for path in (runtime.model_path(), runtime.context_path()):
        if not path.is_file():
            pytest.skip(f"unavailable: {path} does not exist")
    if (runtime.platform_dir() / "SHA256SUMS").exists():
        return runtime.load()          # pinned binaries + model/context hash checks
    try:                               # no pinned runtime for this platform: whatever llama_cpp is importable
        importlib.import_module("llama_cpp")
    except Exception as e:
        pytest.skip(f"unavailable: no pinned runtime for {runtime.platform_dir().name} and no llama_cpp ({e!r})")
    ctx = runtime.context_path().read_text(encoding="utf-8")
    return mc.SharedModel(str(runtime.model_path()), ctx, MODEL_ID)
