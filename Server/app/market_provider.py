"""Read-only Toss daily candles adapter. Author: sxhlxxn."""
from datetime import datetime, time
import re
from zoneinfo import ZoneInfo
import httpx
from app.market_import import DailyClose, decimal_integer

BASE_URL = 'https://openapi.tossinvest.com'
KST = ZoneInfo('Asia/Seoul')

class MarketProviderError(ValueError):
    pass

async def fetch_toss_daily(*, client: httpx.AsyncClient, access_token: str, symbol: str,
                           start, end, max_pages: int = 32) -> list[DailyClose]:
    if not re.fullmatch(r'[A-Z0-9]{6}', symbol): raise ValueError('Only domestic KRW symbols are supported')
    if not access_token.strip(): raise MarketProviderError('MARKET_TOKEN_MISSING')
    cursor = datetime.combine(end, time.max, KST).isoformat()
    records = {}
    cursors = set()
    for _ in range(max_pages):
        if cursor in cursors: raise MarketProviderError('MARKET_CURSOR_REPEATED')
        cursors.add(cursor)
        try:
            response = await client.get(BASE_URL + '/api/v1/candles',
                params={'symbol': symbol, 'interval': '1d', 'count': 200, 'before': cursor, 'adjusted': 'false'},
                headers={'Authorization': 'Bearer ' + access_token}, timeout=15, follow_redirects=False)
        except httpx.HTTPError:
            raise MarketProviderError('MARKET_CONNECTION_FAILED') from None
        if response.status_code != 200:
            codes = {401: 'MARKET_AUTH_FAILED', 403: 'MARKET_ACCESS_DENIED', 429: 'MARKET_RATE_LIMITED'}
            raise MarketProviderError(codes.get(response.status_code, 'MARKET_PROVIDER_FAILED'))
        if len(response.content) > 2_000_000: raise MarketProviderError('MARKET_RESPONSE_TOO_LARGE')
        try:
            result = response.json()['result']
            candles = result['candles']
            if not isinstance(candles, list) or len(candles) > 200: raise ValueError()
            days = []
            for candle in candles:
                timestamp = datetime.fromisoformat(candle['timestamp'])
                if timestamp.utcoffset() is None or candle['currency'] != 'KRW': raise ValueError()
                day = timestamp.astimezone(KST).date(); days.append(day)
                if start <= day <= end:
                    row = DailyClose(date=day, close=decimal_integer(candle['closePrice']), volume=decimal_integer(candle['volume']))
                    if day in records and records[day] != row: raise ValueError('Conflicting data')
                    records[day] = row
            if days != sorted(days, reverse=True): raise ValueError('Unsorted page')
            next_cursor = result.get('nextBefore')
            if not candles or min(days) <= start or not next_cursor:
                return sorted(records.values(), key=lambda row: row.date)
            next_time = datetime.fromisoformat(next_cursor)
            if next_time.utcoffset() is None: raise ValueError()
            # Inclusive page boundaries can repeat a candle; enforce cursor progress.
            if next_time >= datetime.fromisoformat(cursor): raise ValueError('Cursor did not move')
            cursor = next_time.isoformat()
        except (KeyError, TypeError, ValueError, OverflowError):
            raise MarketProviderError('MARKET_RESPONSE_INVALID') from None
    raise MarketProviderError('MARKET_PAGE_LIMIT')
