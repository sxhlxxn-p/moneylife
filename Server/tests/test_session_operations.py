import asyncio
import hashlib
import sqlite3
import time
from pathlib import Path
import importlib.util
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from fastapi import HTTPException
from app import database
from app.models import GuestSession, AIClarification, Plan
from app.maintenance import cleanup
from app.request_limits import consume


def test_session_recovery_preserves_local_ownership_boundary(client, payload):
    old = client.post('/plans', json=payload).json()
    assert client.post('/plans/session/recover').json()['status'] == 'active'
    async def expire():
        async with AsyncSession(database.engine) as session:
            guests = (await session.scalars(select(GuestSession))).all()
            for guest in guests:
                guest.expires_at = 0
            await session.commit()
    asyncio.run(expire())
    assert client.get('/plans').status_code == 401
    assert client.post('/plans/session/recover', headers={'Origin': 'https://other.example'}).status_code == 403
    restored = client.post('/plans/session/recover')
    assert restored.status_code == 200
    assert restored.json() == {'status': 'renewed', 'previousServerPlansAccessible': False}
    assert client.get('/plans/'+old['id']).status_code == 404
    assert client.get('/plans').json() == []
    assert client.post('/plans', json=payload).status_code == 201


def test_shared_quota_and_temporary_cleanup(client, payload):
    plan = client.post('/plans', json=payload).json()
    async def exercise():
        async with AsyncSession(database.engine) as session:
            await consume(session, 'test-owner', 2)
            await consume(session, 'test-owner', 2)
        async with AsyncSession(database.engine) as session:
            with pytest.raises(HTTPException) as error:
                await consume(session, 'test-owner', 2)
            assert error.value.status_code == 429
            session.add(AIClarification(id='expired', owner_id='owner', plan_id=plan['id'],
                        expires_at=0, original_message='test', question='test', turns=[]))
            await session.commit()
            counts = await cleanup(session)
            assert counts['ai_clarifications'] == 1
            assert await session.get(AIClarification, 'expired')
            await cleanup(session, apply=True)
            assert await session.get(Plan, plan['id'])
        async with AsyncSession(database.engine) as session:
            assert await session.get(AIClarification, 'expired') is None
    asyncio.run(exercise())


def test_request_id_and_no_sensitive_logging(client, caplog):
    with caplog.at_level('INFO', logger='moneylife.requests'):
        response = client.get('/health?secret=do-not-log', headers={'Authorization': 'secret-key'})
    assert response.headers['x-request-id']
    assert 'route=/health' in caplog.text
    assert 'do-not-log' not in caplog.text
    assert 'secret-key' not in caplog.text


def test_migration_adopts_existing_baseline_and_keeps_data(tmp_path):
    from app.models import Base
    from sqlalchemy import MetaData
    async def exercise():
        engine = create_async_engine(f'sqlite+aiosqlite:///{tmp_path / "legacy.db"}')
        metadata = MetaData()
        for table in Base.metadata.sorted_tables:
            if table.name not in ('event_branches', 'request_quotas', 'plan_saves'):
                table.to_metadata(metadata)
        async with engine.begin() as connection:
            await connection.run_sync(metadata.create_all)
            await connection.execute(text("INSERT INTO guest_sessions VALUES ('hash','owner',9999999999)"))
            await connection.run_sync(database.migrate_database)
            assert await connection.scalar(text('SELECT version_num FROM alembic_version')) == '0004'
            assert await connection.scalar(text('SELECT owner_id FROM guest_sessions')) == 'owner'
            await connection.run_sync(database.migrate_database)
        await engine.dispose()
    asyncio.run(exercise())


def test_sqlite_backup_restore_and_no_overwrite(tmp_path):
    script = Path(__file__).resolve().parents[1] / 'scripts/sqlite_backup.py'
    spec = importlib.util.spec_from_file_location('sqlite_backup', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source, backup, restored = (tmp_path / name for name in ['source.db', 'backup.db', 'restore.db'])
    with sqlite3.connect(source) as connection:
        connection.execute('CREATE TABLE plans (id TEXT)')
        connection.execute("INSERT INTO plans VALUES ('saved-plan')")
    module.copy_database(source, backup)
    module.copy_database(backup, restored)
    with sqlite3.connect(restored) as connection:
        assert connection.execute('SELECT id FROM plans').fetchone()[0] == 'saved-plan'
    with pytest.raises(FileExistsError):
        module.copy_database(source, backup)


def test_ai_limit_blocks_before_provider_call(client, payload, monkeypatch):
    monkeypatch.setenv('AI_REQUESTS_PER_MINUTE', '1')
    plan = client.post('/plans', json=payload).json()
    # Unknown result returns 404 but still consumes the route quota.
    first = client.post('/ai/explain', json={'runId': '88f6301f-c40d-44f7-b91b-62d34c0ea624'})
    assert first.status_code == 404
    second = client.post('/ai/explain', json={'runId': '88f6301f-c40d-44f7-b91b-62d34c0ea624'})
    assert second.status_code == 429
    assert 1 <= int(second.headers['retry-after']) <= 60
    assert client.get('/plans/'+plan['id']).status_code == 200


def test_legacy_schema_mismatch_stops_migration(tmp_path):
    async def exercise():
        engine = create_async_engine(f'sqlite+aiosqlite:///{tmp_path / "incompatible.db"}')
        async with engine.begin() as connection:
            await connection.execute(text('CREATE TABLE unknown_data (value TEXT)'))
            with pytest.raises(RuntimeError, match='differs from baseline'):
                await connection.run_sync(database.migrate_database)
            assert await connection.scalar(text("SELECT count(*) FROM unknown_data")) == 0
        await engine.dispose()
    asyncio.run(exercise())


def test_production_schema_check_requires_explicit_migration(tmp_path, monkeypatch):
    async def exercise():
        engine = create_async_engine(f'sqlite+aiosqlite:///{tmp_path / "production.db"}')
        monkeypatch.setattr(database, 'engine', engine)
        monkeypatch.setenv('AUTO_MIGRATE', 'false')
        with pytest.raises(RuntimeError, match='schema is not current'):
            await database.prepare_database()
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT count(*) FROM sqlite_master WHERE type='table'")) == 0
        async with engine.begin() as connection:
            await connection.run_sync(database.migrate_database)
        await database.prepare_database()
        await engine.dispose()
    asyncio.run(exercise())


def test_production_start_requires_database_url(monkeypatch):
    monkeypatch.setattr(database, 'engine', None)
    monkeypatch.setenv('AUTO_MIGRATE', 'false')
    with pytest.raises(RuntimeError, match='DATABASE_URL is required'):
        asyncio.run(database.prepare_database())
