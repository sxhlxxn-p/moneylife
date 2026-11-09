"""Server-controlled immutable test market data. Author: sxhlxxn / 202439688."""
import hashlib
import json
import os
import re
from pathlib import Path
from fastapi import HTTPException
from app.market_import import HistoricalSeries

FIXTURE = Path(__file__).resolve().parents[2] / 'fixtures/paper-trading/monthly-run.json'
SOURCE_KEYS = ('priceSeriesId', 'symbol', 'label', 'dataKind', 'priceDataHash', 'lastMonth',
               'provider', 'sourceUrl', 'collectedAt', 'historicalStartMonth', 'historicalEndMonth',
               'adjustment', 'sampling', 'corporateActions')

def source(snapshot: dict) -> dict:
    return {key: snapshot[key] for key in SOURCE_KEYS if key in snapshot}

def load_series(series_id: str) -> dict:
    if series_id != 'synthetic-monthly-v1':
        return load_historical(series_id)
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


def catalog_dir() -> Path:
    return Path(os.getenv('MARKET_SERIES_DIR', str(FIXTURE.parents[2] / '.data' / 'market')))


def load_historical(series_id: str) -> dict:
    if not re.fullmatch(r'[A-Za-z0-9._:-]{1,64}', series_id):
        raise HTTPException(404, 'SERIES_NOT_FOUND')
    file = catalog_dir() / (series_id + '.json')
    try:
        if file.is_symlink() or not file.is_file():
            raise HTTPException(404, 'SERIES_NOT_FOUND')
        if file.stat().st_size > 250_000:
            raise ValueError('Oversized market snapshot')
        snapshot = HistoricalSeries.model_validate_json(file.read_bytes()).model_dump(mode='json')
        if snapshot['priceSeriesId'] != series_id:
            raise ValueError('Series ID mismatch')
        if snapshot['usageScope'] != 'project':
            raise HTTPException(404, 'SERIES_NOT_FOUND')
        return snapshot
    except (OSError, ValueError):
        raise HTTPException(503, 'MARKET_CATALOG_INVALID') from None


def catalog_sources() -> list[dict]:
    snapshots = [source(load_series('synthetic-monthly-v1'))]
    directory = catalog_dir()
    if directory.is_dir():
        files = sorted(directory.glob('*.json'))
        if len(files) > 100:
            raise HTTPException(503, 'MARKET_CATALOG_LIMIT')
        for file in files:
            if file.stem == 'synthetic-monthly-v1':
                raise HTTPException(503, 'MARKET_CATALOG_INVALID')
            try:
                snapshots.append(source(load_historical(file.stem)))
            except HTTPException as error:
                if error.status_code != 404: raise
    return snapshots
