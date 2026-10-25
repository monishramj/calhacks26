"""Preflight smoke: load Laya once, record load time, raw typed outputs, token room, and warm latency.

Ported from flyby tools/laya_smoke.py. Toy inputs are authored here for timing and output shape only;
they are not the §18 exercise and carry no expected labels.
    LAYA_MODEL_PATH=<dir> python services/local-laya/tools/laya_smoke.py [--calls 50]
"""
import argparse
import json
import math
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402

from laya_worker.config import LAYA_REVISION, LAYA_RUNTIME, settings  # noqa: E402
from laya_worker.runtime import load  # noqa: E402

QUESTIONS = {
    "action": {
        "type": "choice",
        "instructions": "What should the incident desk do with the new report?",
        "criteria": {
            "NEW_INCIDENT": "it describes a different place or problem than every open incident",
            "ATTACH_REPORT": "it adds information to one open incident",
            "FLAG_CORRECTION": "it corrects or narrows something an earlier report said",
            "FLAG_CONFLICT": "it contradicts an earlier report",
            "REQUEST_REVIEW": "it is unclear; a person should decide",
        },
    },
    "attention": {
        "type": "choice",
        "instructions": "Which attention category fits the new report?",
        "criteria": {
            "POSSIBLE_LIFE_SAFETY": "someone may be hurt, trapped, or in danger",
            "ACTIVE_NEED": "people need supplies or help, but no one is in danger",
            "INFORMATION": "status or background with no open need",
        },
    },
    "possible_harm": {"type": "noul", "instructions": "Does the new report say someone may still be in danger?"},
}

TOY_STATES = [
    "Open incident A: a bridge on the north road is closed by debris. "
    "New report: The north road bridge is still blocked, trucks are turning back.",
    "Open incident A: the library basement has a burst pipe. "
    "New report: A family of three is stuck on the roof of the bakery as water rises.",
    "Open incident A: the clinic generator failed. Open incident B: the market needs drinking water. "
    "New report: Correction: the clinic generator is running again, only the lights are out.",
    "Open incident A: the community hall is a warming center. "
    "New report: Is anyone still at the community hall?",
    "No open incidents. New report: Two people heard calling for help near the old mill.",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--calls", type=int, default=50)
    args = parser.parse_args()
    cfg = settings()
    runtime = load(cfg)
    import torch
    first = runtime.ask(TOY_STATES[0], QUESTIONS)  # first call after load, reported separately
    samples = [{"state": s, **runtime.ask(s, QUESTIONS)} for s in TOY_STATES]
    latencies = [runtime.ask(TOY_STATES[i % len(TOY_STATES)], QUESTIONS)["latency_ms"] for i in range(args.calls)]
    p50, p95 = (float(v) for v in np.percentile(latencies, [50, 95]))
    report = {
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "label": "measured (live local Laya, authored toy inputs)",
        "runtime": LAYA_RUNTIME, "revision": LAYA_REVISION, "device": runtime.device,
        "torch": torch.__version__, "torch_threads": torch.get_num_threads(),
        "python": platform.python_version(), "machine": platform.platform(), "cpu": platform.processor(),
        "load_ms": runtime.load_ms, "first_call_ms": first["latency_ms"],
        "warm_calls": len(latencies), "questions_per_call": len(QUESTIONS),
        "p50_ms": p50, "p95_ms": p95, "recommended_timeout_ms": math.ceil(3 * p95),
        "max_len": runtime.max_len, "head_max_len": runtime.head_max_len,
        "state_room_tokens": {qid: runtime.state_room(q) for qid, q in QUESTIONS.items()},
        "samples": samples, "latencies_ms": latencies,
    }
    cfg.results_dir.mkdir(parents=True, exist_ok=True)
    output = cfg.results_dir / f"laya_smoke_{runtime.device}.json"
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ("samples", "latencies_ms")}, indent=2))
    print(json.dumps(samples[1], indent=2))
    print(f"Report: {output}")


if __name__ == "__main__":
    main()
