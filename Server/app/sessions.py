"""Guest identity and origin checks shared by all API routes."""

import hashlib
import os
import secrets
import time
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models import GuestSession

COOKIE = "moneylife_guest"
SESSION_SECONDS = 30 * 24 * 60 * 60


def check_origin(request: Request):
    origin = request.headers.get("origin")
    allowed = {
        os.getenv("CLIENT_ORIGIN", "http://localhost:5173"),
        str(request.base_url).rstrip("/"),
    }
    if request.method not in ("GET", "HEAD") and origin and origin not in allowed:
        raise HTTPException(403, "ORIGIN_NOT_ALLOWED")


def set_guest_cookie(response: Response, token: str):
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        path="/",
    )


async def get_owner(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> str:
    check_origin(request)
    token = request.cookies.get(COOKIE)
    now = int(time.time())
    if token:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        guest = await session.get(GuestSession, token_hash)
        if guest and guest.expires_at > now:
            return guest.owner_id
        raise HTTPException(status_code=401, detail="SESSION_EXPIRED")
    token = secrets.token_urlsafe(32)
    guest = GuestSession(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        owner_id=str(uuid4()),
        expires_at=now + SESSION_SECONDS,
    )
    session.add(guest)
    await session.commit()
    set_guest_cookie(response, token)
    return guest.owner_id
