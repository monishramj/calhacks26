"""Freeze Laya, cache marker features, fit only a copy of its small scorer MLP. Entirely offline."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ.pop('LAYA_SCORER_PATH', None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torch
from laya_worker.config import LAYA_REVISION, LAYA_WEIGHTS_SHA256
from laya_worker.runtime import load
from laya_worker.suggest import ACTION, ATTENTION, suggest
from finetune.scorer import question_hash

ROOT = Path(__file__).resolve().parents[3]
DATA = Path(__file__).with_name('train.jsonl')
OUTPUT = ROOT / 'models/laya_incident_scorer.pt'
LABELS = {'action': list(ACTION['criteria']), 'attention': list(ATTENTION['criteria'])}


def metrics(head, features, labels, temperatures, indices):
    result = {}
    with torch.no_grad():
        for qid in LABELS:
            logits = head(features[qid][indices]).squeeze(-1) / temperatures[qid]
            p = logits.softmax(-1)
            top = p.topk(2).values
            accepted = (top[:, 0] >= .6) & ((top[:, 0] - top[:, 1]) >= .2)
            correct = p.argmax(-1) == labels[qid][indices]
            result[qid] = dict(accuracy=float(correct.float().mean()),
                               cross_entropy=float(torch.nn.functional.cross_entropy(logits, labels[qid][indices])),
                               certain=int(accepted.sum()), total=len(indices),
                               certain_accuracy=float(correct[accepted].float().mean()) if accepted.any() else None)
    return result


def main():
    torch.manual_seed(17)
    torch.set_num_threads(4)
    rows = [json.loads(line) for line in DATA.read_text().splitlines()]
    assert len(rows) >= 150 and len({r['id'] for r in rows}) == len(rows)
    train = torch.tensor([i for i, r in enumerate(rows) if r['split'] == 'train'])
    val = torch.tensor([i for i, r in enumerate(rows) if r['split'] == 'val'])
    assert len(val) * 5 == len(rows) and len(train) + len(val) == len(rows)
    assert not {rows[i]['group'] for i in train} & {rows[i]['group'] for i in val}
    runtime = load()
    runtime.agent.model.eval().requires_grad_(False)
    temperature = runtime.agent.temperature_by_options.get('choice:3-5', runtime.agent.temperature[0])
    temperatures = dict(action=temperature, attention=temperature)
    features = {key: [] for key in LABELS}
    for i, row in enumerate(rows):
        captured = []
        hook = runtime.agent.model.scorer.register_forward_pre_hook(
            lambda module, args: captured.append(args[0].detach().float().cpu().clone()))
        try:
            suggest(row['job'], runtime)
        finally:
            hook.remove()
        assert len(captured) == 1, f'{row["id"]}: truncated or missing features'
        for j, key in enumerate(LABELS):
            features[key].append(captured[0][j, :len(LABELS[key])].clone())
        if i % 20 == 0:
            print(f'embedded {i + 1}/{len(rows)}', flush=True)
    features = {key: torch.stack(value) for key, value in features.items()}
    labels = {key: torch.tensor([LABELS[key].index(r[key]) for r in rows]) for key in LABELS}
    data_hash = hashlib.sha256(DATA.read_bytes()).hexdigest()
    torch.save(dict(features=features, labels=labels, data_sha256=data_hash), ROOT / 'models/laya_incident_features.pt')
    head = copy.deepcopy(runtime.agent.model.scorer).float().train().requires_grad_(True)
    before = metrics(head, features, labels, temperatures, val)
    optimizer = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=.05)
    best_loss, best, best_epoch = float('inf'), None, None
    for epoch in range(400):
        head.train()
        for batch in train[torch.randperm(len(train))].split(32):
            loss = sum(torch.nn.functional.cross_entropy(
                head(features[key][batch]).squeeze(-1) / temperatures[key], labels[key][batch]) for key in LABELS)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        head.eval()
        validation = metrics(head, features, labels, temperatures, val)
        val_loss = sum(v['cross_entropy'] for v in validation.values())
        if val_loss < best_loss:
            best_loss, best, best_epoch = val_loss, copy.deepcopy(head.state_dict()), epoch + 1
        if (epoch + 1) % 50 == 0:
            print(f'epoch {epoch + 1}: {json.dumps(validation)}', flush=True)
    head.load_state_dict(best)
    payload = dict(scorer=best, revision=LAYA_REVISION, base_sha256=LAYA_WEIGHTS_SHA256,
                   data_sha256=data_hash, question_sha256=question_hash(), temperatures=temperatures)
    torch.save(payload, OUTPUT)
    report = {k: v for k, v in payload.items() if k != 'scorer'}
    report.update(seed=17, epochs=400, selected_epoch=best_epoch, selection='minimum validation cross entropy',
                  examples=len(rows), train_size=len(train), val_size=len(val),
                  split='20% disjoint wording groups; places shared; synthetic validation only',
                  scorer_parameters=sum(p.numel() for p in head.parameters()),
                  stock_val=before, train=metrics(head, features, labels, temperatures, train),
                  val=metrics(head, features, labels, temperatures, val),
                  train_ids=[rows[i]['id'] for i in train], val_ids=[rows[i]['id'] for i in val])
    OUTPUT.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('selected_epoch', 'train', 'val')}, indent=2), flush=True)


if __name__ == '__main__':
    main()
