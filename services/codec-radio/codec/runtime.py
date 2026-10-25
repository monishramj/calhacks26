"""Load the codec on the pinned llama.cpp runtime, and prove two endpoints compute the same thing.

Encoder and decoder must produce bit-identical logits. That holds only when both endpoints run the same model file,
the same shared context and the same llama.cpp binary, on the CPU (§19). This module enforces all three:

* it points the vendored llama_cpp bindings (third_party/llama_cpp, pure Python) at the pinned binaries in
  runtime/<platform>/ (D-005), never at a pip-installed build;
* it checks the binaries, the model and the context against pinned SHA-256 hashes;
* fingerprint() hashes the integer probability tables for a fixed probe text. Two endpoints that print the same
  fingerprint decode each other's packets.

    import runtime                       # from services/codec-radio/codec
    model = runtime.load()               # mesh_codec.SharedModel; model path from CODEC_MODEL_PATH
    print(runtime.fingerprint(model))    # 422ac23fca10 on every verified endpoint so far

Model weights stay outside git (CODEC_MODEL_PATH). The context defaults to the kit's data/context_primed.txt.
"""
from __future__ import annotations

import hashlib
import os
import platform
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parent.parent
CODEC_DIR = SERVICE / "codec"

MODEL_SHA256 = "8e0b159d81bce47993580827a26ec01e64092edd55165b6076e6fbfa37995eb4"   # SmolLM2-360M.Q8_0.gguf
CONTEXT_SHA256 = "55d73dd75f06c70a4ec84c7d0c9cad2ae71601e4e1956cba9d322719576d5e43"  # data/context_primed.txt
MODEL_ID = 2  # high nibble of packet byte 0 for this model (kit poc_run.py / stored results)
THREADS = max(1, min(4, (os.cpu_count() or 2) // 2))  # thread count never changes the logits, only speed

PROBE = "Water is rising into the school gym on 5th Street, two families on the roof."
# fingerprint() measured with the pinned model and context: identical on the Linux build (Intel Xeon) and the
# win-x64 DLLs (AMD Ryzen 9 270, native Windows 11). An endpoint printing anything else cannot interoperate.
REFERENCE_FINGERPRINT = "422ac23fca10"


def platform_dir() -> Path:
    machine = platform.machine().lower()
    arch = {"amd64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(machine, machine)
    osname = {"win32": "win", "darwin": "macos"}.get(sys.platform, "linux")
    return SERVICE / "runtime" / f"{osname}-{arch}"


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_runtime() -> Path:
    """Check runtime/<platform>/ against its SHA256SUMS. Raises if anything is missing or modified."""
    d = platform_dir()
    sums = d / "SHA256SUMS"
    if not sums.exists():
        raise RuntimeError(f"no pinned codec runtime for {d.name}. Codec endpoints are x86-64 Windows or Linux "
                           f"with AVX2; Apple Silicon computes different logits and cannot be an endpoint.")
    bad = []
    for line in sums.read_text().splitlines():
        if line.strip():
            digest, name = line.split(maxsplit=1)
            p = d / name.strip().lstrip("*")
            if not p.exists() or sha256(p) != digest:
                bad.append(p.name)
    if bad:
        raise RuntimeError(f"pinned runtime files missing or modified in {d}: {bad}")
    return d


def prepare_imports():
    """Make `import llama_cpp` load the vendored bindings on the pinned binaries, and `import mesh_codec` work."""
    os.environ["LLAMA_CPP_LIB_PATH"] = str(platform_dir())
    for p in (str(SERVICE / "third_party"), str(CODEC_DIR)):
        if p not in sys.path:
            sys.path.insert(0, p)
    mod = sys.modules.get("llama_cpp")
    if mod is not None and not str(getattr(mod, "__file__", "")).startswith(str(SERVICE / "third_party")):
        raise RuntimeError("a different llama_cpp was imported before codec.runtime; import runtime first")


def model_path() -> Path:
    p = os.environ.get("CODEC_MODEL_PATH")
    if not p:
        raise RuntimeError("set CODEC_MODEL_PATH to SmolLM2-360M.Q8_0.gguf (weights stay outside git)")
    return Path(p)


def context_path() -> Path:
    return Path(os.environ.get("CODEC_CONTEXT_PATH") or SERVICE / "data" / "context_primed.txt")


def load(check_hashes: bool = True, threads: int = THREADS):
    """A mesh_codec.SharedModel on the pinned runtime, after checking every pinned hash."""
    if check_hashes:
        verify_runtime()
        for path, want in ((model_path(), MODEL_SHA256), (context_path(), CONTEXT_SHA256)):
            got = sha256(path)
            if got != want:
                raise RuntimeError(f"{path} has SHA-256 {got[:12]}…, expected {want[:12]}…: both endpoints "
                                   f"must use the identical file")
    prepare_imports()
    import mesh_codec
    return mesh_codec.SharedModel(str(model_path()), context_path().read_text(encoding="utf-8"), MODEL_ID,
                                  threads=threads)


def fingerprint(model) -> str:
    """12 hex chars over the integer frequency tables the coder uses for PROBE. Equal => endpoints interoperate."""
    import numpy as np
    import mesh_codec
    h = hashlib.sha256()
    lg = model._start()
    for t in model.body_tokens(PROBE):
        h.update(np.ascontiguousarray(mesh_codec.freq_table(lg)).tobytes())
        lg = model._step(t)
    return h.hexdigest()[:12]
