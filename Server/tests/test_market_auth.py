"""Market readiness never calls or reveals credentials. Author: sxhlxxn."""
import asyncio
import httpx
import pytest
from app import market_auth
from app.market_provider import MarketProviderError


def test_readiness_and_token_from_environment(monkeypatch):
    monkeypatch.setattr(market_auth, 'settings', lambda: {'TOSS_ACCESS_TOKEN': 'private-token', 'TOSS_CLIENT_ID': '', 'TOSS_CLIENT_SECRET': ''})
    assert market_auth.readiness() == {'configured': True, 'mode': 'access-token'}
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: pytest.fail('No network required'))) as client:
            assert await market_auth.access_token(client) == 'private-token'
    asyncio.run(run())


def test_client_credentials_use_form_and_fixed_host(monkeypatch):
    monkeypatch.setattr(market_auth, 'settings', lambda: {'TOSS_ACCESS_TOKEN': '', 'TOSS_CLIENT_ID': 'test-id', 'TOSS_CLIENT_SECRET': 'private-secret'})
    def handler(request):
        assert str(request.url) == 'https://openapi.tossinvest.com/oauth2/token'
        assert request.headers['content-type'] == 'application/x-www-form-urlencoded'
        assert b'grant_type=client_credentials' in request.content
        return httpx.Response(200, json={'access_token': 'new-token', 'token_type': 'Bearer', 'expires_in': 3600})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await market_auth.access_token(client) == 'new-token'
    asyncio.run(run())


@pytest.mark.parametrize('body', [{}, {'access_token': 'secret', 'token_type': 'Bearer', 'expires_in': True}])
def test_bad_response_does_not_expose_provider_text(monkeypatch, body):
    monkeypatch.setattr(market_auth, 'settings', lambda: {'TOSS_ACCESS_TOKEN': '', 'TOSS_CLIENT_ID': 'id', 'TOSS_CLIENT_SECRET': 'secret'})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))) as client:
            with pytest.raises(MarketProviderError, match='^MARKET_AUTH_RESPONSE_INVALID$'):
                await market_auth.access_token(client)
    asyncio.run(run())
