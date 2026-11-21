import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from fastapi import HTTPException

from pathlib import Path

from alembic import command
from alembic.config import Config


def create_database_engine() -> AsyncEngine | None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return None

    options = {"pool_pre_ping": True}
    if not database_url.startswith("sqlite"):
        options.update(pool_size=5, max_overflow=5)
    return create_async_engine(database_url, **options)


engine = create_database_engine()


def database_kind() -> str:
    return engine.dialect.name if engine is not None else "postgresql"


async def initialize_database() -> None:
    if engine is not None:
        async with engine.begin() as connection:
            await connection.run_sync(migrate_database)


async def get_session():
    if engine is None:
        raise HTTPException(status_code=503, detail="DATABASE_UNAVAILABLE")
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session


async def check_database_connection() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL is not configured")

    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def close_database_connection() -> None:
    if engine is not None:
        await engine.dispose()


def migrate_database(connection):
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
    config.attributes['connection'] = connection
    command.upgrade(config, 'head')


async def prepare_database():
    if os.getenv('AUTO_MIGRATE', 'true').strip().lower() == 'true':
        await initialize_database()
        return
    if engine is None:
        raise RuntimeError('DATABASE_URL is required when automatic migrations are disabled.')
    async with engine.connect() as connection:
        await connection.run_sync(verify_schema)


def verify_schema(connection):
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory

    config = Config()
    config.set_main_option(
        'script_location', str(Path(__file__).resolve().parents[1] / 'migrations')
    )
    expected = set(ScriptDirectory.from_config(config).get_heads())
    actual = set(MigrationContext.configure(connection).get_current_heads())
    if actual != expected:
        raise RuntimeError(
            'Database schema is not current. Run the migration command before starting the API.'
        )
