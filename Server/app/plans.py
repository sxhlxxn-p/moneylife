"""Immutable plan save/load for guest sessions."""

import time
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Plan
from app.sessions import get_owner
from app.plan_store import owned_plan, summary
from app.schemas import PlanCreate, PlanDetail, PlanSummary


router = APIRouter(prefix="/plans", tags=["plans"])


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
        select(Plan)
        .where(Plan.owner_id == owner)
        .order_by(Plan.created_at.desc(), Plan.id.desc())
        .limit(limit)
        .offset(offset)
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
