"""No-persistence order review. Author: sxhlxxn / 202439688."""
from copy import deepcopy
import json
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import investment_engine, paper
from test_paper_trading import start, order, advance


def preview(client, current, side='buy', quantity=50, **extra):
    return client.post(f"/paper-plans/{current['plan']['id']}/order-preview", json={'side': side, 'quantity': quantity, **extra})

def test_preview_does_not_save_and_does_not_expose_future(client, payload):
    current, _, _ = start(client, payload)
    response = preview(client, current)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['referencePrice'] == 9500
    assert result['referenceGross'] == 475000
    assert result['estimatedNextCash'] == 575000
    assert result['nextExpense'] == 100000
    assert result['paperPlanId'] == current['plan']['id']
    assert 'prices' not in result
    assert result['referencePriceMonth'] == 0
    assert result['estimatedNextCash'] != 550000  # Actual next price would be 10000.
    assert len(client.get('/paper-plans').json()) == 1
    assert client.get(f"/paper-plans/{current['plan']['id']}").json() == current['plan']
    assert client.get(f"/paper-runs/{current['run']['id']}").json() == current['run']
    assert preview(client, current).json() == result

def test_process_boundary_drops_future_quotes(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    original = investment_engine.run_engine
    async def checked(data, **kwargs):
        assert data['mode'] == 'order-preview'
        assert all(q['month'] <= data['months'] for q in data['investment']['prices'])
        return await original(data, **kwargs)
    monkeypatch.setattr(investment_engine, 'run_engine', checked)
    assert preview(client, current).status_code == 200

def test_pending_order_and_available_sells(client, payload):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 50).json()
    result = preview(client, current, quantity=50).json()
    assert result['existingPendingCount'] == 1 and result['estimatedNextCash'] == 100000
    current = advance(client, current)
    current = order(client, current, 'sell', 30).json()
    assert preview(client, current, 'sell', 21).status_code == 409
    result = preview(client, current, 'sell', 20).json()
    assert result['availableSellQuantity'] == 20
    assert result['reservedSellQuantity'] == 30

def test_ownership_origin_and_period(client, payload):
    current, _, _ = start(client, payload)
    with TestClient(app) as other:
        assert preview(other, current).status_code == 404
    path = f"/paper-plans/{current['plan']['id']}/order-preview"
    assert client.post(path, json={'side': 'buy', 'quantity': 1}, headers={'Origin': 'https://other.invalid'}).status_code == 403
    last = advance(client, current, 4)
    assert preview(client, last).status_code == 409

@pytest.mark.parametrize('extra', [{'price': 1}, {'requestId': str(uuid4())}, {'month': 1}, {'symbol': 'OTHER'}])
def test_reject_forged_inputs(client, payload, extra):
    current, _, _ = start(client, payload)
    assert preview(client, current, **extra).status_code == 422

@pytest.mark.parametrize('quantity', [0, -1, True, '1', 1.5])
def test_quantity_is_strict(client, payload, quantity):
    current, _, _ = start(client, payload)
    assert preview(client, current, quantity=quantity).status_code == 422

def test_unsafe_reference_amount_rejected_without_write(client, payload):
    current, _, _ = start(client, payload)
    # Reference price is 9500, so 1bn shares is still safe; use a trusted large-price fixture.
    async def not_called(*args, **kwargs): raise AssertionError('unsafe quote reached engine')
    from app import database
    from app.models import PaperPlan
    import asyncio
    async def change():
        async with database.AsyncSession(database.engine, expire_on_commit=False) as session:
            plan = await session.get(PaperPlan, current['plan']['id'])
            market = deepcopy(plan.market_snapshot); market['prices'][0]['price'] = 10_000_000_000
            plan.market_snapshot = market
            run = await paper.stored_run(plan, session)
            result = deepcopy(run.result); result['invested']['monthlyResults'][0]['investment']['price'] = 10_000_000_000
            run.result = result
            await session.commit()
    asyncio.run(change())
    assert preview(client, current, quantity=1_000_000_000).status_code == 422

@pytest.mark.parametrize('mutation', ['gross', 'future', 'cash'])
def test_invalid_output_is_rejected_without_write(client, payload, monkeypatch, mutation):
    current, _, _ = start(client, payload)
    original = investment_engine.run_engine
    async def corrupted(data, **kwargs):
        result = json.loads(await original(data, **kwargs))
        if mutation == 'gross': result['referenceGross'] += 1
        elif mutation == 'future': result['referencePriceMonth'] += 1
        else: result['currentCash'] += 1
        return json.dumps(result).encode()
    monkeypatch.setattr(investment_engine, 'run_engine', corrupted)
    response = preview(client, current)
    assert response.status_code == 503
    assert len(client.get('/paper-plans').json()) == 1

def test_engine_failure_has_no_order(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    async def failed(*args, **kwargs): raise HTTPException(503, 'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(paper, 'calculate_order_preview', failed)
    assert preview(client, current).status_code == 503
    assert len(client.get('/paper-plans').json()) == 1
