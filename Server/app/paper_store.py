"""Owned investment snapshots, replay detection and transactional persistence."""

from copy import deepcopy
import time
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from app.models import PaperPlan, PaperRun
from app.market import source
from app.investment_engine import calculate_investment


async def owned_paper(plan_id: str, owner: str, session: AsyncSession) -> PaperPlan:
    plan = await session.scalar(
        select(PaperPlan).where(PaperPlan.id == plan_id, PaperPlan.owner_id == owner)
    )
    if plan is None:
        raise HTTPException(404, "PAPER_PLAN_NOT_FOUND")
    return plan


async def stored_run(plan: PaperPlan, session: AsyncSession) -> PaperRun:
    run = await session.scalar(
        select(PaperRun).where(
            PaperRun.paper_plan_id == plan.id, PaperRun.owner_id == plan.owner_id
        )
    )
    if run is None:
        raise HTTPException(503, "PAPER_RUN_UNAVAILABLE")
    return run


def detail(plan: PaperPlan, run_id: str, *, include_state=True) -> dict:
    action = plan.command.get("kind")
    result = {
        "id": plan.id,
        "parentPaperPlanId": plan.parent_id,
        "action": action
        if action in ("create", "order", "advance", "cancel", "conditions")
        else None,
        "financialPlanId": plan.financial_plan_id,
        "name": plan.state["initial"]["name"],
        "month": plan.state["month"],
        "source": source(plan.market_snapshot),
        "runId": run_id,
        "createdAt": plan.created_at,
    }
    if include_state:
        result.update(state=plan.state, orders=plan.orders)
    return result


def run_detail(run: PaperRun) -> dict:
    return {
        "id": run.id,
        "paperPlanId": run.paper_plan_id,
        "engineVersion": run.engine_version,
        "createdAt": run.created_at,
        "source": source(run.input_snapshot["market"]),
        "result": run.result,
    }


def bundle(plan: PaperPlan, run: PaperRun) -> dict:
    return {"plan": detail(plan, run.id), "run": run_detail(run)}


async def existing(owner: str, request_id: str, command: dict, session: AsyncSession):
    plan = await session.scalar(
        select(PaperPlan).where(PaperPlan.owner_id == owner, PaperPlan.request_id == request_id)
    )
    if plan is None:
        return None
    if plan.command != command:
        raise HTTPException(409, "REQUEST_ID_CONFLICT")
    return bundle(plan, await stored_run(plan, session))


async def save(
    owner: str,
    request_id: str,
    command: dict,
    financial_plan_id: str,
    parent_id: str | None,
    state: dict,
    orders: list,
    market: dict,
    session: AsyncSession,
):
    investment = {key: market[key] for key in ("symbol", "priceSeriesId", "prices", "costs")}
    investment["orders"] = orders
    calculated = await calculate_investment(state, investment, state["month"])
    now = time.time_ns() // 1000
    plan = PaperPlan(
        id=str(uuid4()),
        owner_id=owner,
        request_id=request_id,
        command=command,
        financial_plan_id=financial_plan_id,
        parent_id=parent_id,
        state=deepcopy(state),
        orders=deepcopy(orders),
        market_snapshot=deepcopy(market),
        created_at=now,
    )
    run = PaperRun(
        id=str(uuid4()),
        owner_id=owner,
        paper_plan_id=plan.id,
        engine_version=calculated.invested.engineVersion,
        created_at=now,
        input_snapshot={
            "state": deepcopy(state),
            "orders": deepcopy(orders),
            "market": deepcopy(market),
        },
        result=calculated.model_dump(mode="json"),
    )
    session.add_all([plan, run])
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        prior = await existing(owner, request_id, command, session)
        if prior is not None:
            return prior
        raise
    return bundle(plan, run)


async def list_owned(owner: str, limit: int, offset: int, session: AsyncSession):
    # Page plans first so a missing result cannot silently remove a saved plan.
    page = (
        select(PaperPlan)
        .where(PaperPlan.owner_id == owner)
        .order_by(PaperPlan.created_at.desc(), PaperPlan.id.desc())
        .limit(limit)
        .offset(offset)
        .subquery()
    )
    plan = aliased(PaperPlan, page)
    result = await session.execute(
        select(plan, PaperRun.id)
        .outerjoin(
            PaperRun,
            (PaperRun.paper_plan_id == plan.id) & (PaperRun.owner_id == owner),
        )
        .order_by(plan.created_at.desc(), plan.id.desc())
    )
    pairs = result.all()
    if any(run_id is None for _, run_id in pairs):
        raise HTTPException(503, "PAPER_RUN_UNAVAILABLE")
    return pairs
