import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def create_database_engine() -> AsyncEngine | None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return None

    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )


engine = create_database_engine()


async def check_database_connection() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL is not configured")

    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def close_database_connection() -> None:
    if engine is not None:
        await engine.dispose()
