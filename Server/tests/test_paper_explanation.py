"""Explanations use only stored facts. Author: sxhlxxn / 202439688."""
import json
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import llm, paper_explanation as explanation
from app import paper
from test_paper_trading import start, order, advance

SELECTED = ['comparison', 'pnl', 'goal', 'assumptions']

def path(current):
    return f"/paper-runs/{current['run']['id']}/explanation"

def enabled(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')

def text(response):
    return '\n'.join(section['text'] for section in response.json()['sections'])

async def no_external(*args, **kwargs):
    raise AssertionError('unexpected external or engine request')

def test_basic_zero_month_never_calls_llm_or_engine(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    enabled(monkeypatch)
    monkeypatch.setattr(llm, 'call_response', no_external)
    monkeypatch.setattr(paper, 'calculate_investment', no_external)
    response = client.get(path(current))
    assert response.status_code == 200, response.text
    assert response.json()['source'] == 'template'
    assert response.json()['throughMonth'] == 0
    assert '아직 미달성' in text(response)
    assert '120개월' not in text(response)
    assert response.headers['cache-control'] == 'no-store'
    assert len(client.get('/paper-plans').json()) == 1
    assert client.get(f"/paper-runs/{current['run']['id']}").json() == current['run']

def test_unconfigured_ai_returns_basic_without_external_call(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('LLM_MODEL', raising=False)
    monkeypatch.setattr(llm, 'call_response', no_external)
    response = client.post(path(current), json={'useAI': True})
    assert response.status_code == 200
    assert response.json()['fallbackReason'] == 'LLM_NOT_CONFIGURED'
    assert response.json()['attempts'] == 0
    assert response.json()['source'] == 'template'

def test_comparison_gains_losses_and_goal_are_bound(client, payload):
    current, _, _ = start(client, payload)
    current = advance(client, order(client, current, 'buy', 50).json())
    current = advance(client, current)
    result = client.get(path(current))
    assert '100,000원 높습니다' in text(result)
    assert '투자 계획은 목표를 2개월차에 달성했습니다. 비투자 계획은 아직 달성하지 못했습니다' in text(result)
    current = advance(client, current)
    result = client.get(path(current))
    assert '50,000원 낮습니다' in text(result)
    assert '평가 손익은 -50,000원' in text(result)
    assert '순자산 차이와 같은 값으로 해석하지 않습니다' in text(result)

@pytest.mark.parametrize('body', [{}, {'useAI': False}, {'useAI': 1}, {'useAI': 'true'}, {'useAI': True, 'text': 'override'}])
def test_ai_request_must_be_explicit(client, payload, body):
    current, _, _ = start(client, payload)
    assert client.post(path(current), json=body).status_code == 422

def test_owned_results_origin_and_unknown_run(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    enabled(monkeypatch)
    monkeypatch.setattr(llm, 'call_response', no_external)
    with TestClient(app) as other:
        assert other.get(path(current)).status_code == 404
        assert other.post(path(current), json={'useAI': True}).status_code == 404
    assert client.post(path(current), json={'useAI': True}, headers={'Origin': 'https://wrong.invalid'}).status_code == 403
    assert client.get(f'/paper-runs/{uuid4()}/explanation').status_code == 404

def test_valid_selection_is_cached_but_prose_and_numbers_come_from_server(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    enabled(monkeypatch)
    calls = []
    async def select(body, **kwargs):
        calls.append(body)
        return {'text': json.dumps({'selectedIds': SELECTED})}
    monkeypatch.setattr(llm, 'call_response', select)
    first = client.post(path(current), json={'useAI': True})
    assert first.status_code == 200, first.text
    assert first.json()['source'] == 'llm-ranked'
    assert [s['id'] for s in first.json()['sections']] == SELECTED
    assert first.json()['verifiedFacts'] is True
    second = client.post(path(current), json={'useAI': True})
    assert second.json()['cached'] is True and len(calls) == 1
    assert second.json()['sections'] == first.json()['sections']
    # Basic GET stays deterministic even after a ranked version is cached.
    assert client.get(path(current)).json()['source'] == 'template'
    sent = json.loads(calls[0]['input'][1]['content'])
    assert set(sent) == {'facts', 'requiredIds'}
    encoded = json.dumps(calls[0], ensure_ascii=False)
    assert current['plan']['state']['initial']['name'] not in encoded
    assert 'prices' not in encoded and 'test-key' not in encoded
    assert calls[0]['store'] is False
    assert calls[0]['text']['format']['strict'] is True
    assert len(client.get('/paper-plans').json()) == 1

@pytest.mark.parametrize('selected', [
    ['comparison', 'goal', 'assumptions', 'invented'],
    ['comparison', 'goal', 'assumptions', 'comparison'],
    ['portfolio', 'pnl', 'orders', 'liquidity'],
    ['comparison', 'goal', 'assumptions', 'valuation'],
])
def test_invalid_selection_falls_back_after_one_retry(client, payload, monkeypatch, selected):
    current, _, _ = start(client, payload)
    enabled(monkeypatch); calls = []
    async def invalid(*args, **kwargs):
        calls.append(1); return {'text': json.dumps({'selectedIds': selected})}
    monkeypatch.setattr(llm, 'call_response', invalid)
    response = client.post(path(current), json={'useAI': True})
    assert response.json()['source'] == 'template'
    assert response.json()['fallbackReason'] == 'EXPLANATION_VALIDATION_FAILED'
    assert response.json()['attempts'] == len(calls) == 2
    assert response.json()['sections'] == client.get(path(current)).json()['sections']

@pytest.mark.parametrize('content', [
    {'selectedIds': SELECTED, 'text': '이익 999999원을 보장'},
    {'selectedIds': ['comparison', 'goal', 'assumptions']},
    {'selectedIds': 'comparison'},
])
def test_model_cannot_inject_prose_or_numbers(client, payload, monkeypatch, content):
    current, _, _ = start(client, payload); enabled(monkeypatch)
    async def invalid(*args, **kwargs): return {'text': json.dumps(content)}
    monkeypatch.setattr(llm, 'call_response', invalid)
    response = client.post(path(current), json={'useAI': True})
    assert response.json()['source'] == 'template'
    assert '999999' not in text(response)

def test_repair_and_provider_failure(client, payload, monkeypatch):
    current, _, _ = start(client, payload); enabled(monkeypatch)
    calls = []
    async def repaired(*args, **kwargs):
        calls.append(1)
        return {'text': json.dumps({'selectedIds': SELECTED if len(calls) > 1 else []})}
    monkeypatch.setattr(llm, 'call_response', repaired)
    response = client.post(path(current), json={'useAI': True})
    assert response.json()['source'] == 'llm-ranked' and response.json()['attempts'] == 2
    # A different model is a separate cache key; provider failures are not cached.
    monkeypatch.setenv('LLM_MODEL', 'other-model')
    calls.clear()
    async def failed(*args, **kwargs): calls.append(1); raise HTTPException(503, 'LLM_TIMEOUT')
    monkeypatch.setattr(llm, 'call_response', failed)
    for _ in range(2):
        result = client.post(path(current), json={'useAI': True}).json()
        assert result['source'] == 'template' and result['fallbackReason'] == 'LLM_TIMEOUT'
    assert len(calls) == 2

def test_liquidity_and_stale_facts_cannot_be_hidden(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    state = deepcopy(current['plan']['state'])
    state['initial']['expense'] = 2_000_000
    state['monthlySaving'] = 0
    plan = client.post('/plans', json={'state': state}).json()
    created = client.post('/paper-plans', json={'requestId': str(uuid4()), 'planId': plan['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).json()
    shortage = advance(client, created)
    assert '800,000원' in text(client.get(path(shortage)))
    enabled(monkeypatch)
    async def missing(*args, **kwargs): return {'text': json.dumps({'selectedIds': SELECTED})}
    monkeypatch.setattr(llm, 'call_response', missing)
    response = client.post(path(shortage), json={'useAI': True})
    assert response.json()['source'] == 'template'
    assert 'liquidity' in [s['id'] for s in response.json()['sections']]
    original = paper.load_series
    def source(series_id):
        value = deepcopy(original(series_id)); value['prices'][1]['price'] = None; return value
    monkeypatch.setattr(paper, 'load_series', source)
    stale, _, _ = start(client, payload)
    stale = advance(client, stale)
    result = client.post(path(stale), json={'useAI': True})
    assert result.json()['source'] == 'template'
    assert 'valuation' in [s['id'] for s in result.json()['sections']]
    assert '0개월차의 마지막 유효 가격' in text(result)


def test_cached_results_still_require_owner_and_survive_restart(client, payload, monkeypatch):
    current, _, _ = start(client, payload); enabled(monkeypatch)
    async def selected(*args, **kwargs): return {'text': json.dumps({'selectedIds': SELECTED})}
    monkeypatch.setattr(llm, 'call_response', selected)
    original = client.post(path(current), json={'useAI': True}).json()
    monkeypatch.setattr(llm, 'call_response', no_external)
    with TestClient(app) as other:
        assert other.post(path(current), json={'useAI': True}).status_code == 404
    with TestClient(app) as reopened:
        reopened.cookies.update(client.cookies)
        cached = reopened.post(path(current), json={'useAI': True})
        assert cached.json()['cached'] is True
        assert cached.json()['sections'] == original['sections']


def test_simultaneous_same_run_uses_one_model_call(client, payload, monkeypatch):
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    current, _, _ = start(client, payload); enabled(monkeypatch)
    calls = []
    async def selected(*args, **kwargs):
        calls.append(1); await asyncio.sleep(0.03)
        return {'text': json.dumps({'selectedIds': SELECTED})}
    monkeypatch.setattr(llm, 'call_response', selected)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(client.post, path(current), json={'useAI': True}) for _ in range(2)]
        results = [f.result() for f in futures]
    assert [r.status_code for r in results] == [200, 200]
    assert len(calls) == 1
    assert results[0].json()['sections'] == results[1].json()['sections']

def test_corrupt_cached_selection_falls_back_without_new_charge(client, payload, monkeypatch):
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from app import database
    from app.models import PaperExplanation
    current, _, _ = start(client, payload); enabled(monkeypatch)
    async def selected(*args, **kwargs): return {'text': json.dumps({'selectedIds': SELECTED})}
    monkeypatch.setattr(llm, 'call_response', selected)
    assert client.post(path(current), json={'useAI': True}).json()['source'] == 'llm-ranked'
    async def corrupt():
        async with AsyncSession(database.engine, expire_on_commit=False) as session:
            row = await session.get(PaperExplanation, (current['run']['id'], explanation.PROMPT_VERSION, 'test-model'))
            row.selected_ids = ['invented']; await session.commit()
    asyncio.run(corrupt())
    monkeypatch.setattr(llm, 'call_response', no_external)
    response = client.post(path(current), json={'useAI': True})
    assert response.json()['source'] == 'template'
    assert response.json()['fallbackReason'] == 'EXPLANATION_CACHE_INVALID'


def test_inconsistent_stored_metrics_are_not_explained(client, payload, monkeypatch):
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from app import database
    from app.models import PaperRun
    current, _, _ = start(client, payload)
    async def corrupt():
        async with AsyncSession(database.engine, expire_on_commit=False) as session:
            row = await session.get(PaperRun, current['run']['id'])
            result = deepcopy(row.result); result['invested']['summary']['goalMonth'] = 120
            row.result = result; await session.commit()
    asyncio.run(corrupt())
    monkeypatch.setattr(llm, 'call_response', no_external)
    response = client.get(path(current))
    assert response.status_code == 503
    assert response.json()['detail'] == 'EXPLANATION_INPUT_INVALID'
