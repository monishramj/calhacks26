"""Shared fixtures for the codec-radio tests (G1 onward).

Two kinds of test live here, and the output must keep them apart (§20 G1):

* model-free: header, parser, raw/Unishox2 paths. They need only numpy and a Unishox2 module.
* `@pytest.mark.model`: real SmolLM2 encode/decode. They need CODEC_MODEL_PATH, CODEC_CONTEXT_PATH and an importable
  llama_cpp build. When any of those is missing they SKIP with an "unavailable" reason. A skip is unavailable
  evidence, never a pass.
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
    missing = [v for v in ("CODEC_MODEL_PATH", "CODEC_CONTEXT_PATH") if not os.environ.get(v)]
    if missing:
        pytest.skip(f"unavailable: {', '.join(missing)} not set")
    for v in ("CODEC_MODEL_PATH", "CODEC_CONTEXT_PATH"):
        if not Path(os.environ[v]).is_file():
            pytest.skip(f"unavailable: {v}={os.environ[v]} does not exist")
    try:
        importlib.import_module("llama_cpp")
    except Exception as e:  # ImportError or a failed shared-library load
        pytest.skip(f"unavailable: llama_cpp runtime ({e!r})")
    ctx = Path(os.environ["CODEC_CONTEXT_PATH"]).read_text(encoding="utf-8")
    return mc.SharedModel(os.environ["CODEC_MODEL_PATH"], ctx, MODEL_ID)
