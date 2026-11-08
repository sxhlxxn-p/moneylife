"""Persistence and tenant boundaries. Author: sxhlxxn / 202439688."""
from copy import deepcopy
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine
from app import database
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'plans.db'}")
    monkeypatch.setattr(database, 'engine', engine)
    with TestClient(app) as client:
        yield client

@pytest.fixture
def payload():
    return {
        'schemaVersion': 1, 'goalBasis': 'net_assets',
        'state': {
            'initial': {'name': '독립 계획', 'age': 25, 'avatar': '🌱', 'cash': 10000000, 'saved': 0, 'income': 2500000, 'expense': 1600000, 'target': 20000000},
            'monthlySaving': 700000, 'annualRate': 0, 'month': 13,
            'changes': [{'type': 'expense', 'v': 300000, 'm': 13, 'end': None}, {'type': 'once', 'v': 3000000, 'm': 13, 'end': None}],
            'rateChanges': [], 'logs': [{'month': 12, 'text': '독립 선택'}], 'events': [12]
        }
    }

def test_save_and_restore_all_game_inputs(client, payload):
    response = client.post('/plans', json=payload)
    assert response.status_code == 201
    plan = response.json()
    assert 'HttpOnly' in response.headers['set-cookie']
    assert 'SameSite=lax' in response.headers['set-cookie']
    assert 'owner' not in str(plan)
    loaded = client.get(f"/plans/{plan['id']}")
    assert loaded.status_code == 200
    for key, value in payload['state'].items():
        assert loaded.json()['state'][key] == value
    assert client.get('/plans').json()[0]['id'] == plan['id']
    assert loaded.headers['cache-control'] == 'no-store'

def test_new_snapshot_does_not_overwrite_parent(client, payload):
    parent = client.post('/plans', json=payload).json()
    branch = deepcopy(payload)
    branch['parentPlanId'] = parent['id']
    branch['state']['initial']['expense'] = 1400000
    child = client.post('/plans', json=branch).json()
    assert child['id'] != parent['id']
    assert child['parentPlanId'] == parent['id']
    assert client.get(f"/plans/{parent['id']}").json()['state'] == parent['state']
    assert len(client.get('/plans').json()) == 2

def test_guest_cannot_read_or_fork_another_guest_plan(client, payload):
    plan = client.post('/plans', json=payload).json()
    client.cookies.clear()
    assert client.get('/plans').json() == []
    assert client.get(f"/plans/{plan['id']}").status_code == 404
    payload['parentPlanId'] = plan['id']
    assert client.post('/plans', json=payload).status_code == 404

def test_invalid_session_and_cross_origin_write_are_rejected(client, payload):
    client.cookies.set('moneylife_guest', 'forged-session')
    assert client.post('/plans', json=payload).status_code == 401
    client.cookies.clear()
    assert client.post('/plans', json=payload, headers={'Origin': 'https://other.example'}).status_code == 403

@pytest.mark.parametrize('case', ['fractional_money', 'negative_money', 'negative_after_effect', 'bad_end', 'future_event', 'extra_field', 'old_goal'])
def test_invalid_financial_snapshots_are_not_stored(client, payload, case):
    if case == 'fractional_money': payload['state']['initial']['cash'] = 1.5
    elif case == 'negative_money': payload['state']['monthlySaving'] = -1
    elif case == 'negative_after_effect': payload['state']['changes'] = [{'type': 'expense', 'v': -2000000, 'm': 1}]
    elif case == 'bad_end': payload['state']['changes'][0]['end'] = 2
    elif case == 'future_event': payload['state']['events'] = [96]
    elif case == 'extra_field': payload['ownerId'] = 'attempted-override'
    else: payload['goalBasis'] = 'exclude_emergency_fund'
    assert client.post('/plans', json=payload).status_code == 422
    assert client.get('/plans').json() == []

def test_database_restart_preserves_plans_and_guest_session(tmp_path, monkeypatch, payload):
    url = f"sqlite+aiosqlite:///{tmp_path / 'persistent.db'}"
    monkeypatch.setattr(database, 'engine', create_async_engine(url))
    with TestClient(app) as first:
        plan = first.post('/plans', json=payload).json()
        cookie = first.cookies.get('moneylife_guest')
    monkeypatch.setattr(database, 'engine', create_async_engine(url))
    with TestClient(app) as restarted:
        restarted.cookies.set('moneylife_guest', cookie)
        loaded = restarted.get(f"/plans/{plan['id']}")
        assert loaded.status_code == 200
        assert loaded.json() == plan
