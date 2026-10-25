"""G1: the batch comparison driver must not hide normalization (§3, §20 G1 REVIEW).

codec/poc_run.py produced the stored 400/400 result. It records the text it compared, so a driver that cleans
the text before encoding can report a perfect round trip on text the sender never typed.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SERVICE = Path(__file__).resolve().parent.parent
TEXT = "Two  people   upstairs,\tone needs insulin."   # repeated spaces and a tab


@pytest.mark.model
def test_poc_run_records_and_checks_the_original_text(model, tmp_path):
    src = tmp_path / "in.jsonl"
    src.write_text(json.dumps({"id": "t1", "text": TEXT}) + "\n", encoding="utf-8")
    enc, dec = tmp_path / "enc.jsonl", tmp_path / "dec.jsonl"
    env = dict(os.environ)
    common = [os.environ["CODEC_MODEL_PATH"], "2", os.environ["CODEC_CONTEXT_PATH"]]
    run = lambda *a: subprocess.run([sys.executable, str(SERVICE / "codec" / "poc_run.py"), *a],  # noqa: E731
                                    capture_output=True, text=True, env=env, timeout=600)
    p = run("encode", *common, str(src), str(enc), "0:1")
    assert p.returncode == 0, p.stderr[-1500:]
    rec = json.loads(enc.read_text(encoding="utf-8").splitlines()[0])
    assert rec["text"] == TEXT, f"driver compared normalized text {rec['text']!r}, not the original"
    assert rec["utf8_bytes"] == len(TEXT.encode())
    p = run("decode", *common, str(enc), str(dec), "0:1")
    assert p.returncode == 0, p.stderr[-1500:]
    out = json.loads(dec.read_text(encoding="utf-8").splitlines()[0])
    assert out["ok_chosen"] is True
