"""Download the pinned public checkpoint once into LAYA_MODEL_PATH; serving never downloads models.

Ported from flyby tools/setup_laya.py.
    LAYA_MODEL_PATH=<dir outside git> python services/local-laya/tools/setup_laya.py
"""
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from huggingface_hub import snapshot_download  # noqa: E402

from laya_worker.config import LAYA_MODEL_ID, LAYA_REVISION, LAYA_RUNTIME, settings  # noqa: E402

LICENSE_URL = "https://raw.githubusercontent.com/NandhaKishorM/laya/main/LICENSE"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    target = settings().model_path
    if not str(target) or str(target) == ".":
        sys.exit("Set LAYA_MODEL_PATH to a directory outside the repository.")
    path = Path(snapshot_download(
        LAYA_MODEL_ID,
        revision=LAYA_REVISION,
        allow_patterns=["rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*",
                        "rl_agent_api.py", "rl_common.py", "README.md"],
        local_dir=str(target),
    ))
    with urlopen(LICENSE_URL, timeout=30) as response:
        (path / "LICENSE").write_bytes(response.read())
    weights = path / "model.safetensors"
    (path / "provenance.json").write_text(json.dumps({
        "model": LAYA_MODEL_ID, "revision": LAYA_REVISION, "runtime": LAYA_RUNTIME,
        "model_safetensors_sha256": sha256(weights), "model_safetensors_bytes": weights.stat().st_size,
        "license": "Apache-2.0", "license_url": LICENSE_URL,
    }, indent=2) + "\n")
    print(f"Laya installed locally at {path}")


if __name__ == "__main__":
    main()
