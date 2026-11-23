"""Common-round news comparisons are read-only. Author: sxhlxxn."""
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import news_games, llm
from test_paper_trading import start, order, advance
from test_news_games import save


def compare(client, *records, **extra):
    return client.post('/news-game-comparisons', json={'recordIds': [record['id'] for record in records], **extra})


def portfolio(client, payload):
    base, _, _ = start(client, payload)
    return advance(client, order(client, base, 'buy', 50).json())


def test_three_records_truncate_to_common_round_without_writes_or_calls(client, payload, monkeypatch):
    plan = portfolio(client, payload)
    a = save(client, plan, ['hold']).json()
    b = save(client, plan, ['half', 'hold']).json()
    c = save(client, plan, ['sell', 'hold', 'hold']).json()
    path = f"/paper-plans/{plan['plan']['id']}/news-games"
    before = client.get(path).json()
    async def forbidden(*args, **kwargs): raise AssertionError('comparison only reads stored results')
    monkeypatch.setattr(news_games, 'run_engine', forbidden)
    monkeypatch.setattr(llm, 'call_response', forbidden)
    response = compare(client, a, b, c)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['throughRound'] == 1
    assert [p['savedRounds'] for p in result['paths']] == [1, 2, 3]
    assert [p['finalAssets'] for p in result['paths']] == [1140000, 1170000, 1200000]
    assert [p['stockChange'] for p in result['paths']] == [-60000, -30000, 0]
    assert [p['assetsDifference'] for p in result['paths']] == [0, 30000, 60000]
    assert result['initialAssets'] == 1100000 and result['heldAssets'] == 1140000
    assert all(len(p['history']) == 1 and p['shortfall'] == 0 for p in result['paths'])
    assert 'energy' not in response.text and 'prices' not in response.text
    assert client.get(path).json() == before
    assert client.get(f"/paper-runs/{plan['run']['id']}").json() == plan['run']
    assert response.headers['cache-control'] == 'no-store'


def test_explicit_round_and_cumulative_news_costs(client, payload):
    plan = portfolio(client, payload)
    a = save(client, plan, ['hold', 'hold', 'hold']).json()
    b = save(client, plan, ['half', 'hold']).json()
    result = compare(client, a, b).json()
    assert result['throughRound'] == 2
    assert [p['expenseChange'] for p in result['paths']] == [10000, 10000]
    assert [p['stockChange'] for p in result['paths']] == [-95200, -47600]
    assert compare(client, a, b, throughRound=1).json()['throughRound'] == 1
    assert compare(client, a, b, throughRound=3).status_code == 409


def test_ownership_and_compatibility(client, payload):
    plan = portfolio(client, payload)
    a = save(client, plan).json()
    b = save(client, advance(client, plan)).json()
    assert compare(client, a, b).status_code == 409
    with TestClient(app) as other:
        foreign, _, _ = start(other, payload)
        c = save(other, foreign).json()
        assert compare(client, a, c).status_code == 404
        assert compare(other, a, c).status_code == 404
    assert compare(client, a, {'id': str(uuid4())}).status_code == 404
    assert client.post('/news-game-comparisons', json={'recordIds': [a['id'], b['id']]}, headers={'Origin': 'https://foreign.invalid'}).status_code == 403


@pytest.mark.parametrize('ids', [[], [str(uuid4())], [str(uuid4())] * 2, [str(uuid4()) for _ in range(4)]])
def test_requires_two_or_three_unique_records(client, ids):
    assert client.post('/news-game-comparisons', json={'recordIds': ids}).status_code == 422


@pytest.mark.parametrize('round_number', [0, 5, True, '1', 1.5])
def test_round_is_strict(client, round_number):
    assert client.post('/news-game-comparisons', json={'recordIds': [str(uuid4()), str(uuid4())], 'throughRound': round_number}).status_code == 422


def test_corrupt_saved_attribution_is_not_compared(client, payload):
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from app import database
    from app.models import NewsGameRecord
    plan = portfolio(client, payload)
    a, b = save(client, plan).json(), save(client, plan, ['sell']).json()
    async def corrupt():
        async with AsyncSession(database.engine, expire_on_commit=False) as session:
            record = await session.get(NewsGameRecord, b['id'])
            result = deepcopy(record.result)
            result['history'][0]['stockChange'] += 1
            record.result = result
            await session.commit()
    asyncio.run(corrupt())
    assert compare(client, a, b).status_code == 503
