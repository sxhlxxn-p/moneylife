"""Normalize private daily market data. Author: sxhlxxn."""
import calendar
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
from typing import Annotated, Literal
from zoneinfo import ZoneInfo
from pydantic import Field, field_validator, model_validator
from app.schemas import StrictModel

IDENTIFIER = r'^[A-Za-z0-9._:-]{1,64}$'

class DailyClose(StrictModel):
    date: date
    close: int = Field(strict=True, ge=1, le=10_000_000_000)
    volume: int = Field(strict=True, ge=0)

class HistoricalSeries(StrictModel):
    priceSeriesId: str = Field(pattern=IDENTIFIER)
    symbol: str = Field(pattern=r'^[A-Z0-9]{6}$')
    label: str = Field(min_length=1, max_length=120)
    dataKind: Literal['historical-market'] = 'historical-market'
    provider: str = Field(min_length=1, max_length=80)
    sourceUrl: str = Field(max_length=500)
    collectedAt: datetime
    usageScope: Literal['private', 'project'] = 'private'
    currency: Literal['KRW'] = 'KRW'
    adjustment: Literal['unadjusted'] = 'unadjusted'
    sampling: Literal['last-observed-daily-close'] = 'last-observed-daily-close'
    corporateActions: Literal['not-modeled'] = 'not-modeled'
    historicalStartMonth: str
    historicalEndMonth: str
    lastMonth: int = Field(strict=True, ge=1, le=120)
    costs: dict[str, Annotated[int, Field(strict=True)]]
    prices: list[dict] = Field(min_length=2, max_length=121)
    priceDataHash: str

    @field_validator('sourceUrl')
    @classmethod
    def valid_url(cls, value):
        from urllib.parse import urlsplit
        url = urlsplit(value)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('Source URL must be public HTTPS without credentials or query')
        return value

    @model_validator(mode='after')
    def valid_snapshot(self):
        if self.collectedAt.utcoffset() is None:
            raise ValueError('Collection timestamp must include timezone')
        start = parse_month(self.historicalStartMonth)
        end = parse_month(self.historicalEndMonth)
        if month_number(end) - month_number(start) != self.lastMonth:
            raise ValueError('Invalid historical period')
        if end_of_month(end) >= self.collectedAt.astimezone(ZoneInfo('Asia/Seoul')).date():
            raise ValueError('Only completed months are supported')
        if set(self.costs) != {'feeBps', 'sellTaxBps'} or any(type(v) is not int or not 0 <= v <= 10000 for v in self.costs.values()):
            raise ValueError('Invalid cost assumptions')
        if len(self.prices) != self.lastMonth + 1:
            raise ValueError('Incomplete month indices')
        valid_start = False
        for index, quote in enumerate(self.prices):
            if set(quote) != {'month', 'price', 'tradable', 'observedOn'} or type(quote['month']) is not int or quote['month'] != index:
                raise ValueError('Invalid price row')
            price = quote['price']
            if type(quote['tradable']) is not bool or (price is not None and (type(price) is not int or not 1 <= price <= 10_000_000_000)):
                raise ValueError('Invalid price')
            if price is None:
                if quote['observedOn'] is not None or quote['tradable']:
                    raise ValueError('Missing prices cannot be traded')
            else:
                if not isinstance(quote['observedOn'], str):
                    raise ValueError('Observation date is required')
                observed = date.fromisoformat(quote['observedOn'])
                if month_number(observed) != month_number(start) + index:
                    raise ValueError('Observation outside target month')
                if index == 0: valid_start = True
        if not valid_start:
            raise ValueError('Starting price is required')
        content = self.model_dump(mode='json', exclude={'priceDataHash'})
        if fingerprint(content) != self.priceDataHash:
            raise ValueError('Price data hash mismatch')
        return self

def parse_month(value: str) -> date:
    if not re.fullmatch(r'\d{4}-\d{2}', value):
        raise ValueError('Month must be YYYY-MM')
    return date.fromisoformat(value + '-01')

def month_number(value: date) -> int:
    return value.year * 12 + value.month - 1

def month_at(start: date, offset: int) -> date:
    year, month = divmod(month_number(start) + offset, 12)
    return date(year, month + 1, 1)

def end_of_month(value: date) -> date:
    return date(value.year, value.month, calendar.monthrange(value.year, value.month)[1])

def fingerprint(content: dict) -> str:
    encoded = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
    return hashlib.sha256(encoded).hexdigest()

def decimal_integer(value) -> int:
    if isinstance(value, bool): raise ValueError('Boolean is not a price')
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number != number.to_integral_value(): raise ValueError('Integer required')
        return int(number)
    except (InvalidOperation, TypeError):
        raise ValueError('Invalid number') from None

def build_series(*, daily: list[DailyClose], series_id: str, symbol: str, label: str,
                 start_month: str, end_month: str, provider: str, source_url: str,
                 collected_at: datetime | None = None, usage_scope: str = 'private') -> dict:
    if series_id == 'synthetic-monthly-v1': raise ValueError('Reserved series ID')
    start, end = parse_month(start_month), parse_month(end_month)
    count = month_number(end) - month_number(start)
    if not 1 <= count <= 120: raise ValueError('Period must include 2~121 months')
    observations = {}
    for row in daily:
        if row.date in observations and observations[row.date] != row:
            raise ValueError('Conflicting daily observations')
        observations[row.date] = row
    prices = []
    for index in range(count + 1):
        period = month_at(start, index)
        rows = [r for r in observations.values() if month_number(r.date) == month_number(period)]
        last = max(rows, key=lambda r: r.date) if rows else None
        prices.append({'month': index, 'price': last.close if last else None,
                       'tradable': bool(last and last.volume > 0), 'observedOn': last.date.isoformat() if last else None})
    content = dict(priceSeriesId=series_id, symbol=symbol, label=label, dataKind='historical-market',
        provider=provider, sourceUrl=source_url, collectedAt=(collected_at or datetime.now(timezone.utc)).isoformat(),
        usageScope=usage_scope, currency='KRW', adjustment='unadjusted', sampling='last-observed-daily-close',
        corporateActions='not-modeled', historicalStartMonth=start_month, historicalEndMonth=end_month,
        lastMonth=count, costs={'feeBps': 0, 'sellTaxBps': 0}, prices=prices)
    # Round-trip normalizes dates before hashing, matching catalog validation.
    content['collectedAt'] = datetime.fromisoformat(content['collectedAt']).isoformat().replace('+00:00', 'Z')
    content['priceDataHash'] = fingerprint(content)
    return HistoricalSeries.model_validate(content).model_dump(mode='json')
