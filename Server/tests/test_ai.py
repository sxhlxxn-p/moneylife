"""Approval flow with mocked model and real engine/DB. Author: sxhlxxn."""
import asyncio
import json
import time
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import update

from app import database, llm
from app.ai_changes import build_candidate, effective, model_context
from app.ai_schemas import ChangeIntent, Extraction
from app.models import AIProposal
from app.schemas import GameState
from sqlalchemy.ext.asyncio import AsyncSession


def intent(field='expense', operation='subtract', amount=200000, start='2027-12', end=None):
    return ChangeIntent(field=field, operation=operation, amount=amount, startMonth=start, endMonth=end)


def install_model(monkeypatch, changes=None, status='ready', question=None):
    async def fake(message, context):
        assert 'name' not in context
        return Extraction(status=status, changes=changes if changes is not None else [intent()], question=question)
    monkeypatch.setattr(llm, 'extract', fake)


def create_proposal(client, payload):
    saved = client.post('/plans', json=payload)
    assert saved.status_code == 201
    plan = saved.json()
    response = client.post('/ai/parse-change', json={'planId': plan['id'], 'message': '다음 달부터 생활비를 20만 원 줄여줘'})
    assert response.status_code == 200, response.text
    return plan, response.json()


def test_parse_does_not_apply_and_confirmation_creates_fork_and_real_run(client, payload, monkeypatch):
    install_model(monkeypatch)
    base, proposal = create_proposal(client, payload)
    assert proposal['status'] == 'ready'
    assert '200,000원 감소' in proposal['preview'][0]
    assert len(client.get('/plans').json()) == 1
    assert client.get('/simulations', params={'planId': base['id']}).json() == []
    response = client.post(f"/ai/proposals/{proposal['proposalId']}/apply", json={'confirmed': True})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['plan']['parentPlanId'] == base['id']
    assert result['run']['summary']['finalNetAssets'] == 104000000
    assert result['comparison']['finalAssetsDifference'] == 21400000
    assert result['explanationSource'] == 'template'
    assert '+21,400,000원' in result['explanation']
    assert len(result['run']['monthlyResults']) == 121
    assert len(client.get('/plans').json()) == 2
    assert client.get('/plans/' + base['id']).json() == base
    assert response.headers['cache-control'] == 'no-store'
    # Reconfirm uses the persisted outcome, even if the engine subsequently fails.
    async def unavailable(*args):
        raise HTTPException(503, detail='ENGINE_UNAVAILABLE')
    monkeypatch.setattr('app.ai.calculate', unavailable)
    again = client.post(f"/ai/proposals/{proposal['proposalId']}/apply", json={'confirmed': True})
    assert again.json() == result
    assert len(client.get('/plans').json()) == 2


@pytest.mark.parametrize('status', ['needs_clarification', 'unsupported'])
def test_question_and_unsupported_do_not_create_proposal_or_child(client, payload, monkeypatch, status):
    install_model(monkeypatch, [], status, '금액과 적용 시점을 알려주세요.')
    _, result = create_proposal(client, payload)
    assert result['status'] == status
    assert result['proposalId'] is None
    assert result['question']
    assert len(client.get('/plans').json()) == 1


@pytest.mark.parametrize('change', [intent(start='2027-11'), intent(start='2040-01'), intent(amount=3000000),
                                         intent(start='2028-01', end='2027-12')])
def test_invalid_changes_never_create_ready_proposal(client, payload, monkeypatch, change):
    install_model(monkeypatch, [change])
    _, result = create_proposal(client, payload)
    assert result['status'] == 'invalid_change'
    assert result['proposalId'] is None


def test_owner_check_confirmation_and_expiry(client, payload, monkeypatch):
    install_model(monkeypatch)
    base, proposal = create_proposal(client, payload)
    path = f"/ai/proposals/{proposal['proposalId']}/apply"
    assert client.post(path, json={'confirmed': False}).status_code == 422
    assert client.post(path, json={'confirmed': 1}).status_code == 422
    assert client.post(path, json={'confirmed': True, 'state': {}}).status_code == 422
    cookie = client.cookies.get('moneylife_guest')
    client.cookies.clear()
    assert client.post(path, json={'confirmed': True}).status_code == 404
    assert client.post('/ai/parse-change', json={'planId': base['id'], 'message': '변경'}).status_code == 404
    client.cookies.set('moneylife_guest', cookie)
    async def expire():
        async with AsyncSession(database.engine) as session:
            await session.execute(update(AIProposal).values(expires_at=int(time.time()) - 1))
            await session.commit()
    asyncio.run(expire())
    assert client.post(path, json={'confirmed': True}).status_code == 410
    assert len(client.get('/plans').json()) == 1


def test_engine_failure_leaves_proposal_unapplied_and_can_retry(client, payload, monkeypatch):
    install_model(monkeypatch)
    _, proposal = create_proposal(client, payload)
    path = f"/ai/proposals/{proposal['proposalId']}/apply"
    from app.ai import calculate
    async def unavailable(*args):
        raise HTTPException(503, detail='ENGINE_UNAVAILABLE')
    monkeypatch.setattr('app.ai.calculate', unavailable)
    assert client.post(path, json={'confirmed': True}).status_code == 503
    assert len(client.get('/plans').json()) == 1
    monkeypatch.setattr('app.ai.calculate', calculate)
    assert client.post(path, json={'confirmed': True}).status_code == 200


def test_period_and_multiple_changes_preserve_original_and_future_schedule(payload):
    state = GameState.model_validate(payload['state']).model_dump(mode='json')
    state['changes'].append({'type': 'saving', 'v': 900000, 'm': 16, 'end': None})
    original = deepcopy(state)
    result, _ = build_candidate(state, [intent('monthlySaving', 'add', 100000, end='2028-03'),
                                       intent('income', 'set', 3000000, end='2028-01')])
    assert effective(result, 'monthlySaving', 14) == 800000
    assert effective(result, 'monthlySaving', 16) == 1000000
    assert effective(result, 'monthlySaving', 18) == 900000
    assert effective(result, 'income', 14) == 3000000
    assert effective(result, 'income', 16) == 2500000
    assert state == original


def test_set_income_overrides_existing_changes_only_within_requested_period(payload):
    state = GameState.model_validate(payload['state']).model_dump(mode='json')
    state['changes'] += [{'type': 'income', 'v': 500000, 'm': 16, 'end': None}]
    result, _ = build_candidate(state, [intent('income', 'set', 2800000, end='2028-03')])
    assert effective(result, 'income', 14) == 2800000
    assert effective(result, 'income', 16) == 2800000
    assert effective(result, 'income', 18) == 3000000


def test_context_uses_simulated_month_not_real_today(payload):
    assert model_context(GameState.model_validate(payload['state']).model_dump()) == {'currentMonth': '2027-11', 'nextMonth': '2027-12', 'lastMonth': '2036-10'}


def test_concurrent_confirmation_does_not_duplicate_child_plan(client, payload, monkeypatch):
    install_model(monkeypatch)
    _, proposal = create_proposal(client, payload)
    path = f"/ai/proposals/{proposal['proposalId']}/apply"
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post(path, json={'confirmed': True}), range(2)))
    assert any(response.status_code == 200 for response in responses)
    assert all(response.status_code in (200, 503) for response in responses)
    retry = client.post(path, json={'confirmed': True})
    assert retry.status_code == 200
    assert len(client.get('/plans').json()) == 2
    runs = client.get('/simulations', params={'planId': retry.json()['plan']['id']}).json()
    assert len(runs) == 1


def test_finished_simulation_cannot_create_future_change(client, payload, monkeypatch):
    install_model(monkeypatch)
    payload['state']['month'] = 120
    plan_id = client.post('/plans', json=payload).json()['id']
    response = client.post('/ai/parse-change', json={'planId': plan_id, 'message': '다음 달부터 생활비 감소'})
    assert response.status_code == 422
    assert response.json()['detail'] == 'SIMULATION_FINISHED'


def test_missing_credentials_do_not_silently_use_rules(client, payload, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('LLM_MODEL', raising=False)
    plan_id = client.post('/plans', json=payload).json()['id']
    response = client.post('/ai/parse-change', json={'planId': plan_id, 'message': '생활비 20만원 감소'})
    assert response.status_code == 503
    assert response.json()['detail'] == 'LLM_NOT_CONFIGURED'


@pytest.mark.parametrize('mode', ['valid', 'malformed', 'refusal', 'incomplete', 'unavailable', 'empty_ready'])
def test_provider_adapter_uses_schema_and_handles_failures(monkeypatch, mode):
    monkeypatch.setenv('OPENAI_API_KEY', 'unit-test-not-a-real-key')
    monkeypatch.setenv('LLM_MODEL', 'configured-test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    real_client = httpx.AsyncClient
    def handle(request):
        body = json.loads(request.content)
        assert body['text']['format']['strict'] is True
        assert body['store'] is False
        assert body['model'] == 'configured-test-model'
        assert request.url == 'https://api.openai.com/v1/responses'
        if mode == 'unavailable':
            return httpx.Response(429)
        extraction = {'status': 'ready', 'changes': [intent().model_dump()], 'question': None}
        if mode == 'empty_ready': extraction['changes'] = []
        part = {'type': 'output_text', 'text': json.dumps(extraction) if mode != 'malformed' else '{}'}
        if mode == 'refusal': part = {'type': 'refusal', 'refusal': 'cannot'}
        return httpx.Response(200, json={'status': 'incomplete' if mode == 'incomplete' else 'completed',
                                        'output': [{'type': 'message', 'content': [part]}]})
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    if mode == 'valid':
        assert asyncio.run(llm.extract('테스트', {'currentMonth': '2027-11'})).changes[0].amount == 200000
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(llm.extract('테스트', {}))
        assert error.value.detail == {'refusal': 'LLM_REFUSED', 'unavailable': 'LLM_RATE_LIMITED'}.get(mode, 'MODEL_OUTPUT_INVALID')
