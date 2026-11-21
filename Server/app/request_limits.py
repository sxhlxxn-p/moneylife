"""Shared database quotas; no request text, keys or raw IP addresses are stored."""

import hashlib
import os
import time
from fastapi import Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models import RequestQuota
from app.sessions import get_owner


async def consume(session, identity, limit, seconds=60):
    now = int(time.time())
    window = now // seconds
    key = hashlib.sha256(f"{identity}:{window}".encode()).hexdigest()
    insert = sqlite_insert if session.bind.dialect.name == "sqlite" else postgres_insert
    await session.execute(
        insert(RequestQuota)
        .values(key=key, count=0, expires_at=(window + 1) * seconds)
        .on_conflict_do_nothing(index_elements=["key"])
    )
    result = await session.execute(
        update(RequestQuota)
        .where(RequestQuota.key == key, RequestQuota.count < limit)
        .values(count=RequestQuota.count + 1)
    )
    await session.commit()
    if result.rowcount != 1:
        raise HTTPException(
            429, "REQUEST_RATE_LIMITED", headers={"Retry-After": str(seconds - now % seconds)}
        )


async def limited_ai_owner(
    request: Request, owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)
):
    # Check both owner and connection IP: deleting cookies must not reset provider usage limits.
    address = request.client.host if request.client else "unknown"
    await consume(session, "ai-ip:" + address, int(os.getenv("AI_IP_REQUESTS_PER_MINUTE", "60")))
    await consume(session, "ai-owner:" + owner, int(os.getenv("AI_REQUESTS_PER_MINUTE", "12")))
    return owner
