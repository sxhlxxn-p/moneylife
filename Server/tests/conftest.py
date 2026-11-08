"""Shared real-DB test fixtures. Author: sxhlxxn / 202439688."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine
from app import database
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'plans.db'}")
    monkeypatch.setattr(database, 'engine', engine)
    with TestClient(app) as client:
        yield client

@pytest.fixture
def payload():
    return {
        'schemaVersion': 1, 'goalBasis': 'net_assets',
        'state': {
            'initial': {'name': '독립 계획', 'age': 25, 'avatar': '🌱', 'cash': 10000000, 'saved': 0, 'income': 2500000, 'expense': 1600000, 'target': 20000000},
            'monthlySaving': 700000, 'annualRate': 0, 'month': 13,
            'changes': [{'type': 'expense', 'v': 300000, 'm': 13, 'end': None}, {'type': 'once', 'v': 3000000, 'm': 13, 'end': None}],
            'rateChanges': [], 'logs': [{'month': 12, 'text': '독립 선택'}], 'events': [12]
        }
    }

