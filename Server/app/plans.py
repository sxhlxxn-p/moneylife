"""Immutable plan save/load for guest sessions. Author: sxhlxxn."""

import hashlib
import os
import secrets
import time
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import GuestSession, Plan
from app.schemas import PlanCreate, PlanDetail, PlanSummary


router = APIRouter(prefix="/plans", tags=["plans"])
COOKIE = "moneylife_guest"
SESSION_SECONDS = 30 * 24 * 60 * 60


async def get_owner(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> str:
    # Browsers send Origin for cross-origin writes. Reject it before issuing cookies.
    origin = request.headers.get("origin")
    allowed = {os.getenv("CLIENT_ORIGIN", "http://localhost:5173"), str(request.base_url).rstrip("/")}
    if request.method not in ("GET", "HEAD") and origin and origin not in allowed:
        raise HTTPException(status_code=403, detail="ORIGIN_NOT_ALLOWED")
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
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        path="/",
    )
    return guest.owner_id


def summary(plan: Plan) -> dict:
    return {
        "id": plan.id,
        "name": plan.name,
        "parentPlanId": plan.parent_plan_id,
        "schemaVersion": plan.schema_version,
        "goalBasis": plan.goal_basis,
        "createdAt": plan.created_at,
        "month": plan.state["month"],
    }


async def owned_plan(plan_id: str, owner: str, session: AsyncSession) -> Plan:
    plan = await session.scalar(select(Plan).where(Plan.id == plan_id, Plan.owner_id == owner))
    if plan is None:
        raise HTTPException(status_code=404, detail="PLAN_NOT_FOUND")
    return plan


@router.post("", response_model=PlanDetail, status_code=201)
async def create_plan(
    payload: PlanCreate,
    response: Response,
    owner: str = Depends(get_owner),
    session: AsyncSession = Depends(get_session),
):
    if payload.parentPlanId is not None:
        await owned_plan(str(payload.parentPlanId), owner, session)
    plan = Plan(
        id=str(uuid4()),
        owner_id=owner,
        name=payload.state.initial.name,
        parent_plan_id=str(payload.parentPlanId) if payload.parentPlanId else None,
        schema_version=payload.schemaVersion,
        goal_basis=payload.goalBasis,
        created_at=int(time.time()),
        state=payload.state.model_dump(mode="json"),
    )
    session.add(plan)
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    return {**summary(plan), "state": plan.state}


@router.get("", response_model=list[PlanSummary])
async def list_plans(
    response: Response,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    owner: str = Depends(get_owner),
    session: AsyncSession = Depends(get_session),
):
    plans = await session.scalars(
        select(Plan).where(Plan.owner_id == owner).order_by(Plan.created_at.desc(), Plan.id.desc())
        .limit(limit).offset(offset)
    )
    response.headers["Cache-Control"] = "no-store"
    return [summary(plan) for plan in plans]


@router.get("/{plan_id}", response_model=PlanDetail)
async def get_plan(
    plan_id: UUID,
    response: Response,
    owner: str = Depends(get_owner),
    session: AsyncSession = Depends(get_session),
):
    plan = await owned_plan(str(plan_id), owner, session)
    response.headers["Cache-Control"] = "no-store"
    return {**summary(plan), "state": plan.state}
