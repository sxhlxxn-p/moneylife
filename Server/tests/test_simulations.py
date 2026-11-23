"""Server engine execution and immutable runs. Author: sxhlxxn."""
from copy import deepcopy
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine

from app import database
from app.main import app


def save(client, payload):
    response = client.post('/plans', json=payload)
    assert response.status_code == 201
    return response.json()['id']


def request(plan_id, months=24):
    return {'planId': plan_id, 'requestId': str(uuid4()), 'months': months}


def test_server_engine_reproduces_presentation_and_preserves_input(client, payload):
    payload['state']['changes'] = []
    plan_id = save(client, payload)
    response = client.post('/simulations', json=request(plan_id))
    assert response.status_code == 200
    run = response.json()
    assert run['summary']['goalMonth'] == 12
    assert run['summary']['finalNetAssets'] == 31600000
    assert len(run['monthlyResults']) == 25
    assert run['monthlyResults'][1]['cash'] == 10200000
    assert run['monthlyResults'][1]['saved'] == 700000
    assert run['engineVersion'] == 'cash-savings-krw-v1'
    assert run['planVersion'] == 1
    for key, value in payload['state'].items():
        assert run['inputSnapshot']['state'][key] == value
    assert client.get(f"/simulations/{run['id']}").json() == run
    assert client.get('/simulations', params={'planId': plan_id}).json()[0]['id'] == run['id']
    assert response.headers['cache-control'] == 'no-store'


def test_first_month_independence_reaches_goal_at_22_months(client, payload):
    payload['state']['changes'][0]['m'] = 1
    payload['state']['changes'][1]['m'] = 1
    run = client.post('/simulations', json=request(save(client, payload))).json()
    assert run['summary']['goalMonth'] == 22
    assert run['summary']['finalNetAssets'] == 21400000
    assert run['monthlyResults'][1]['total'] == 7600000
    assert run['monthlyResults'][2]['total'] - run['monthlyResults'][1]['total'] == 600000


def test_interest_is_rounded_to_won_before_month_end_transfer(client, payload):
    state = payload['state']
    state['initial']['saved'] = 1000000
    state['annualRate'] = 12
    state['changes'] = []
    run = client.post('/simulations', json=request(save(client, payload), 2)).json()
    assert run['monthlyResults'][1]['saved'] == 1709489
    assert all(isinstance(value, int) for row in run['monthlyResults'] for value in row.values())


def test_goal_zero_month_and_cash_shortage(client, payload):
    state = payload['state']
    state['initial']['target'] = state['initial']['cash']
    state['changes'] = []
    run = client.post('/simulations', json=request(save(client, payload), 2)).json()
    assert run['summary']['goalMonth'] == 0
    state['initial'].update(cash=0, income=500000, expense=1000000)
    run = client.post('/simulations', json=request(save(client, payload), 2)).json()
    assert run['summary']['goalMonth'] is None
    assert run['summary']['firstShortageMonth'] == 1
    assert run['summary']['shortageMonths'] == 2
    assert run['summary']['unmetTotal'] == 1000000
    assert run['summary']['finalNetAssets'] == -1000000


def test_repeat_request_and_get_reuse_stored_result_without_engine(client, payload, monkeypatch):
    body = request(save(client, payload))
    run = client.post('/simulations', json=body).json()
    async def unavailable(*args):
        raise HTTPException(status_code=503, detail='ENGINE_UNAVAILABLE')
    monkeypatch.setattr('app.simulations.calculate', unavailable)
    assert client.post('/simulations', json=body).json() == run
    assert client.get(f"/simulations/{run['id']}").json() == run
    assert len(client.get('/simulations', params={'planId': body['planId']}).json()) == 1
    body['months'] = 12
    assert client.post('/simulations', json=body).status_code == 409


def test_another_guest_cannot_compute_read_or_list_runs(client, payload):
    body = request(save(client, payload))
    run = client.post('/simulations', json=body).json()
    client.cookies.clear()
    assert client.get(f"/simulations/{run['id']}").status_code == 404
    assert client.get('/simulations', params={'planId': body['planId']}).status_code == 404
    body['requestId'] = str(uuid4())
    assert client.post('/simulations', json=body).status_code == 404


def test_missing_node_does_not_store_a_fake_run_or_remove_plan(client, payload, monkeypatch):
    body = request(save(client, payload))
    monkeypatch.setenv('NODE_BINARY', '/missing/moneylife-node')
    response = client.post('/simulations', json=body)
    assert response.status_code == 503
    assert response.json()['detail'] == 'ENGINE_UNAVAILABLE'
    assert client.get('/simulations', params={'planId': body['planId']}).json() == []
    assert client.get('/plans/' + body['planId']).status_code == 200


def test_slow_engine_is_terminated_without_storing_a_run(client, payload, monkeypatch, tmp_path):
    body = request(save(client, payload))
    runner = tmp_path / 'slow.cjs'
    runner.write_text('setInterval(() => {}, 1000);')
    monkeypatch.setattr('app.engine.RUNNER', runner)
    monkeypatch.setattr('app.engine.ENGINE_TIMEOUT', .05)
    response = client.post('/simulations', json=body)
    assert response.status_code == 503
    assert response.json()['detail'] == 'ENGINE_TIMEOUT'
    assert client.get('/simulations', params={'planId': body['planId']}).json() == []


def test_fork_does_not_change_existing_result(client, payload):
    original_id = save(client, payload)
    original = client.post('/simulations', json=request(original_id)).json()
    child = deepcopy(payload)
    child['parentPlanId'] = original_id
    child['state']['initial']['expense'] += 100000
    changed = client.post('/simulations', json=request(save(client, child))).json()
    assert changed['summary']['finalNetAssets'] != original['summary']['finalNetAssets']
    assert client.get(f"/simulations/{original['id']}").json() == original


def test_browser_cannot_submit_calculated_results(client, payload):
    body = request(save(client, payload))
    body['monthlyResults'] = [{'total': 999999999}]
    assert client.post('/simulations', json=body).status_code == 422


def test_stored_run_survives_server_restart(tmp_path, monkeypatch, payload):
    url = f"sqlite+aiosqlite:///{tmp_path / 'runs.db'}"
    monkeypatch.setattr(database, 'engine', create_async_engine(url))
    with TestClient(app) as first:
        run = first.post('/simulations', json=request(save(first, payload))).json()
        cookie = first.cookies.get('moneylife_guest')
    monkeypatch.setattr(database, 'engine', create_async_engine(url))
    with TestClient(app) as second:
        second.cookies.set('moneylife_guest', cookie)
        assert second.get(f"/simulations/{run['id']}").json() == run


def test_invalid_engine_output_is_not_persisted(client, payload, monkeypatch, tmp_path):
    body = request(save(client, payload))
    runner = tmp_path / 'invalid.cjs'
    runner.write_text('process.stdout.write(JSON.stringify({engineVersion:"wrong"}));')
    monkeypatch.setattr('app.engine.RUNNER', runner)
    response = client.post('/simulations', json=body)
    assert response.status_code == 503
    assert response.json()['detail'] == 'ENGINE_OUTPUT_INVALID'
    assert client.get('/simulations', params={'planId': body['planId']}).json() == []


def test_run_list_returns_latest_even_within_one_second(client, payload):
    plan_id = save(client, payload)
    first = client.post('/simulations', json=request(plan_id, 1)).json()
    second = client.post('/simulations', json=request(plan_id, 2)).json()
    assert first['id'] != second['id']
    listed = client.get('/simulations', params={'planId': plan_id, 'limit': 1}).json()
    assert listed[0]['id'] == second['id']
