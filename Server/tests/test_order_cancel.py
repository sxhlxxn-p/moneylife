"""Cancel only pending orders in a new branch. Author: sxhlxxn / 202439688."""
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import paper
from test_paper_trading import start, order, advance


def cancel_path(current, order_id):
    return f"/paper-plans/{current['plan']['id']}/orders/{order_id}/cancel"

def cancel(client, current, order_id, request_id=None, **extra):
    return client.post(cancel_path(current, order_id), json={'requestId': request_id or str(uuid4()), **extra})

def test_cancel_buy_is_immutable_and_parent_can_still_branch(client, payload):
    initial, _, _ = start(client, payload)
    pending = order(client, initial, 'buy', 50).json()
    order_id = pending['plan']['orders'][0]['id']
    response = cancel(client, pending, order_id)
    assert response.status_code == 201, response.text
    cancelled = response.json()
    assert cancelled['plan']['action'] == 'cancel'
    assert cancelled['plan']['parentPaperPlanId'] == pending['plan']['id']
    assert cancelled['plan']['orders'] == []
    assert cancelled['plan']['month'] == 0
    assert cancelled['run']['result']['invested']['pendingOrders'] == []
    assert cancelled['run']['result']['invested']['account'] == pending['run']['result']['invested']['account']
    assert cancelled['run']['result']['invested']['monthlyResults'] == pending['run']['result']['invested']['monthlyResults']
    assert cancelled['run']['result']['baseline'] == pending['run']['result']['baseline']
    assert client.get(f"/paper-plans/{pending['plan']['id']}").json() == pending['plan']
    assert client.get(f"/paper-runs/{pending['run']['id']}").json() == pending['run']
    assert advance(client, cancelled)['run']['result']['invested']['account']['quantity'] == 0
    assert advance(client, pending)['run']['result']['invested']['account']['quantity'] == 50
    assert any(p['action'] == 'cancel' for p in client.get('/paper-plans').json())


def test_cancel_one_order_keeps_other_orders_and_releases_sell_reservation(client, payload):
    current, _, _ = start(client, payload)
    current = advance(client, order(client, current, 'buy', 50).json())
    first = order(client, current, 'sell', 30).json()
    selected_id = first['plan']['orders'][-1]['id']
    second = order(client, first, 'sell', 10).json()
    response = cancel(client, second, selected_id)
    assert response.status_code == 201, response.text
    current = response.json()
    assert [o['quantity'] for o in current['run']['result']['invested']['pendingOrders']] == [10]
    assert current['run']['result']['invested']['account']['quantity'] == 50
    preview = client.post(f"/paper-plans/{current['plan']['id']}/order-preview", json={'side': 'sell', 'quantity': 40})
    assert preview.status_code == 200, preview.text
    assert preview.json()['availableSellQuantity'] == 40
    advanced = advance(client, current)
    assert advanced['run']['result']['invested']['account']['quantity'] == 40
    assert len(advanced['run']['result']['invested']['executions']) == 2


@pytest.mark.parametrize('quantity', [10, 1000])
def test_processed_filled_or_rejected_orders_cannot_be_cancelled(client, payload, quantity):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', quantity).json()
    order_id = current['plan']['orders'][0]['id']
    current = advance(client, current)
    before = client.get('/paper-plans').json()
    response = cancel(client, current, order_id)
    assert response.status_code == 409 and response.json()['detail'] == 'ORDER_ALREADY_PROCESSED'
    assert client.get('/paper-plans').json() == before


def test_retry_is_stored_and_request_id_conflicts_are_rejected(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 10).json()
    order_id = current['plan']['orders'][0]['id']; request_id = str(uuid4())
    first = cancel(client, current, order_id, request_id)
    assert first.status_code == 201
    async def unavailable(*args, **kwargs): raise HTTPException(503, 'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    assert cancel(client, current, order_id, request_id).json() == first.json()
    assert cancel(client, current, str(uuid4()), request_id).status_code == 409
    assert cancel(client, first.json(), order_id, request_id).status_code == 409
    assert cancel(client, first.json(), order_id).status_code == 404
    assert client.post(f"/paper-plans/{current['plan']['id']}/advance", json={'requestId': request_id}).status_code == 409
    assert len(client.get('/paper-plans').json()) == 3


def test_ownership_missing_order_and_origin(client, payload):
    initial, _, _ = start(client, payload)
    current = order(client, initial, 'buy', 10).json()
    order_id = current['plan']['orders'][0]['id']
    with TestClient(app) as other:
        assert cancel(other, current, order_id).status_code == 404
    assert cancel(client, initial, order_id).status_code == 404
    assert cancel(client, current, str(uuid4())).status_code == 404
    assert client.post(cancel_path(current, order_id), headers={'Origin': 'https://other.invalid'}, json={'requestId': str(uuid4())}).status_code == 403


@pytest.mark.parametrize('extra', [{'quantity': 0}, {'price': 1}, {'side': 'buy'}, {'confirmed': True}])
def test_cancel_does_not_accept_order_changes(client, payload, extra):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 10).json()
    assert cancel(client, current, current['plan']['orders'][0]['id'], **extra).status_code == 422
    assert len(client.get('/paper-plans').json()) == 2


def test_engine_failure_writes_no_cancellation(client, payload, monkeypatch):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 10).json()
    original = paper.calculate_investment
    async def unavailable(*args, **kwargs): raise HTTPException(503, 'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(paper, 'calculate_investment', unavailable)
    request_id = str(uuid4()); order_id = current['plan']['orders'][0]['id']
    assert cancel(client, current, order_id, request_id).status_code == 503
    assert len(client.get('/paper-plans').json()) == 2
    assert client.get(f"/paper-plans/{current['plan']['id']}").json() == current['plan']
    monkeypatch.setattr(paper, 'calculate_investment', original)
    assert cancel(client, current, order_id, request_id).status_code == 201


def test_concurrent_identical_cancel_has_one_child(client, payload):
    from concurrent.futures import ThreadPoolExecutor
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 10).json()
    request_id = str(uuid4()); order_id = current['plan']['orders'][0]['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(cancel, client, current, order_id, request_id) for _ in range(2)]
        results = [f.result() for f in futures]
    assert [r.status_code for r in results] == [201, 201]
    assert results[0].json() == results[1].json()
    assert len(client.get('/paper-plans').json()) == 3


def test_cancelled_run_explanation_has_new_pending_count(client, payload):
    current, _, _ = start(client, payload)
    current = order(client, current, 'buy', 10).json()
    cancelled = cancel(client, current, current['plan']['orders'][0]['id']).json()
    def order_text(bundle):
        result = client.get(f"/paper-runs/{bundle['run']['id']}/explanation").json()
        return next(f['text'] for f in result['sections'] if f['id'] == 'orders')
    assert '대기 중인 주문은 1건' in order_text(current)
    assert '대기 중인 주문은 0건' in order_text(cancelled)
    assert '거부 0건' in order_text(cancelled)
