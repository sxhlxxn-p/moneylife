"""Future-only financial edits preserve investments. Author: sxhlxxn."""
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import paper, llm
from app.ai_changes import effective
from test_paper_trading import start, order, advance


def path(current): return f"/paper-plans/{current['plan']['id']}/conditions"
def change(client, current, values, request_id=None, **extra):
    return client.post(path(current), json={'requestId': request_id or str(uuid4()), 'values': values, **extra})


def test_conditions_start_next_month_and_preserve_history_holdings_orders(client, payload, monkeypatch):
    current, base, _ = start(client, payload)
    current = advance(client, order(client, current, 'buy', 50).json())
    before = client.get(path(current))
    assert before.status_code == 200
    assert before.json()['values'] == {'income': 200000, 'expense': 100000, 'monthlySaving': 50000}
    assert before.json()['appliesFrom'] == 2 and before.json()['appliesThrough'] == 4
    async def no_llm(*args, **kwargs): raise AssertionError('manual condition change must not call a model')
    monkeypatch.setattr(llm, 'call_response', no_llm)
    response = change(client, current, {'income': 300000, 'expense': 80000, 'monthlySaving': 0})
    assert response.status_code == 201, response.text
    candidate = response.json()
    assert candidate['plan']['action'] == 'conditions'
    assert candidate['plan']['parentPaperPlanId'] == current['plan']['id']
    assert candidate['plan']['financialPlanId'] == base['id']
    assert candidate['plan']['orders'] == current['plan']['orders']
    assert candidate['plan']['source'] == current['plan']['source']
    assert candidate['run']['result'] == current['run']['result']
    assert client.get(f"/paper-plans/{current['plan']['id']}").json() == current['plan']
    assert client.get(f"/paper-runs/{current['run']['id']}").json() == current['run']
    assert client.get('/plans/' + base['id']).json() == base
    assert client.get(path(candidate)).json()['values'] == {'income': 300000, 'expense': 80000, 'monthlySaving': 0}
    result = advance(client, candidate)
    row = result['run']['result']['invested']['monthlyResults'][-1]
    assert (row['cash'], row['saved'], row['total'], row['investment']['quantity']) == (770000, 50000, 1420000, 50)
    original = advance(client, current)
    assert original['run']['result']['invested']['monthlyResults'][-1]['total'] == 1300000
    assert effective(candidate['plan']['state'], 'income', 5) == 200000
    assert effective(candidate['plan']['state'], 'monthlySaving', 5) == 50000


def test_pending_order_is_retained_and_uses_changed_cash_flow(client, payload):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 100).json()
    candidate = change(client, current, {'income': 0, 'expense': 500000}).json()
    assert candidate['run']['result']['invested']['pendingOrders'] == current['run']['result']['invested']['pendingOrders']
    result = advance(client, candidate)['run']['result']['invested']
    assert result['executions'][0]['reason'] == 'INSUFFICIENT_CASH'
    assert result['account']['quantity'] == 0
    assert advance(client, current)['run']['result']['invested']['executions'][0]['status'] == 'filled'


def test_future_selected_field_is_fixed_unselected_and_once_are_preserved(client, payload):
    current, _, _ = start(client, payload)
    state = deepcopy(current['plan']['state'])
    state['changes'] = [{'type': 'income', 'v': 100000, 'm': 3, 'end': None},
                        {'type': 'expense', 'v': 20000, 'm': 2, 'end': None},
                        {'type': 'once', 'v': 300000, 'm': 2, 'end': None}]
    base = client.post('/plans', json={'state': state}).json()
    current = client.post('/paper-plans', json={'requestId': str(uuid4()), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).json()
    response = change(client, current, {'income': 250000})
    assert response.status_code == 201, response.text
    changed = response.json()['plan']['state']
    assert [effective(changed, 'income', m) for m in range(1, 5)] == [250000] * 4
    assert effective(changed, 'income', 5) == 300000
    assert effective(changed, 'expense', 2) == 120000
    assert state['changes'][2] in changed['changes']
    assert changed['initial'] == state['initial']


def test_noop_and_invalid_changes_do_not_create_snapshots(client, payload):
    current, _, _ = start(client, payload)
    assert change(client, current, {'income': 200000}).status_code == 409
    assert len(client.get('/paper-plans').json()) == 1

@pytest.mark.parametrize('values', [{}, {'income': None}, {'income': True}, {'expense': -1},
    {'income': '100'}, {'monthlySaving': 1.5}, {'income': 10000000001},
    {'target': 100}, {'cash': 100}, {'annualRate': 2}, {'income': 300000, 'expense': None}])
def test_strict_values(client, payload, values):
    current, _, _ = start(client, payload)
    assert change(client, current, values).status_code == 422
    assert len(client.get('/paper-plans').json()) == 1

@pytest.mark.parametrize('extra', [{'month': 0}, {'startMonth': '2026-01'}, {'orders': []}, {'state': {}}])
def test_cannot_rewrite_progress_or_orders(client, payload, extra):
    current, _, _ = start(client, payload)
    assert change(client, current, {'income': 300000}, **extra).status_code == 422


def test_ownership_origin_and_last_month(client, payload):
    current, _, _ = start(client, payload)
    with TestClient(app) as other:
        assert other.get(path(current)).status_code == 404
        assert change(other, current, {'income': 300000}).status_code == 404
    assert client.post(path(current), json={'requestId': str(uuid4()), 'values': {'income': 300000}}, headers={'Origin': 'https://other.invalid'}).status_code == 403
    last = advance(client, current, 4)
    assert client.get(path(last)).json()['canEdit'] is False
    assert client.get(path(last)).json()['appliesFrom'] is None
    assert change(client, last, {'income': 300000}).status_code == 409


def test_retry_is_stored_and_conflicting_request_id_rejected(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    request_id = str(uuid4()); values = {'income': 300000, 'monthlySaving': 0}
    first = change(client, current, values, request_id)
    assert first.status_code == 201
    async def unavailable(*args, **kwargs): raise HTTPException(503, 'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    assert change(client, current, {'monthlySaving': 0, 'income': 300000}, request_id).json() == first.json()
    assert change(client, current, {'income': 310000}, request_id).status_code == 409
    assert change(client, first.json(), values, request_id).status_code == 409
    assert client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': request_id}).status_code == 409
    assert len(client.get('/paper-plans').json()) == 2


def test_engine_failure_has_no_partial_save(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    async def unavailable(*args, **kwargs): raise HTTPException(503, 'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    assert change(client, current, {'expense': 80000}).status_code == 503
    assert client.get(f"/paper-plans/{current['plan']['id']}").json() == current['plan']
    assert len(client.get('/paper-plans').json()) == 1


def test_get_does_not_call_engine_and_handles_large_existing_value(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    state = deepcopy(current['plan']['state']); state['initial']['income'] = 10000000000
    state['changes'] = [{'type': 'income', 'm': 1, 'end': None, 'v': 10000000000}]
    base = client.post('/plans', json={'state': state}).json()
    current = client.post('/paper-plans', json={'requestId': str(uuid4()), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).json()
    async def unavailable(*args, **kwargs): raise AssertionError('read conditions must not run engine')
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    response = client.get(path(current))
    assert response.status_code == 200
    assert response.json()['values']['income'] == 20000000000

def test_history_limit_fails_without_discarding_records(client, payload):
    current, _, _ = start(client, payload)
    state = deepcopy(current['plan']['state'])
    state['changes'] = [{'type': 'income', 'v': 0, 'm': 1, 'end': 120} for _ in range(200)]
    base = client.post('/plans', json={'state': state}).json()
    current = client.post('/paper-plans', json={'requestId': str(uuid4()), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).json()
    response = change(client, current, {'expense': 80000})
    assert response.status_code == 422 and response.json()['detail'] == 'CONDITIONS_INVALID'
    assert len(client.get(f"/paper-plans/{current['plan']['id']}").json()['state']['changes']) == 200
    assert len(client.get('/paper-plans').json()) == 2


def test_concurrent_retry_has_one_condition_branch(client, payload):
    from concurrent.futures import ThreadPoolExecutor
    current, _, _ = start(client, payload)
    request_id = str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(change, client, current, {'income': 300000}, request_id) for _ in range(2)]
        responses = [f.result() for f in futures]
    assert [r.status_code for r in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    assert len(client.get('/paper-plans').json()) == 2
