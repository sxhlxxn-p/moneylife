"""Atomic, idempotent event branches with server-calculated results."""

import time
import json
from pathlib import Path
from copy import deepcopy
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.engine import calculate
from app.models import EventBranch, Plan, Run
from app.sessions import get_owner
from app.plan_store import owned_plan, summary
from app.schemas import PlanCreate, PlanDetail, RunDetail, StrictModel, GameState
from app.simulations import detail

router = APIRouter(prefix="/event-branches", tags=["plans"])
CATALOG = json.loads(
    (Path(__file__).resolve().parents[2] / "Shared/life-events.json").read_text(encoding="utf-8")
)
if CATALOG["version"] != "life-events-v1" or CATALOG["unit"] != "KRW":
    raise RuntimeError("Unsupported life event catalog")
EVENTS = {event["month"]: event for event in CATALOG["events"]}


class EventCreate(StrictModel):
    requestId: UUID
    eventRulesVersion: Literal["life-events-v1"] = "life-events-v1"
    base: PlanCreate
    eventMonth: Literal[12, 30, 48, 72, 96]
    accepted: bool = Field(strict=True)


class EventResult(StrictModel):
    basePlan: PlanDetail
    plan: PlanDetail
    run: RunDetail


async def stored(payload, owner, session):
    record = await session.scalar(
        select(EventBranch).where(
            EventBranch.owner_id == owner, EventBranch.request_id == str(payload.requestId)
        )
    )
    if record is None:
        return None
    if EventCreate.model_validate(record.command).model_dump(mode="json") != payload.model_dump(
        mode="json"
    ):
        raise HTTPException(409, "REQUEST_ID_CONFLICT")
    base = await owned_plan(record.base_plan_id, owner, session)
    child = await owned_plan(record.plan_id, owner, session)
    run = await session.get(Run, record.run_id)
    return {
        "basePlan": {**summary(base), "state": base.state},
        "plan": {**summary(child), "state": child.state},
        "run": detail(run),
    }


@router.post("", response_model=EventResult, status_code=201)
async def branch(
    payload: EventCreate,
    response: Response,
    owner: str = Depends(get_owner),
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    previous = await stored(payload, owner, session)
    if previous:
        return previous
    state = payload.base.state.model_dump(mode="json")
    event = payload.eventMonth
    if state["month"] != event or event in state["events"]:
        raise HTTPException(422, "EVENT_NOT_AVAILABLE")
    if payload.base.parentPlanId:
        await owned_plan(str(payload.base.parentPlanId), owner, session)
    candidate = deepcopy(state)
    if payload.accepted:
        rule = EVENTS[event]["rule"]
        if rule["kind"] == "income-pause":
            baseline = await calculate(state, 120)
            effects = [
                {"type": "income", "v": -baseline.monthlyResults[m].income, "m": m, "end": m}
                for m in range(event + 1, min(120, event + rule["months"]) + 1)
            ]
        else:
            effects = [
                {"type": kind, "v": value, "m": event + 1, "end": None}
                for kind, value in [(effect["type"], effect["value"]) for effect in rule["effects"]]
            ]
        candidate["changes"].extend(effects)
    candidate["events"].append(event)
    candidate["logs"] = [
        {"month": event, "text": EVENTS[event]["a" if payload.accepted else "b"]},
        *candidate["logs"],
    ][:80]
    try:
        candidate = GameState.model_validate(candidate).model_dump(mode="json")
    except ValidationError:
        raise HTTPException(422, "EVENT_STATE_INVALID") from None
    result = await calculate(candidate, 120)
    base_id, child_id, run_id = (str(uuid4()) for _ in range(3))
    now = int(time.time())
    base = Plan(
        id=base_id,
        owner_id=owner,
        name=state["initial"]["name"],
        parent_plan_id=str(payload.base.parentPlanId) if payload.base.parentPlanId else None,
        schema_version=1,
        goal_basis="net_assets",
        created_at=now,
        state=state,
    )
    child = Plan(
        id=child_id,
        owner_id=owner,
        name=state["initial"]["name"],
        parent_plan_id=base_id,
        schema_version=1,
        goal_basis="net_assets",
        created_at=now,
        state=candidate,
    )
    run = Run(
        id=run_id,
        owner_id=owner,
        request_id=str(payload.requestId),
        plan_id=child_id,
        plan_version=1,
        engine_version=result.engineVersion,
        months=120,
        created_at=time.time_ns() // 1000,
        input_snapshot={
            "schemaVersion": 1,
            "goalBasis": "net_assets",
            "state": candidate,
            "months": 120,
        },
        monthly_results=[r.model_dump() for r in result.monthlyResults],
        summary=result.summary.model_dump(),
    )
    record = EventBranch(
        id=str(uuid4()),
        owner_id=owner,
        request_id=str(payload.requestId),
        command=payload.model_dump(mode="json"),
        base_plan_id=base_id,
        plan_id=child_id,
        run_id=run_id,
    )
    session.add_all([base, child, run, record])
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        previous = await stored(payload, owner, session)
        if previous:
            return previous
        raise
    return {
        "basePlan": {**summary(base), "state": state},
        "plan": {**summary(child), "state": candidate},
        "run": detail(run),
    }
