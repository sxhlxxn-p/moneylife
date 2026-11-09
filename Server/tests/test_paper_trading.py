"""Persistent trading regression. Author: sxhlxxn / 202439688."""
from copy import deepcopy
import json
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import paper, investment_engine

FIXTURE = json.loads((Path(__file__).resolve().parents[2] / 'fixtures/paper-trading/monthly-run.json').read_text())

def uid(): return str(uuid4())

def start(client, payload):
    payload = deepcopy(payload)
    payload['state'] = {**FIXTURE['state'], 'initial': {**payload['state']['initial'], **FIXTURE['state']['initial']}, 'month': 0}
    base = client.post('/plans', json=payload)
    assert base.status_code == 201, base.text
    command = {'requestId': uid(), 'planId': base.json()['id'], 'priceSeriesId': 'synthetic-monthly-v1'}
    response = client.post('/paper-plans', json=command)
    assert response.status_code == 201, response.text
    return response.json(), base.json(), command

def order(client, current, side, quantity, request_id=None):
    return client.post(f"/paper-plans/{current['plan']['id']}/orders", json={'requestId': request_id or uid(), 'side': side, 'quantity': quantity})

def advance(client, current, months=1):
    response = client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': uid(), 'months': months})
    assert response.status_code == 201, response.text
    return response.json()

def test_full_flow(client, payload):
    initial, base, _ = start(client, payload)
    current = order(client, initial, 'buy', 50).json()
    assert not current['run']['result']['invested']['executions']
    current = advance(client, current)
    execution = current['run']['result']['invested']['executions'][0]
    assert (execution['price'], execution['executionMonth']) == (10000, 1)
    current = advance(client, current)
    current = advance(client, order(client, current, 'sell', 20).json())
    current = advance(client, order(client, current, 'sell', 30).json())
    result = current['run']['result']
    assert [r['total'] for r in result['invested']['monthlyResults']] == FIXTURE['expected']['totals']
    assert result['comparison'] == {'finalAssetsDifference': 10000, 'goalMonthDifference': -1, 'shortageMonthsDifference': 0}
    assert result['invested']['summary']['finalRealizedPnl'] == 10000
    assert client.get(f"/paper-runs/{current['run']['id']}").json() == current['run']
    assert client.get(f"/paper-plans/{initial['plan']['id']}").json() == initial['plan']
    assert client.get(f"/plans/{base['id']}").json() == base
    assert len(client.get('/paper-plans').json()) == 8
    assert len(client.get('/paper-plans?limit=2&offset=1').json()) == 2

def test_future_prices_hidden(client, payload):
    current, _, _ = start(client, payload)
    assert 'prices' not in json.dumps(client.get('/market/series').json())
    assert 'prices' not in json.dumps(current)
    assert 'input_snapshot' not in json.dumps(current)
    path = f"/paper-plans/{current['plan']['id']}/market"
    assert [p['month'] for p in client.get(path).json()['prices']] == [0]
    assert client.get(path + '?throughMonth=4').status_code == 422
    child = advance(client, current)
    assert [p['month'] for p in client.get(f"/paper-plans/{child['plan']['id']}/market").json()['prices']] == [0, 1]
    assert len(client.get(path).json()['prices']) == 1

async def unavailable(*args, **kwargs): raise HTTPException(503, 'ENGINE_UNAVAILABLE')

def test_retries_and_reads_skip_engine_and_catalog(client, payload, monkeypatch):
    current, _, command = start(client, payload)
    request_id = uid()
    created = order(client, current, 'buy', 50, request_id).json()
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    monkeypatch.setattr(paper, 'load_series', lambda _: (_ for _ in ()).throw(RuntimeError('not read')))
    assert client.post('/paper-plans', json=command).json() == current
    assert order(client, current, 'buy', 50, request_id).json() == created
    assert client.get(f"/paper-runs/{created['run']['id']}").json() == created['run']
    assert len(client.get('/paper-plans').json()) == 2
    assert order(client, current, 'buy', 51, request_id).status_code == 409
    assert client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': request_id}).status_code == 409
    assert order(client, created, 'buy', 50, request_id).status_code == 409

def test_guest_isolation(client, payload):
    current, base, _ = start(client, payload)
    with TestClient(app) as other:
        plan_id = current['plan']['id']
        for path in (f'/paper-plans/{plan_id}', f'/paper-plans/{plan_id}/market', f"/paper-runs/{current['run']['id']}"):
            assert other.get(path).status_code == 404
        assert other.get('/paper-plans').json() == []
        assert order(other, current, 'buy', 1).status_code == 404
        assert other.post(f'/paper-plans/{plan_id}/advance', json={'requestId': uid()}).status_code == 404
        assert other.post('/paper-plans', json={'requestId': uid(), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).status_code == 404

@pytest.mark.parametrize('extra', [{'price': 1}, {'symbol': 'OTHER'}, {'submittedMonth': 0}, {'executions': []}])
def test_reject_forged_fields(client, payload, extra):
    current, _, _ = start(client, payload)
    response = client.post(f"/paper-plans/{current['plan']['id']}/orders", json={'requestId': uid(), 'side': 'buy', 'quantity': 1, **extra})
    assert response.status_code == 422
    assert len(client.get('/paper-plans').json()) == 1

@pytest.mark.parametrize('quantity', [0, -1, True, 1.5, '10', 1000000001])
def test_invalid_quantity(client, payload, quantity):
    current, _, _ = start(client, payload)
    assert order(client, current, 'buy', quantity).status_code == 422

def test_sell_reservations(client, payload):
    initial, _, _ = start(client, payload)
    pending = order(client, initial, 'buy', 50).json()
    assert order(client, pending, 'sell', 1).status_code == 409
    held = advance(client, pending)
    reserved = order(client, held, 'sell', 30).json()
    assert order(client, reserved, 'sell', 21).status_code == 409
    assert order(client, reserved, 'sell', 20).status_code == 201
    assert order(client, held, 'sell', 51).status_code == 409

def test_buy_rejection_not_retried(client, payload):
    current, _, _ = start(client, payload)
    current = advance(client, order(client, current, 'buy', 1000).json())
    result = current['run']['result']['invested']
    assert result['executions'][0]['reason'] == 'INSUFFICIENT_CASH'
    assert result['account']['quantity'] == 0
    assert len(advance(client, current)['run']['result']['invested']['executions']) == 1

def test_series_limits(client, payload):
    current, _, _ = start(client, payload)
    last = advance(client, current, 4)
    assert order(client, last, 'buy', 1).status_code == 409
    assert client.post(f"/paper-plans/{last['plan']['id']}/advance", json={'requestId': uid()}).status_code == 409
    assert client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': uid(), 'months': 5}).status_code == 409
    base = client.post('/plans', json=payload).json()
    assert client.post('/paper-plans', json={'requestId': uid(), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).status_code == 409
    assert client.post('/paper-plans', json={'requestId': uid(), 'planId': base['id'], 'priceSeriesId': 'unknown'}).status_code == 404

def test_failed_engine_no_child(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    assert order(client, current, 'buy', 1).status_code == 503
    assert client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': uid()}).status_code == 503
    assert len(client.get('/paper-plans').json()) == 1
    assert client.get(f"/paper-plans/{current['plan']['id']}").json() == current['plan']

def test_catalog_frozen(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    monkeypatch.setattr(paper, 'load_series', lambda _: (_ for _ in ()).throw(RuntimeError('new catalog')))
    current = advance(client, order(client, current, 'buy', 50).json())
    assert current['run']['result']['invested']['executions'][0]['price'] == 10000

@pytest.mark.parametrize('mutation', ['total', 'summary', 'price', 'comparison', 'account', 'extra'])
def test_invalid_output_not_saved(client, payload, monkeypatch, mutation):
    current, _, _ = start(client, payload)
    original = investment_engine.run_engine
    async def corrupted(data, **kwargs):
        result = json.loads(await original(data, **kwargs))
        if mutation == 'total': result['invested']['monthlyResults'][0]['total'] += 1
        elif mutation == 'summary': result['invested']['summary']['finalCash'] += 1
        elif mutation == 'price': result['invested']['monthlyResults'][0]['investment']['price'] += 1
        elif mutation == 'comparison': result['comparison']['finalAssetsDifference'] += 1
        elif mutation == 'account': result['invested']['account']['netCashFlow'] += 1
        else: result['futurePrices'] = []
        return json.dumps(result).encode()
    monkeypatch.setattr(investment_engine, 'run_engine', corrupted)
    response = order(client, current, 'buy', 1)
    assert response.status_code == 503, response.text
    assert response.json()['detail'] == 'ENGINE_OUTPUT_INVALID'
    assert len(client.get('/paper-plans').json()) == 1

def test_origin_rejection(client, payload):
    current, _, _ = start(client, payload)
    response = client.post(f"/paper-plans/{current['plan']['id']}/orders", headers={'Origin': 'https://other.invalid'}, json={'requestId': uid(), 'side': 'buy', 'quantity': 1})
    assert response.status_code == 403

def test_advance_retry_is_stored(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    path = f"/paper-plans/{current['plan']['id']}/advance"
    command = {'requestId': uid(), 'months': 1}
    response = client.post(path, json=command)
    assert response.status_code == 201
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    assert client.post(path, json=command).json() == response.json()
    assert client.post(path, json={**command, 'months': 2}).status_code == 409

def test_same_parent_commands_create_independent_forks(client, payload):
    initial, _, _ = start(client, payload)
    a = order(client, initial, 'buy', 10).json()
    b = order(client, initial, 'buy', 20).json()
    assert a['plan']['id'] != b['plan']['id']
    assert len(a['plan']['orders']) == len(b['plan']['orders']) == 1
    assert advance(client, a)['run']['result']['invested']['account']['quantity'] == 10
    assert advance(client, b)['run']['result']['invested']['account']['quantity'] == 20

def test_concurrent_retry_has_one_child(client, payload):
    from concurrent.futures import ThreadPoolExecutor
    current, _, _ = start(client, payload)
    request_id = uid()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(order, client, current, 'buy', 10, request_id) for _ in range(2)]
        responses = [f.result() for f in futures]
    assert [r.status_code for r in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    assert len(client.get('/paper-plans').json()) == 2

def test_read_survives_new_app_lifespan(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    with TestClient(app) as reopened:
        reopened.cookies.update(client.cookies)
        assert reopened.get(f"/paper-runs/{current['run']['id']}").json() == current['run']

@pytest.mark.parametrize('mutation', ['executionMonth', 'executionPrice', 'pending', 'ledger'])
def test_invalid_trade_ledger(client, payload, monkeypatch, mutation):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 10).json()
    original = investment_engine.run_engine
    async def corrupted(data, **kwargs):
        result = json.loads(await original(data, **kwargs))
        invested = result['invested']
        if mutation == 'executionMonth': invested['executions'][0]['executionMonth'] += 1
        elif mutation == 'executionPrice': invested['executions'][0]['price'] += 1
        elif mutation == 'pending': invested['pendingOrders'] = current['plan']['orders']
        else: invested['account']['executions'] = []
        return json.dumps(result).encode()
    monkeypatch.setattr(investment_engine, 'run_engine', corrupted)
    response = client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': uid()})
    assert response.status_code == 503
    assert response.json()['detail'] == 'ENGINE_OUTPUT_INVALID'
    assert len(client.get('/paper-plans').json()) == 2
