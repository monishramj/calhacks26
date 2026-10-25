"""Choose the action p_min per scorer mode on the fine-tune VALIDATION split only (rows with split == 'val').

Rule: sweep p_min 0.25..0.60 step 0.01, margin fixed 0.2. Pick the lowest p_min whose accepted actions
(top p >= p_min and margin >= 0.2) are >= 90% correct with >= 5 accepted; otherwise keep 0.6 for that mode.
Uses the cached marker features; no evaluation-set, exercise or replay data is read.
Run: LAYA_MODEL_PATH=... python -m finetune.threshold [models_dir]   (from services/local-laya)
"""
import datetime
from copy import deepcopy
import hashlib
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from laya_worker.runtime import load

MARGIN, MIN_PRECISION, MIN_ACCEPTED, FALLBACK = 0.2, 0.9, 5, 0.6
DATA = Path(__file__).with_name("train.jsonl")
OUT = Path(__file__).with_name("threshold.json")


def sweep(probs, labels):
    top = probs.topk(2).values
    correct = probs.argmax(-1) == labels
    rows = []
    for k in range(25, 61):
        p_min = k / 100
        ok = (top[:, 0] >= p_min) & (top[:, 0] - top[:, 1] >= MARGIN)
        n = int(ok.sum())
        rows.append(dict(p_min=p_min, accepted=n, coverage=n / len(labels),
                         precision=float(correct[ok].float().mean()) if n else None))
    return rows


def choose(rows):
    for r in rows:
        if r["accepted"] >= MIN_ACCEPTED and r["precision"] >= MIN_PRECISION:
            return r["p_min"]
    return FALLBACK


def main(models=Path(__file__).resolve().parents[3] / "models"):
    models = Path(models)
    cache = torch.load(models / "laya_incident_features.pt", weights_only=True)
    sidecar = json.loads((models / "laya_incident_scorer.json").read_text())
    data_hash = hashlib.sha256(DATA.read_bytes()).hexdigest()
    assert cache["data_sha256"] == sidecar["data_sha256"] == data_hash
    rows = [json.loads(line) for line in DATA.read_text().splitlines()]
    val = [i for i, r in enumerate(rows) if r["split"] == "val"]
    assert len(val) == 40 and [rows[i]["id"] for i in val] == sidecar["val_ids"]
    labels = cache["labels"]["action"][val]
    feats = cache["features"]["action"][val]
    runtime = load()
    stock = runtime.agent.model.scorer.float().eval()
    head = deepcopy(stock)
    head.load_state_dict(torch.load(models / "laya_incident_scorer.pt", weights_only=True)["scorer"])
    t = sidecar["temperatures"]["action"]
    result = {}
    with torch.no_grad():
        for mode, m in (("stock", stock), ("head", head.eval())):
            table = sweep((m(feats).squeeze(-1) / t).softmax(-1), labels)
            result[mode] = dict(action_p_min=choose(table), sweep=table)
    out = dict(rule=__doc__.split("\n")[2], margin=MARGIN, split="val", val_examples=len(val),
               data_sha256=data_hash, date=datetime.date.today().isoformat(), **result)
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    for mode in ("stock", "head"):
        p = result[mode]["action_p_min"]
        print(mode, p, [r for r in result[mode]["sweep"] if r["p_min"] == p])


if __name__ == "__main__":
    main(*sys.argv[1:])
