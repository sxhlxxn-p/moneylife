import json
from copy import deepcopy
from pathlib import Path
import pytest
from app import llm
from app.ai_changes import describe_changes
from app.condition_schemas import ChangeIntent
from app.ai_schemas import Extraction, ChangePreview

ROOT = Path(__file__).resolve().parents[2]
DIALOGUES = json.loads((ROOT/'Test/ai/dialogues-v1.json').read_text())['cases']


def base(payload):
    value = deepcopy(payload)
    value['state'].update(month=0, changes=[], events=[], logs=[])
    return value


def test_preview_splits_existing_future_values_without_mutating_source(payload):
    state = base(payload)['state']
    state.update(startMonth='2026-10', months=120)
    state['changes'] = [{'type':'expense', 'v':300000, 'm':3, 'end':None}]
    before = deepcopy(state)
    details = describe_changes(state, [ChangeIntent(field='expense', operation='subtract', amount=200000,
                                                   startMonth='2026-11', endMonth='2027-02')])
    assert details[0]['segments'] == [
        {'startMonth':'2026-11','endMonth':'2026-12','before':1600000,'after':1400000},
        {'startMonth':'2027-01','endMonth':'2027-02','before':1900000,'after':1700000}]
    assert state == before


def test_repeated_field_preview_uses_each_prior_change(payload):
    state = base(payload)['state']
    state.update(startMonth='2026-10', months=120)
    first = ChangeIntent(field='expense', operation='subtract', amount=200000, startMonth='2026-11', endMonth=None)
    second = first.model_copy(update={'amount':100000})
    details = describe_changes(state, [first, second])
    assert details[0]['segments'][0]['after'] == 1400000
    assert details[1]['segments'][0]['before'] == 1400000
    assert details[1]['segments'][0]['after'] == 1300000


@pytest.mark.parametrize('scenario', DIALOGUES, ids=[c['id'] for c in DIALOGUES])
def test_dialogue_preserves_original_and_only_applies_after_approval(client, payload, monkeypatch, scenario):
    contexts = []
    async def scripted(message, context):
        contexts.append((message, deepcopy(context)))
        turn = scenario['turns'][len(contexts)-1]
        return Extraction(status=turn['status'], question=turn['question'], changes=turn['changes'])
    monkeypatch.setattr(llm, 'extract', scripted)
    plan = client.post('/plans', json=base(payload)).json()
    clarification = None
    for index, turn in enumerate(scenario['turns']):
        response = client.post('/ai/parse-change', json={'planId':plan['id'], 'message':turn['message'],
                            **({'clarificationId':clarification} if clarification else {})})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['status'] == turn['status']
        assert contexts[-1][0] == scenario['turns'][0]['message']
        assert contexts[-1][1].get('clarificationTurns', []) == [
            {'question':scenario['turns'][i-1]['question'], 'answer':scenario['turns'][i]['message']}
            for i in range(1, index+1)]
        assert len(client.get('/plans').json()) == 1
        assert client.get('/plans/'+plan['id']).json() == plan
        clarification = result['clarificationId']
    assert len(result['previewDetails']) == len(scenario['turns'][-1]['changes'])
    assert all(detail['segments'] for detail in result['previewDetails'])
    applied = client.post('/ai/proposals/'+result['proposalId']+'/apply', json={'confirmed':True})
    assert applied.status_code == 200
    assert len(client.get('/plans').json()) == 2


def test_preview_accepts_effective_values_above_the_input_field_limit(payload):
    state = base(payload)['state']
    state.update(startMonth='2026-10', months=120)
    state['initial']['income'] = 10000000000
    state['changes'] = [{'type':'income','v':1000000000,'m':1,'end':None}]
    intent = ChangeIntent(field='income',operation='subtract',amount=1000000000,startMonth='2026-11',endMonth=None)
    detail = describe_changes(state, [intent])[0]
    validated = ChangePreview.model_validate(detail)
    assert validated.segments[0].before == 11000000000
    assert validated.segments[0].after == 10000000000
