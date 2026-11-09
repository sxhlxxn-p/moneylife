"""Server-controlled immutable test market data. Author: sxhlxxn / 202439688."""
import hashlib
import json
from pathlib import Path
from fastapi import HTTPException

FIXTURE = Path(__file__).resolve().parents[2] / 'fixtures/paper-trading/monthly-run.json'
SOURCE_KEYS = ('priceSeriesId', 'symbol', 'label', 'dataKind', 'priceDataHash', 'lastMonth')

def source(snapshot: dict) -> dict:
    return {key: snapshot[key] for key in SOURCE_KEYS}

def load_series(series_id: str) -> dict:
    if series_id != 'synthetic-monthly-v1':
        raise HTTPException(404, 'SERIES_NOT_FOUND')
    try:
        fixture = json.loads(FIXTURE.read_text())
        investment = fixture['investment']
        snapshot = {key: investment[key] for key in ('priceSeriesId', 'symbol', 'prices', 'costs')}
        snapshot.update(label=fixture['description'], dataKind=fixture['dataKind'], lastMonth=fixture['months'])
        encoded = json.dumps(snapshot, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
        snapshot['priceDataHash'] = hashlib.sha256(encoded).hexdigest()
        return snapshot
    except (OSError, ValueError, KeyError):
        raise HTTPException(503, 'MARKET_UNAVAILABLE') from None
