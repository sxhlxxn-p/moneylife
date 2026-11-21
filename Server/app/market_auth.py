"""Server-only Toss credentials and token acquisition."""
import os
import re
from pathlib import Path
import httpx
from dotenv import dotenv_values
from app.market_provider import MarketProviderError


def settings():
    file = Path(__file__).resolve().parents[1] / '.env'
    values = dotenv_values(file, interpolate=False) if file.is_file() else {}
    return {name: str(os.environ.get(name, values.get(name) or '')).strip()
            for name in ('TOSS_ACCESS_TOKEN', 'TOSS_CLIENT_ID', 'TOSS_CLIENT_SECRET')}


def readiness():
    values = settings()
    token = bool(values['TOSS_ACCESS_TOKEN'])
    credentials = bool(values['TOSS_CLIENT_ID'] and values['TOSS_CLIENT_SECRET'])
    return {'configured': token or credentials, 'mode': 'access-token' if token else 'client-credentials' if credentials else 'not-configured'}


async def access_token(client: httpx.AsyncClient):
    values = settings()
    if values['TOSS_ACCESS_TOKEN']:
        if not re.fullmatch(r'[A-Za-z0-9._~+/-]+=*', values['TOSS_ACCESS_TOKEN']):
            raise MarketProviderError('MARKET_TOKEN_INVALID')
        return values['TOSS_ACCESS_TOKEN']
    if not values['TOSS_CLIENT_ID'] or not values['TOSS_CLIENT_SECRET']:
        raise MarketProviderError('MARKET_NOT_CONFIGURED')
    try:
        response = await client.post('https://openapi.tossinvest.com/oauth2/token',
            data={'grant_type': 'client_credentials', 'client_id': values['TOSS_CLIENT_ID'],
                  'client_secret': values['TOSS_CLIENT_SECRET']}, timeout=15, follow_redirects=False)
    except httpx.HTTPError:
        raise MarketProviderError('MARKET_CONNECTION_FAILED') from None
    if response.status_code != 200:
        raise MarketProviderError('MARKET_AUTH_FAILED')
    try:
        if len(response.content) > 100_000:
            raise ValueError('Oversized response')
        body = response.json()
        token = body['access_token']
        if (not isinstance(token, str) or not token.strip() or '\n' in token or '\r' in token or
            body.get('token_type', '').lower() != 'bearer' or type(body['expires_in']) is not int or body['expires_in'] <= 0):
            raise ValueError('Invalid token response')
        return token
    except (ValueError, KeyError, TypeError, AttributeError):
        raise MarketProviderError('MARKET_AUTH_RESPONSE_INVALID') from None
