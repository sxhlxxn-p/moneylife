"""Explicit isolated PostgreSQL checks; never use an application database here."""
import asyncio
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import os
from unittest.mock import patch
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from app import database
from app.main import app

URL=os.getenv('TEST_DATABASE_URL')
pytestmark=pytest.mark.skipif(not URL,reason='TEST_DATABASE_URL is required for isolated PostgreSQL integration checks.')

@pytest.fixture(scope='module',autouse=True)
def migrate_isolated_database():
    if not URL:pytest.skip('No isolated PostgreSQL URL.')
    parsed=make_url(URL)
    if parsed.host not in ('127.0.0.1','localhost') or not parsed.database.endswith('_test'):
        raise RuntimeError('Only a loopback PostgreSQL database with a _test suffix is permitted.')
    async def migrate():
        engine=create_async_engine(URL)
        async with engine.begin() as connection:await connection.run_sync(database.migrate_database)
        await engine.dispose()
    asyncio.run(migrate())

@contextmanager
def api():
    engine=create_async_engine(URL)
    with patch.object(database,'engine',engine),patch.dict(os.environ,{'AUTO_MIGRATE':'false','COOKIE_SECURE':'true','CLIENT_ORIGIN':'https://testserver'}):
        with TestClient(app,base_url='https://testserver') as client:yield client

def command():
    return {'requestId':str(uuid4()),'plan':{'state':{'initial':{'name':'PostgreSQL check','age':25,'avatar':'test','cash':10000000,'saved':0,'income':2500000,'expense':1600000,'target':20000000},'goal':{'name':'Test goal','months':24},'monthlySaving':700000,'annualRate':0,'month':0}}}

def test_save_calculate_and_retry():
    with api() as client:
        body=command();saved=client.post('/plan-saves',json=body)
        assert saved.status_code==201
        assert 'Secure' in saved.headers['set-cookie']
        assert client.post('/plan-saves',json=body).json()==saved.json()
        request={'requestId':str(uuid4()),'planId':saved.json()['id'],'months':120}
        result=client.post('/simulations',json=request)
        assert result.status_code==200
        assert result.json()['summary']['goalMonth']==12
        assert client.post('/simulations',json=request).json()==result.json()
        assert len(client.get('/plans').json())==1

def test_concurrent_plan_saves():
    with api() as client:
        client.get('/plans');body=command()
        with ThreadPoolExecutor(max_workers=3) as pool:
            responses=list(pool.map(lambda _:client.post('/plan-saves',json=body),range(3)))
        assert all(response.status_code==201 for response in responses)
        assert len({response.json()['id'] for response in responses})==1
        assert len(client.get('/plans').json())==1

def test_restart_preserves_goal_and_owner():
    with api() as client:
        saved=client.post('/plan-saves',json=command()).json();cookies=dict(client.cookies)
    with api() as restarted:
        restarted.cookies.update(cookies)
        assert restarted.get('/plans/'+saved['id']).json()==saved
        restarted.cookies.clear();restarted.get('/plans')
        assert restarted.get('/plans/'+saved['id']).status_code==404

def test_production_start_does_not_automatically_migrate():
    with patch.object(database,'initialize_database',side_effect=AssertionError('Unexpected migration')):
        with api() as client:assert client.get('/health/db').json()['database']=='postgresql'
