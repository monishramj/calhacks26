"""Optional-head isolation, artifact validation, and retained harm floors."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch

from finetune import scorer
from laya_g4_helpers import FakeRuntime, incident, make_job
from laya_worker.config import LAYA_REVISION, LAYA_WEIGHTS_SHA256
from laya_worker.runtime import LayaUnavailable
from laya_worker.server import Worker
from laya_worker.suggest import ACTION, ATTENTION, suggest


@pytest.fixture(autouse=True)
def no_scorer(monkeypatch):
    monkeypatch.delenv('LAYA_SCORER_PATH', raising=False)


@pytest.fixture
def artifact(tmp_path):
    head = torch.nn.Linear(2, 1)
    runtime = FakeRuntime()
    runtime.agent = SimpleNamespace(model=SimpleNamespace(scorer=head))
    payload = dict(scorer=deepcopy(head.state_dict()), revision=LAYA_REVISION,
                   base_sha256=LAYA_WEIGHTS_SHA256, question_sha256=scorer.question_hash(),
                   data_sha256='0' * 64, temperatures=dict(action=1., attention=1.))
    path = tmp_path / 'head.pt'
    torch.save(payload, path)
    return runtime, path, payload


def test_disabled_preserves_stock_behavior(artifact, monkeypatch):
    runtime, _, _ = artifact
    def unexpected(*args):
        pytest.fail('Disabled head must never load')
    monkeypatch.setattr(scorer, 'load_scorer', unexpected)
    worker = Worker(lambda: runtime)
    assert worker.handle('GET', '/health', b'')[1] == {
        'status': 'ready', 'runtime': 'laya==0.3.20', 'revision': LAYA_REVISION}
    out = suggest(make_job('Routine update.'), runtime)
    assert all(s['kind'] == 'probability' for s in out['scores'])


def test_enabled_health_and_cached_frozen_copy(artifact, monkeypatch):
    runtime, path, _ = artifact
    monkeypatch.setenv('LAYA_SCORER_PATH', str(path))
    worker = Worker(lambda: runtime)
    status, health = worker.handle('GET', '/health', b'')
    assert status == 200 and health['scorer']['kind'] == 'fine_tuned_head'
    assert 'fine-tuned-head scores' in health['scorer']['scores']
    head, _, _ = scorer.load_scorer(runtime, str(path))
    assert head is scorer.load_scorer(runtime, str(path))[0]
    assert head is not runtime.agent.model.scorer
    assert not head.training and all(not p.requires_grad for p in head.parameters())
    assert all(p.requires_grad for p in runtime.agent.model.scorer.parameters())


@pytest.mark.parametrize('field,value', [
    ('revision', 'wrong'), ('base_sha256', 'wrong'), ('question_sha256', 'wrong'),
    ('temperatures', dict(action=0., attention=1.)),
    ('temperatures', dict(action=float('nan'), attention=1.)),
    ('scorer', {'weight': torch.full((1, 2), float('nan')), 'bias': torch.zeros(1)}),
])
def test_bad_artifact_fails_closed(artifact, monkeypatch, field, value):
    runtime, path, payload = artifact
    payload[field] = value
    torch.save(payload, path)
    with pytest.raises(LayaUnavailable):
        scorer.load_scorer(runtime, str(path))
    monkeypatch.setenv('LAYA_SCORER_PATH', str(path))
    assert Worker(lambda: runtime).handle('GET', '/health', b'')[0] == 503


def test_head_only_replaces_action_attention_and_removes_hook(artifact):
    runtime, path, _ = artifact
    questions = {'action': ACTION, 'attention': ATTENTION,
                 'candidate': dict(type='choice', criteria=['inc-a', 'inc-b'])}
    original = {q: runtime._answer(value) for q, value in questions.items()}
    weights = deepcopy(runtime.agent.model.scorer.state_dict())
    def ask(state, questions):
        runtime.agent.model.scorer(torch.zeros(3, 5, 2))
        return {'answers': deepcopy(original)}
    runtime.ask = ask
    answers, harm = scorer.ask_with_scorer(runtime, '', questions, str(path))
    assert answers['candidate'] == original['candidate']
    assert harm == original['attention']['probabilities']['POSSIBLE_LIFE_SAFETY']
    assert answers['action']['probabilities']['NEW_INCIDENT'] == pytest.approx(.2)
    assert not runtime.agent.model.scorer._forward_pre_hooks
    assert all(torch.equal(v, weights[k]) for k, v in runtime.agent.model.scorer.state_dict().items())
    def fail(*args):
        raise LayaUnavailable('inference failed')
    runtime.ask = fail
    with pytest.raises(LayaUnavailable):
        scorer.ask_with_scorer(runtime, '', questions, str(path))
    assert not runtime.agent.model.scorer._forward_pre_hooks


@pytest.mark.parametrize('stock_harm,tuned_harm,candidate', [
    (.15, .01, False), (.01, .15, False), (.01, .01, True),
])
def test_tuned_information_cannot_erase_possible_harm(monkeypatch, stock_harm, tuned_harm, candidate):
    monkeypatch.setenv('LAYA_SCORER_PATH', 'enabled.pt')
    runtime = FakeRuntime(prefs={'ATTACH_REPORT' if candidate else 'NEW_INCIDENT': .99})
    def tuned(runtime, state, questions, path):
        answers = runtime.ask(state, questions)['answers']
        answers['attention'] = dict(choice='INFORMATION', probabilities={
            'POSSIBLE_LIFE_SAFETY': tuned_harm, 'ACTIVE_NEED': .01, 'INFORMATION': .99 - tuned_harm})
        return answers, stock_harm
    monkeypatch.setattr(scorer, 'ask_with_scorer', tuned)
    candidates = [incident('inc-open', 'POSSIBLE_LIFE_SAFETY', [])] if candidate else []
    out = suggest(make_job('The first room is empty; the rest is unchecked.', candidates=candidates), runtime)
    assert out['attention'] is None
    assert all(s['kind'] == 'score' for s in out['scores'])


@pytest.mark.model
def test_saved_head_real_inference_and_data_provenance(real_runtime, monkeypatch, validate):
    root = Path(__file__).resolve().parents[3]
    path = root / 'models/laya_incident_scorer.pt'
    if not path.is_file():
        pytest.skip('Optional scorer has not been trained')
    data = (root / 'services/local-laya/finetune/train.jsonl').read_bytes()
    rows = [json.loads(line) for line in data.splitlines()]
    metadata = json.loads(path.with_suffix('.json').read_text())
    assert metadata['data_sha256'] == hashlib.sha256(data).hexdigest()
    assert metadata['examples'] == len(rows) >= 150
    assert sum(r['split'] == 'val' for r in rows) * 5 == len(rows)
    assert not {r['group'] for r in rows if r['split'] == 'train'} & {
        r['group'] for r in rows if r['split'] == 'val'}
    monkeypatch.setenv('LAYA_SCORER_PATH', str(path))
    # train.jsonl predates the required candidatePictures field; keep its recorded hash and upgrade the row here.
    out = validate(suggest({'candidatePictures': [], **rows[0]['job']}, real_runtime))
    assert len(out['scores']) == 8 and all(s['kind'] == 'score' for s in out['scores'])
    assert out['attention'] in ('POSSIBLE_LIFE_SAFETY', None)
    provenance = scorer.load_scorer(real_runtime, str(path))[2]
    assert provenance['data_sha256'] == metadata['data_sha256']
    assert provenance['base_revision'] == metadata['revision'] == LAYA_REVISION
