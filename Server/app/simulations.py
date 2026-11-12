"""Store immutable server-calculated runs. Author: sxhlxxn."""

import time
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.engine import calculate
from app.models import Run
from app.plans import get_owner, owned_plan
from app.schemas import RunDetail, RunSummary, SimulationCreate


router = APIRouter(prefix="/simulations", tags=["simulations"])


def summary(run: Run) -> dict:
    return {
        "id": run.id, "planId": run.plan_id, "requestId": run.request_id,
        "planVersion": run.plan_version, "engineVersion": run.engine_version,
        "months": run.months, "createdAt": run.created_at // 1_000_000, "summary": run.summary,
    }


def detail(run: Run) -> dict:
    return {**summary(run), "inputSnapshot": run.input_snapshot, "monthlyResults": run.monthly_results}


async def existing_run(payload: SimulationCreate, owner: str, session: AsyncSession):
    run = await session.scalar(select(Run).where(Run.owner_id == owner, Run.request_id == str(payload.requestId)))
    if run and (run.plan_id != str(payload.planId) or run.months != payload.months):
        raise HTTPException(status_code=409, detail="REQUEST_ID_CONFLICT")
    return run


@router.post("", response_model=RunDetail)
async def simulate(
    payload: SimulationCreate, response: Response,
    owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    plan = await owned_plan(str(payload.planId), owner, session)
    old = await existing_run(payload, owner, session)
    if old:
        return detail(old)
    # Input comes exclusively from a validated, saved Plan, never from a browser result.
    result = await calculate(plan.state, payload.months)
    run = Run(
        id=str(uuid4()), owner_id=owner, request_id=str(payload.requestId), plan_id=plan.id,
        plan_version=1, engine_version=result.engineVersion, months=payload.months,
        created_at=time.time_ns() // 1_000,
        input_snapshot={"schemaVersion": plan.schema_version, "goalBasis": plan.goal_basis,
                        "state": plan.state, "months": payload.months},
        monthly_results=[row.model_dump() for row in result.monthlyResults],
        summary=result.summary.model_dump(),
    )
    session.add(run)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        old = await existing_run(payload, owner, session)
        if not old:
            raise
        return detail(old)
    return detail(run)


@router.get("", response_model=list[RunSummary])
async def list_runs(
    planId: UUID, response: Response,
    limit: int = Query(20, ge=1, le=100),
    owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session),
):
    await owned_plan(str(planId), owner, session)
    runs = await session.scalars(select(Run).where(Run.owner_id == owner, Run.plan_id == str(planId))
                                .order_by(Run.created_at.desc(), Run.id.desc()).limit(limit))
    response.headers["Cache-Control"] = "no-store"
    return [summary(run) for run in runs]


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(
    run_id: UUID, response: Response,
    owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session),
):
    run = await session.scalar(select(Run).where(Run.id == str(run_id), Run.owner_id == owner))
    if run is None:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    response.headers["Cache-Control"] = "no-store"
    return detail(run)
