"""Optional, uncalibrated action/attention head on stock Laya marker features."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

import torch

from laya_worker.config import LAYA_REVISION, LAYA_WEIGHTS_SHA256
from laya_worker.runtime import LayaUnavailable


def question_hash():
    from laya_worker.suggest import ACTION, ATTENTION
    return hashlib.sha256(json.dumps([ACTION, ATTENTION], sort_keys=True).encode()).hexdigest()


def load_scorer(runtime, path):
    cached = getattr(runtime, '_incident_scorer', None)
    if cached is not None and cached[0] == path:
        return cached[1:]
    try:
        payload = torch.load(path, map_location='cpu', weights_only=True)
        if (payload['revision'] != LAYA_REVISION or payload['base_sha256'] != LAYA_WEIGHTS_SHA256
                or payload['question_sha256'] != question_hash()):
            raise ValueError('Scorer base revision or questions differ')
        head = deepcopy(runtime.agent.model.scorer).cpu().float()
        head.load_state_dict(payload['scorer'], strict=True)
        if not all(torch.isfinite(p).all() for p in head.parameters()):
            raise ValueError('Nonfinite scorer')
        temperatures = payload['temperatures']
        if set(temperatures) != {'action', 'attention'} or any(
                not isinstance(t, (float, int)) or not 0 < t < 100 for t in temperatures.values()):
            raise ValueError('Invalid temperatures')
        head.eval().requires_grad_(False)
        provenance = dict(kind='fine_tuned_head', scores='uncalibrated fine-tuned-head scores (softmax)',
                          base_revision=payload['revision'], data_sha256=payload['data_sha256'],
                          scorer_sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                          decisions=['action', 'attention'], candidate_selector='stock_laya',
                          safety='stock and tuned harm floors retained')
    except Exception as error:
        raise LayaUnavailable('Optional Laya scorer could not be loaded') from error
    runtime._incident_scorer = (path, head, temperatures, provenance)
    return head, temperatures, provenance


def ask_with_scorer(runtime, state, questions, path):
    head, temperatures, _ = load_scorer(runtime, path)
    captured = []
    hook = runtime.agent.model.scorer.register_forward_pre_hook(
        lambda module, args: captured.append(args[0].detach().float().cpu()))
    try:
        answers = runtime.ask(state, questions)['answers']
    finally:
        hook.remove()
    stock_harm = answers['attention']['probabilities']['POSSIBLE_LIFE_SAFETY']
    if len(captured) != 1 or captured[0].shape[0] != len(questions):
        raise LayaUnavailable('Unexpected Laya feature shape')
    with torch.no_grad():
        for index, (qid, question) in enumerate(questions.items()):
            if qid not in temperatures:
                continue
            labels = list(question['criteria'])
            values = torch.softmax(head(captured[0][index, :len(labels)]).squeeze(-1) / temperatures[qid], -1).tolist()
            probs = dict(zip(labels, values))
            answers[qid] = dict(choice=max(probs, key=probs.get), probabilities=probs)
    return answers, stock_harm
