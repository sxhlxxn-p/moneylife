"""Only common saved months may be compared. Author: sxhlxxn / 202439688."""
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import paper, llm
from test_paper_trading import start, order, advance
from test_paper_conditions import change


def compare(client, *plans, **extra):
    return client.post('/paper-comparisons', json={'planIds': [p['plan']['id'] for p in plans], **extra})


def test_three_paths_same_month_preserve_all_sources(client, payload, monkeypatch):
    initial, _, _ = start(client, payload)
    parent = advance(client, order(client, initial, 'buy', 50).json())
    a = advance(client, parent)
    b = advance(client, change(client, parent, {'income': 300000}).json())
    c = advance(client, change(client, parent, {'monthlySaving': 0}).json())
    before = client.get('/paper-plans?limit=100').json()
    async def forbidden(*args, **kwargs): raise AssertionError('comparison must not invoke engine/model')
    monkeypatch.setattr(paper, 'calculate_investment', forbidden)
    monkeypatch.setattr(llm, 'call_response', forbidden)
    response = compare(client, a, b, c)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['throughMonth'] == 2
    assert result['referencePlanId'] == a['plan']['id']
    assert [p['summary']['finalNetAssets'] for p in result['paths']] == [1300000, 1400000, 1300000]
    assert [p['summary']['finalCash'] for p in result['paths']] == [600000, 700000, 650000]
    assert [d['finalAssetsDifference'] for d in result['differences']] == [100000, 0]
    assert [d['goalMonthDifference'] for d in result['differences']] == [0, 0]
    assert all(len(p['monthlyResults']) == 3 for p in result['paths'])
    assert client.get('/paper-plans?limit=100').json() == before
    for current in (a, b, c):
        assert client.get(f"/paper-runs/{current['run']['id']}").json() == current['run']
    assert response.headers['cache-control'] == 'no-store'
    assert 'orders' not in result and 'inputSnapshot' not in result


def test_different_progress_truncates_rows_and_goal_summary(client, payload):
    initial, _, _ = start(client, payload)
    future = advance(client, order(client, initial, 'buy', 50).json(), 3)
    assert future['run']['result']['invested']['summary']['goalMonth'] == 2
    result = compare(client, future, initial).json()
    assert result['throughMonth'] == 0
    assert [p['savedMonth'] for p in result['paths']] == [3, 0]
    for path in result['paths']:
        assert len(path['monthlyResults']) == 1
        assert path['summary']['goalMonth'] is None
        assert path['monthlyResults'][0]['investment']['price'] == 9500
    assert result['differences'][0]['goalMonthDifference'] is None
    assert 'state' not in result['paths'][0]
    assert 'prices' not in result['source']


def test_requested_common_period_and_future_rejection(client, payload):
    initial, _, _ = start(client, payload)
    a = advance(client, initial, 3)
    b = advance(client, initial, 2)
    result = compare(client, a, b, throughMonth=1)
    assert result.status_code == 200
    assert result.json()['throughMonth'] == 1
    assert len(result.json()['paths'][0]['monthlyResults']) == 2
    assert compare(client, a, b, throughMonth=3).status_code == 409

@pytest.mark.parametrize('ids', [[], [str(uuid4())], [str(uuid4())] * 2, [str(uuid4()) for _ in range(4)]])
def test_requires_two_or_three_distinct_ids(client, ids):
    assert client.post('/paper-comparisons', json={'planIds': ids}).status_code == 422

@pytest.mark.parametrize('month', [-1, 121, True, '1', 1.5])
def test_period_is_strict(client, payload, month):
    initial, _, _ = start(client, payload)
    later = advance(client, initial)
    assert compare(client, initial, later, throughMonth=month).status_code == 422


def test_different_financial_seed_is_rejected(client, payload):
    a, _, _ = start(client, payload)
    b, _, _ = start(client, payload)
    assert compare(client, a, b).status_code == 409


def test_different_price_version_is_rejected(client, payload, monkeypatch):
    a, base, _ = start(client, payload)
    original = paper.load_series
    def other(series_id):
        data = deepcopy(original(series_id)); data['priceDataHash'] = 'different-version'; return data
    monkeypatch.setattr(paper, 'load_series', other)
    b = client.post('/paper-plans', json={'requestId': str(uuid4()), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'}).json()
    assert compare(client, a, b).status_code == 409


def test_ownership_before_compatibility_and_origin(client, payload):
    a, _, _ = start(client, payload)
    b = advance(client, a)
    with TestClient(app) as other:
        foreign, _, _ = start(other, payload)
        assert compare(other, a, b).status_code == 404
        assert compare(client, a, foreign).status_code == 404
    assert client.post('/paper-comparisons', json={'planIds': [a['plan']['id'], b['plan']['id']]}, headers={'Origin': 'https://other.invalid'}).status_code == 403
    assert client.post('/paper-comparisons', json={'planIds': [a['plan']['id'], str(uuid4())]}).status_code == 404


def test_corrupt_saved_result_is_not_compared(client, payload):
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from app import database
    from app.models import PaperRun
    a, _, _ = start(client, payload)
    b = advance(client, a)
    async def corrupt():
        async with AsyncSession(database.engine, expire_on_commit=False) as session:
            run = await session.get(PaperRun, b['run']['id'])
            result = deepcopy(run.result); result['invested']['summary']['finalCash'] += 1
            run.result = result; await session.commit()
    asyncio.run(corrupt())
    response = compare(client, a, b)
    assert response.status_code == 503 and response.json()['detail'] == 'COMPARISON_INPUT_INVALID'
