"""Historical import and read-only provider regression. Author: sxhlxxn / 202439688."""
import asyncio
from copy import deepcopy
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4
import httpx
import pytest
from app.market_import import DailyClose, HistoricalSeries, build_series, fingerprint
from app.market_provider import fetch_toss_daily, MarketProviderError


def series(**kwargs):
    defaults = dict(daily=[DailyClose(date=date(2024, 1, 31), close=10000, volume=100),
        DailyClose(date=date(2024, 2, 27), close=11000, volume=100),
        DailyClose(date=date(2024, 2, 29), close=12000, volume=100),
        DailyClose(date=date(2024, 4, 30), close=9000, volume=0)],
        series_id='test-history-v1', symbol='000001', label='테스트 입력',
        start_month='2024-01', end_month='2024-04', provider='Test provider',
        source_url='https://example.org/source', collected_at=datetime(2025, 1, 1, tzinfo=timezone.utc), usage_scope='project')
    return build_series(**(defaults | kwargs))

def publish(tmp_path, monkeypatch, content=None):
    monkeypatch.setenv('MARKET_SERIES_DIR', str(tmp_path))
    content = content or series()
    (tmp_path / (content['priceSeriesId'] + '.json')).write_text(json.dumps(content))
    return content

def test_monthly_sampling_and_missing():
    result = series()
    assert result['prices'] == [
        {'month': 0, 'price': 10000, 'tradable': True, 'observedOn': '2024-01-31'},
        {'month': 1, 'price': 12000, 'tradable': True, 'observedOn': '2024-02-29'},
        {'month': 2, 'price': None, 'tradable': False, 'observedOn': None},
        {'month': 3, 'price': 9000, 'tradable': False, 'observedOn': '2024-04-30'}]
    assert HistoricalSeries.model_validate(result).priceDataHash == result['priceDataHash']

@pytest.mark.parametrize('kwargs', [
    {'start_month': '2024-1'}, {'end_month': '2024-01'}, {'start_month': '2023-12'},
    {'collected_at': datetime(2024, 4, 15, tzinfo=timezone.utc)},
    {'collected_at': datetime(2025, 1, 1)}, {'symbol': 'AAPL'},
    {'source_url': 'https://example.org/source?token=secret'},
    {'source_url': 'https://user:secret@example.org/'},
    {'series_id': '../../wrong'}, {'usage_scope': 'public'}])
def test_invalid_import_rejected(kwargs):
    with pytest.raises(ValueError): series(**kwargs)

def test_conflicting_daily_data():
    with pytest.raises(ValueError):
        series(daily=[DailyClose(date=date(2024, 1, 31), close=10000, volume=100),
                      DailyClose(date=date(2024, 1, 31), close=10001, volume=100)])

def test_public_catalog_hides_private_and_future_prices(client, tmp_path, monkeypatch, payload):
    content = publish(tmp_path, monkeypatch)
    private = series(series_id='private-v1', usage_scope='private')
    publish(tmp_path, monkeypatch, private)
    sources = client.get('/market/series')
    assert sources.status_code == 200
    assert [s['priceSeriesId'] for s in sources.json()] == ['synthetic-monthly-v1', content['priceSeriesId']]
    assert 'prices' not in sources.text
    assert sources.json()[1]['provider'] == 'Test provider'
    payload = deepcopy(payload); payload['state'].update(month=0, logs=[], events=[])
    base = client.post('/plans', json=payload).json()
    command = {'requestId': str(uuid4()), 'planId': base['id'], 'priceSeriesId': private['priceSeriesId']}
    assert client.post('/paper-plans', json=command).status_code == 404
    command.update(requestId=str(uuid4()), priceSeriesId=content['priceSeriesId'])
    result = client.post('/paper-plans', json=command)
    assert result.status_code == 201, result.text
    plan = result.json()['plan']
    market = client.get(f"/paper-plans/{plan['id']}/market").json()
    assert len(market['prices']) == 1 and market['prices'][0]['observedOn'] == '2024-01-31'
    assert result.json()['run']['result']['invested']['monthlyResults'][0]['investment']['price'] == 10000
    # Remove the source; the immutable DB snapshot remains sufficient.
    (tmp_path / 'test-history-v1.json').unlink()
    order = client.post(f"/paper-plans/{plan['id']}/orders", json={'requestId': str(uuid4()), 'side': 'buy', 'quantity': 2})
    assert order.status_code == 201, order.text
    current = order.json()['plan']
    advanced = client.post(f"/paper-plans/{current['id']}/advance", json={'requestId': str(uuid4())})
    assert advanced.status_code == 201, advanced.text
    assert advanced.json()['run']['result']['invested']['executions'][0]['price'] == 12000
    assert advanced.json()['plan']['source']['priceDataHash'] == content['priceDataHash']
    # Missing March price rejects the next order; only valuation carries February forward.
    current = advanced.json()['plan']
    order = client.post(f"/paper-plans/{current['id']}/orders", json={'requestId': str(uuid4()), 'side': 'buy', 'quantity': 1})
    current = order.json()['plan']
    advanced = client.post(f"/paper-plans/{current['id']}/advance", json={'requestId': str(uuid4())}).json()
    invested = advanced['run']['result']['invested']
    assert invested['executions'][-1]['reason'] == 'PRICE_UNAVAILABLE'
    assert invested['monthlyResults'][-1]['investment']['stale'] is True
    assert client.get(f"/paper-runs/{result.json()['run']['id']}").json() == result.json()['run']

@pytest.mark.parametrize('mutation', ['price', 'date', 'hash', 'id', 'costs'])
def test_corrupt_catalog_fails_closed(client, tmp_path, monkeypatch, mutation):
    content = series()
    if mutation == 'price': content['prices'][0]['price'] = 0
    elif mutation == 'date': content['prices'][0]['observedOn'] = '2024-02-01'
    elif mutation == 'hash': content['priceDataHash'] = 'changed'
    elif mutation == 'id': content['priceSeriesId'] = 'wrong-id'
    else: content['costs']['feeBps'] = -1
    monkeypatch.setenv('MARKET_SERIES_DIR', str(tmp_path))
    (tmp_path / 'test-history-v1.json').write_text(json.dumps(content))
    assert client.get('/market/series').status_code == 503

def candle(day, close='10000', currency='KRW'):
    return {'timestamp': day + 'T00:00:00+09:00', 'closePrice': close, 'volume': '123', 'currency': currency}

def fetch(handler, **kwargs):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_toss_daily(client=client, access_token='private-token', symbol='000001',
                start=date(2024, 1, 1), end=date(2024, 3, 31), **kwargs)
    return asyncio.run(run())

def test_read_only_toss_pagination():
    seen = []
    def handler(request):
        seen.append(request)
        assert request.method == 'GET' and request.url.path == '/api/v1/candles'
        assert request.url.params['adjusted'] == 'false'
        assert request.url.params['interval'] == '1d'
        assert request.headers['Authorization'] == 'Bearer private-token'
        if len(seen) == 1:
            return httpx.Response(200, json={'result': {'candles': [candle('2024-03-29'), candle('2024-02-29')], 'nextBefore': '2024-02-29T00:00:00+09:00'}})
        return httpx.Response(200, json={'result': {'candles': [candle('2024-02-29'), candle('2024-01-31')], 'nextBefore': None}})
    rows = fetch(handler)
    assert len(seen) == 2 and [r.date for r in rows] == [date(2024, 1, 31), date(2024, 2, 29), date(2024, 3, 29)]
    assert 'X-Tossinvest-Account' not in seen[0].headers

@pytest.mark.parametrize('status', [401, 403, 429, 500, 302])
def test_provider_errors_do_not_leak_secret(status):
    with pytest.raises(MarketProviderError) as caught:
        fetch(lambda _: httpx.Response(status, text='secret private-token'))
    assert 'private-token' not in str(caught.value)

@pytest.mark.parametrize('payload', [None, {'result': {}}, {'result': {'candles': [candle('2024-01-31', '10.5')]}},
    {'result': {'candles': [candle('2024-01-31', currency='USD')]}},
    {'result': {'candles': [candle('2024-01-31'), candle('2024-02-29')]}}])
def test_invalid_provider_response(payload):
    with pytest.raises(MarketProviderError): fetch(lambda _: httpx.Response(200, json=payload))

def test_provider_no_token_makes_no_request():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail('unexpected network'))) as client:
            with pytest.raises(MarketProviderError):
                await fetch_toss_daily(client=client, access_token='', symbol='000001', start=date(2024, 1, 1), end=date(2024, 3, 31))
    asyncio.run(run())

def test_cli_private_by_default_and_no_overwrite(tmp_path):
    root = Path(__file__).resolve().parents[2]
    csv = tmp_path / 'daily.csv'; csv.write_text('date,close,volume\n2024-01-31,10000,10\n2024-02-29,12000,10\n')
    import sys
    command = [sys.executable, str(root / 'Server/scripts/import_market.py'), '--csv', str(csv),
        '--series-id', 'cli-test-v1', '--symbol', '000001', '--label', 'CLI test',
        '--start-month', '2024-01', '--end-month', '2024-02', '--source-url', 'https://example.org/source', '--directory', str(tmp_path)]
    first = subprocess.run(command, capture_output=True, text=True)
    assert first.returncode == 0, first.stderr
    content = (tmp_path / 'cli-test-v1.json').read_bytes()
    assert json.loads(content)['usageScope'] == 'private'
    second = subprocess.run(command, capture_output=True, text=True)
    assert second.returncode == 1
    assert (tmp_path / 'cli-test-v1.json').read_bytes() == content

@pytest.mark.parametrize('field,value', [('observedOn', None), ('price', True), ('tradable', 1)])
def test_malformed_quote_rejected_even_with_new_hash(field, value):
    content = series(); content['prices'][0][field] = value
    content['priceDataHash'] = fingerprint({k: v for k, v in content.items() if k != 'priceDataHash'})
    with pytest.raises(ValueError): HistoricalSeries.model_validate(content)

def test_cost_boolean_and_reserved_id_rejected():
    content = series(); content['costs']['feeBps'] = True
    content['priceDataHash'] = fingerprint({k: v for k, v in content.items() if k != 'priceDataHash'})
    with pytest.raises(ValueError): HistoricalSeries.model_validate(content)
    with pytest.raises(ValueError): series(series_id='synthetic-monthly-v1')

def test_provider_page_limit_and_network_error():
    def handler(_):
        return httpx.Response(200, json={'result': {'candles': [candle('2024-03-29')], 'nextBefore': '2024-03-29T00:00:00+09:00'}})
    with pytest.raises(MarketProviderError, match='MARKET_PAGE_LIMIT'): fetch(handler, max_pages=1)
    def timeout(_): raise httpx.ReadTimeout('private-token in upstream error')
    with pytest.raises(MarketProviderError, match='MARKET_CONNECTION_FAILED') as caught: fetch(timeout)
    assert 'private-token' not in str(caught.value)

def test_completed_month_uses_seoul_calendar():
    from datetime import timedelta
    with pytest.raises(ValueError):
        series(end_month='2024-03', collected_at=datetime(2024, 4, 1, 0, 0, tzinfo=timezone(timedelta(hours=14))))
