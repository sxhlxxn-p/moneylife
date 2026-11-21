"""Guest session renewal endpoint."""

import hashlib
import secrets
import time
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models import GuestSession
from app.sessions import COOKIE, SESSION_SECONDS, check_origin, set_guest_cookie
from app.request_limits import consume

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("/session/recover")
async def recover_session(
    request: Request, response: Response, session: AsyncSession = Depends(get_session)
):
    check_origin(request)
    address = request.client.host if request.client else "unknown"
    await consume(session, "session-ip:" + address, 30)
    token = request.cookies.get(COOKIE)
    now = int(time.time())
    if token:
        prior = await session.get(GuestSession, hashlib.sha256(token.encode()).hexdigest())
        if prior and prior.expires_at > now:
            response.headers["Cache-Control"] = "no-store"
            return {"status": "active", "previousServerPlansAccessible": True}
    token = secrets.token_urlsafe(32)
    session.add(
        GuestSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            owner_id=str(uuid4()),
            expires_at=now + SESSION_SECONDS,
        )
    )
    await session.commit()
    set_guest_cookie(response, token)
    response.headers["Cache-Control"] = "no-store"
    return {"status": "renewed", "previousServerPlansAccessible": False}
