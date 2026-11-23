"""Read-only outbound policy, private diagnostics, and offline paper orders."""

import asyncio
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app import market_auth, toss_status
from app.toss_client import BASE_URL, MarketProviderError, read_only_client, request_toss
from test_market_data import publish, series
from test_order_cancel import cancel
from test_paper_trading import advance, order, start


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/v1/orders"),
        ("DELETE", "/api/v1/orders/123"),
        ("PATCH", "/api/v1/orders/123"),
        ("POST", "/api/v1/orders/123/cancel"),
        ("GET", "/api/v1/accounts"),
        ("GET", "/oauth2/token"),
        ("POST", "/api/v1/candles"),
        ("GET", "/api/v1/%63andles"),
        ("GET", "/api/v1/candles/"),
        ("POST", "/oauth2/token?secret=hidden"),
    ],
)
def test_blocked_methods_and_paths_never_reach_transport(method, path):
    async def run():
        transport = httpx.MockTransport(lambda _: pytest.fail("Blocked request was sent"))
        async with read_only_client(transport=transport) as client:
            with pytest.raises(MarketProviderError, match="^MARKET_REQUEST_BLOCKED$"):
                await client.request(method, BASE_URL + path)

    asyncio.run(run())


@pytest.mark.parametrize(
    "url,headers",
    [
        ("http://openapi.tossinvest.com/api/v1/candles", {}),
        ("https://openapi.tossinvest.com.evil.test/api/v1/candles", {}),
        ("https://openapi.tossinvest.com:444/api/v1/candles", {}),
        ("https://user:secret@openapi.tossinvest.com/api/v1/candles", {}),
        (BASE_URL + "/api/v1/candles#fragment", {}),
        (BASE_URL + "/api/v1/candles", {"X-Tossinvest-Account": "123"}),
    ],
)
def test_boundary_also_applies_to_supplied_clients(url, headers):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: pytest.fail("Blocked request was sent"))
        ) as client:
            with pytest.raises(MarketProviderError, match="^MARKET_REQUEST_BLOCKED$"):
                await request_toss(client, "GET", url, headers=headers)

    asyncio.run(run())


def test_only_auth_and_candles_allowed_and_redirects_never_followed():
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        return httpx.Response(307, headers={"Location": BASE_URL + "/api/v1/orders"})

    async def run():
        async with read_only_client(transport=httpx.MockTransport(handler)) as client:
            for method, path in [("POST", "/oauth2/token"), ("GET", "/api/v1/candles")]:
                response = await request_toss(client, method, BASE_URL + path)
                assert response.status_code == 307

    asyncio.run(run())
    assert seen == [("POST", "/oauth2/token"), ("GET", "/api/v1/candles")]


@pytest.fixture
def operator(tmp_path, monkeypatch):
    key = "operator-test-key-" + "x" * 32
    monkeypatch.setenv("TOSS_OPERATOR_KEY", key)
    monkeypatch.setenv("TOSS_STATUS_FILE", str(tmp_path / "status.json"))
    monkeypatch.setenv("MARKET_SERIES_DIR", str(tmp_path / "catalog"))
    monkeypatch.setattr(
        market_auth,
        "settings",
        lambda: {
            "TOSS_ACCESS_TOKEN": "",
            "TOSS_CLIENT_ID": "private-id",
            "TOSS_CLIENT_SECRET": "private-secret",
        },
    )
    return {"X-Moneylife-Operator-Key": key}


def test_status_requires_operator_and_is_disabled_without_configuration(
    client, operator, monkeypatch
):
    assert client.get("/integrations/toss/status").status_code == 401
    assert (
        client.get(
            "/integrations/toss/status", headers={"X-Moneylife-Operator-Key": "wrong"}
        ).status_code
        == 401
    )
    monkeypatch.setenv("TOSS_OPERATOR_KEY", "")
    response = client.get("/integrations/toss/status", headers=operator)
    assert response.status_code == 503
    assert response.json()["detail"] == "TOSS_OPERATOR_NOT_CONFIGURED"


def block_network(monkeypatch):
    def blocked(*args, **kwargs):
        pytest.fail("Paper/status request attempted an external HTTP call")

    async def async_blocked(*args, **kwargs):
        blocked()

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", async_blocked)
    monkeypatch.setattr(market_auth, "access_token", async_blocked)


def test_status_is_offline_redacted_and_persistent(client, operator, tmp_path, monkeypatch):
    block_network(monkeypatch)
    initial = client.get("/integrations/toss/status", headers=operator)
    assert initial.status_code == 200
    assert initial.headers["cache-control"] == "no-store"
    assert initial.json() == {
        "configured": True,
        "mode": "client-credentials",
        "readOnly": True,
        "realTradingEnabled": False,
        "registeredHistoricalSeries": 0,
        "lastCheck": None,
    }
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    publish(catalog, monkeypatch)
    publish(catalog, monkeypatch, series(series_id="hidden-v1", usage_scope="private"))
    toss_status.record_check()
    result = client.get("/integrations/toss/status", headers=operator)
    assert result.json()["registeredHistoricalSeries"] == 1
    assert result.json()["lastCheck"]["succeeded"] is True
    assert result.json()["lastCheck"]["checkedAt"]
    assert "private-id" not in result.text and "private-secret" not in result.text
    assert operator["X-Moneylife-Operator-Key"] not in result.text
    toss_status.record_check("MARKET_ACCESS_DENIED")
    assert toss_status.read_check().error == "MARKET_ACCESS_DENIED"
    toss_status.record_check("upstream private-secret")
    assert "private-secret" not in toss_status.status_file().read_text()
    assert client.get("/integrations/toss/status", headers=operator).json()["lastCheck"] == {
        **toss_status.read_check().model_dump(mode="json"),
        "succeeded": False,
        "error": "MARKET_PROVIDER_FAILED",
    }
    # Reads do not overwrite the persisted check or renew a token.
    saved = toss_status.status_file().read_bytes()
    client.get("/integrations/toss/status", headers=operator)
    assert toss_status.status_file().read_bytes() == saved


def test_corrupt_status_fails_closed(client, operator):
    toss_status.status_file().write_text('{"error":"private-secret"}')
    response = client.get("/integrations/toss/status", headers=operator)
    assert response.status_code == 503
    assert response.json() == {"detail": "TOSS_STATUS_UNAVAILABLE"}


def test_cli_records_live_results_but_offline_check_does_not_write(operator, monkeypatch):
    file = Path(__file__).resolve().parents[1] / "scripts/check_market.py"
    spec = importlib.util.spec_from_file_location("toss_check_test", file)
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)
    monkeypatch.setattr(script, "catalog_sources", lambda: [])
    monkeypatch.setattr("sys.argv", [str(file)])
    assert asyncio.run(script.main()) == 0
    assert not toss_status.status_file().exists()

    async def token(_):
        return "never-print-token"

    async def rows(**kwargs):
        from datetime import date
        from app.market_import import DailyClose

        return [DailyClose(date=date(2024, 1, 2), close=10000, volume=1)]

    monkeypatch.setattr(script, "access_token", token)
    monkeypatch.setattr(script, "fetch_toss_daily", rows)
    monkeypatch.setattr("sys.argv", [str(file), "--live"])
    assert asyncio.run(script.main()) == 0
    assert toss_status.read_check().succeeded

    async def failed(**kwargs):
        raise MarketProviderError("MARKET_RATE_LIMITED")

    monkeypatch.setattr(script, "fetch_toss_daily", failed)
    assert asyncio.run(script.main()) == 1
    assert toss_status.read_check().error == "MARKET_RATE_LIMITED"


@pytest.mark.parametrize("historical", [False, True])
def test_paper_buy_sell_cancel_and_advance_never_call_provider(
    client, payload, tmp_path, monkeypatch, historical
):
    block_network(monkeypatch)
    if historical:
        data = publish(tmp_path, monkeypatch)
        payload = deepcopy(payload)
        payload["state"].update(month=0, logs=[], events=[])
        base = client.post("/plans", json=payload).json()
        response = client.post(
            "/paper-plans",
            json={
                "requestId": str(uuid4()),
                "planId": base["id"],
                "priceSeriesId": data["priceSeriesId"],
            },
        )
        assert response.status_code == 201, response.text
        current = response.json()
    else:
        current, _, _ = start(client, payload)
    path = f"/paper-plans/{current['plan']['id']}/order-preview"
    assert client.post(path, json={"side": "buy", "quantity": 2}).status_code == 200
    pending = order(client, current, "buy", 2)
    assert pending.status_code == 201, pending.text
    pending = pending.json()
    order_id = pending["plan"]["orders"][-1]["id"]
    cancelled = cancel(client, pending, order_id)
    assert cancelled.status_code == 201, cancelled.text
    assert (
        advance(client, cancelled.json())["run"]["result"]["invested"]["account"]["quantity"] == 0
    )
    filled = advance(client, pending)
    assert filled["run"]["result"]["invested"]["account"]["quantity"] == 2
    sold = order(client, filled, "sell", 1)
    assert sold.status_code == 201, sold.text
    sell_id = sold.json()["plan"]["orders"][-1]["id"]
    assert cancel(client, sold.json(), sell_id).status_code == 201
    advanced = advance(client, sold.json())
    assert client.get(f"/paper-runs/{advanced['run']['id']}").status_code == 200
    assert client.get(f"/paper-plans/{advanced['plan']['id']}/market").status_code == 200
