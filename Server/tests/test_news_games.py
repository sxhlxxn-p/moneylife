"""Saved news choices are recomputed, owned and immutable. Author: sxhlxxn."""
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import news_games
from test_paper_trading import start, order, advance


def save(client, plan, choices=None, request_id=None, **extra):
    return client.post(f"/paper-plans/{plan['plan']['id']}/news-games", json={
        'requestId': request_id or str(uuid4()), 'choices': choices or ['hold'], **extra})


def test_server_recalculates_choices_and_preserves_source(client, payload):
    initial, _, _ = start(client, payload)
    plan = advance(client, order(client, initial, 'buy', 50).json())
    before = client.get(f"/paper-plans/{plan['plan']['id']}").json()
    response = save(client, plan, ['hold', 'half', 'hold', 'sell'])
    assert response.status_code == 201, response.text
    record = response.json()
    assert record['result']['version'] == 'news-game-v1'
    assert record['result']['seed']['cash'] == 550000
    assert record['result']['seed']['quantity'] == 50
    assert record['result']['history'][0]['stockChange'] == -60000
    assert record['result']['history'][0]['state']['cash'] == 650000
    assert len(record['result']['history']) == 4
    assert record['result']['finalAssets'] == record['result']['history'][-1]['total']
    assert client.get(f"/paper-plans/{plan['plan']['id']}").json() == before
    assert client.get(f"/paper-runs/{plan['run']['id']}").json() == plan['run']
    assert client.get('/news-games/' + record['id']).json() == record
    assert response.headers['cache-control'] == 'no-store'
    assert 'prices' not in response.text


def test_retry_is_idempotent_and_conflict_is_rejected(client, payload):
    plan, _, _ = start(client, payload)
    key = str(uuid4())
    a = save(client, plan, ['half'], key)
    b = save(client, plan, ['half'], key)
    assert a.json() == b.json()
    assert len(client.get(f"/paper-plans/{plan['plan']['id']}/news-games").json()) == 1
    assert save(client, plan, ['sell'], key).status_code == 409
    other = advance(client, plan)
    assert save(client, other, ['half'], key).status_code == 409


def test_partial_records_pagination_and_owner_isolation(client, payload):
    plan, _, _ = start(client, payload)
    a = save(client, plan, ['hold']).json()
    b = save(client, plan, ['hold', 'half']).json()
    path = f"/paper-plans/{plan['plan']['id']}/news-games"
    assert client.get(path + '?limit=1').json()[0]['id'] == b['id']
    assert client.get(path + '?limit=1&offset=1').json()[0]['id'] == a['id']
    with TestClient(app) as other:
        start(other, payload)
        assert other.get(path).status_code == 404
        assert other.get('/news-games/' + a['id']).status_code == 404
        assert save(other, plan).status_code == 404
    assert save(client, plan, headers='invalid').status_code == 422
    assert client.post(path, json={'requestId': str(uuid4()), 'choices': ['hold']}, headers={'Origin': 'https://foreign.invalid'}).status_code == 403


@pytest.mark.parametrize('choices', [[], ['hold'] * 5, ['buy'], [True], 'hold'])
def test_invalid_choices_are_rejected(client, payload, choices):
    plan, _, _ = start(client, payload)
    response = client.post(f"/paper-plans/{plan['plan']['id']}/news-games", json={'requestId': str(uuid4()), 'choices': choices})
    assert response.status_code == 422


def test_browser_cannot_submit_money_or_custom_shock(client, payload):
    plan, _, _ = start(client, payload)
    assert save(client, plan, seed={'cash': 9999999999}).status_code == 422
    assert save(client, plan, priceBps=50000).status_code == 422
    assert save(client, plan, result={'finalAssets': 9999999999}).status_code == 422


def test_bad_engine_output_is_not_saved(client, payload, monkeypatch):
    plan, _, _ = start(client, payload)
    async def invalid(*args, **kwargs): return b'{}'
    monkeypatch.setattr(news_games, 'run_engine', invalid)
    assert save(client, plan).status_code == 503
    assert client.get(f"/paper-plans/{plan['plan']['id']}/news-games").json() == []


def test_corrupt_source_does_not_start_game(client, payload):
    import asyncio
    from app import database
    from app.models import PaperRun
    from sqlalchemy.ext.asyncio import AsyncSession
    plan, _, _ = start(client, payload)
    async def corrupt():
        async with AsyncSession(database.engine, expire_on_commit=False) as session:
            run = await session.get(PaperRun, plan['run']['id'])
            result = deepcopy(run.result)
            result['invested']['summary']['finalCash'] += 1
            run.result = result
            await session.commit()
    asyncio.run(corrupt())
    assert save(client, plan).status_code == 503
