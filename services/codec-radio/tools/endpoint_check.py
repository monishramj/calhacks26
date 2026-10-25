"""Prove this machine is a compatible codec endpoint, in one run.

    set CODEC_MODEL_PATH=C:\\path\\to\\SmolLM2-360M.Q8_0.gguf
    python services/codec-radio/tools/endpoint_check.py

It prints, and writes to services/codec-radio/logs/endpoint-<host>-<time>.json:

1. CPU/OS/Python, and the SHA-256 of the pinned runtime, the model and the context (runtime.load() refuses any
   mismatch).
2. runtime.fingerprint(). Every endpoint must print the reference 422ac23fca10.
3. Decode, C1 -> here: the first N packets of results/smol_pk.jsonl, which the kit encoded on C1 (AMD Ryzen,
   Windows). Each must parse ok with text identical to the stored text.
4. Encode, here -> others: the fixed probe texts in tools/endpoint_ref.json. Each packet must be byte-identical to
   the reference (encoded on the Linux pinned runtime, fingerprint 422ac23fca10) and must decode back here to the
   exact text. Identical bytes mean any matching endpoint decodes them; the packets are also saved in the log so
   another machine can decode them independently.

Exit code 0 only if every check passes. A missing model is reported as unavailable, never as a pass.
`--make-ref` regenerates tools/endpoint_ref.json (maintainers only).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SERVICE = TOOLS.parent
sys.path.insert(0, str(SERVICE / "codec"))
import runtime  # noqa: E402  (must be imported before llama_cpp)

REF = TOOLS / "endpoint_ref.json"
KIT_PACKETS = SERVICE / "results" / "smol_pk.jsonl"

# §18 exercise texts plus exact-text cases the model coder cannot carry (they must go raw or Unishox2, unaltered).
PROBES = [
    "School gym evacuation complete. Everyone our team checked is outside.",
    "House beside the school: water rising downstairs, two people waiting upstairs.",
    "Correction: the school gym is clear, but someone may still be upstairs in the main building.",
    "Shelter needs blankets for tonight.",
    "Repeating the school report: possible person upstairs in the main building.",
    "  two leading spaces,  double space, trailing space ",
    "line one\nline two\tafter a tab",
    "Café crème — 避難所 🚑 needs water",
]


def cpu_name() -> str:
    if sys.platform == "win32":
        try:
            out = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_Processor).Name"],
                                 capture_output=True, text=True, timeout=20).stdout.strip()
            if out:
                return out
        except Exception:
            pass
    try:
        for line in open("/proc/cpuinfo", encoding="utf-8"):
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


def make_ref(model, mc) -> None:
    rows = []
    for text in PROBES:
        pkt, method = mc.build_packet(text, model)
        rows.append({"text": text, "method": method, "packet": pkt.hex()})
    REF.write_text(json.dumps({"fingerprint": runtime.fingerprint(model), "probes": rows},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {REF}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", type=int, default=20, help="kit packets to decode (default 20)")
    ap.add_argument("--make-ref", action="store_true")
    args = ap.parse_args()

    if not os.environ.get("CODEC_MODEL_PATH"):
        print("UNAVAILABLE: set CODEC_MODEL_PATH to SmolLM2-360M.Q8_0.gguf")
        return 2

    report = {"host": socket.gethostname(), "cpu": cpu_name(), "os": platform.platform(),
              "python": platform.python_version(), "runtime_dir": runtime.platform_dir().name,
              "time": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    print(f"host {report['host']} | {report['cpu']} | {report['os']} | Python {report['python']}")

    runtime.verify_runtime()
    report["model_sha256"] = runtime.sha256(runtime.model_path())
    report["context_sha256"] = runtime.sha256(runtime.context_path())
    print(f"runtime {report['runtime_dir']}: all SHA256SUMS match")
    print(f"model   {report['model_sha256']}")
    print(f"context {report['context_sha256']}")
    model = runtime.load()  # rechecks every pinned hash; raises on any mismatch
    import mesh_codec as mc

    if args.make_ref:
        make_ref(model, mc)
        return 0

    fp = runtime.fingerprint(model)
    report["fingerprint"] = fp
    fp_ok = fp == runtime.REFERENCE_FINGERPRINT
    print(f"fingerprint {fp}  {'OK' if fp_ok else 'MISMATCH, expected ' + runtime.REFERENCE_FINGERPRINT}")

    # C1 -> here
    rows = [json.loads(l) for l in KIT_PACKETS.read_text(encoding="utf-8").splitlines()[: args.n]]
    dec_fail, t0 = [], time.time()
    for r in rows:
        res = mc.parse_packet(bytes.fromhex(r["packet"]), model)
        if not (res.get("ok") and res.get("text") == r["text"]):
            dec_fail.append({"id": r["id"], "reason": res.get("reason"), "got": res.get("text")})
    dec_s = time.time() - t0
    report["decode_c1_packets"] = {"checked": len(rows), "failed": dec_fail, "seconds": round(dec_s, 1)}
    print(f"decode C1-encoded kit packets: {len(rows) - len(dec_fail)}/{len(rows)} exact ({dec_s:.1f} s)")

    # here -> others
    ref = json.loads(REF.read_text(encoding="utf-8"))["probes"]
    enc_rows, enc_fail = [], []
    for want in ref:
        pkt, method = mc.build_packet(want["text"], model)
        back = mc.parse_packet(pkt, model)
        same = pkt.hex() == want["packet"]
        exact = bool(back.get("ok")) and back.get("text") == want["text"]
        enc_rows.append({"text": want["text"], "method": method, "packet": pkt.hex(),
                         "matches_reference": same, "self_decode_exact": exact})
        if not (same and exact):
            enc_fail.append(want["text"])
    report["encode_probes"] = enc_rows
    print(f"encode probes: {len(ref) - len(enc_fail)}/{len(ref)} byte-identical to reference and exact on decode")
    for t in enc_fail:
        print(f"  FAIL: {t!r}")

    ok = fp_ok and not dec_fail and not enc_fail
    report["result"] = "PASS" if ok else "FAIL"
    logs = SERVICE / "logs"
    logs.mkdir(exist_ok=True)
    out = logs / f"endpoint-{report['host']}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"RESULT {report['result']}  (log: {out})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
