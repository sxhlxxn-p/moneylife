"""Atomic, idempotent event branches with server-calculated results."""
import time
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
from app.plans import get_owner, owned_plan, summary
from app.schemas import PlanCreate, PlanDetail, RunDetail, StrictModel, GameState
from app.simulations import detail

router = APIRouter(prefix='/event-branches', tags=['plans'])
LABELS = {
    12: ('지금 독립할래요', '조금 더 준비할래요'),
    30: ('나를 위한 휴식', '지금의 일상 유지'),
    48: ('새로운 도전 시작', '지금의 자리에서'),
    72: ('지금 떠날래요', '다음을 기약할래요'),
    96: ('배움을 시작할래요', '지금 계획을 유지'),
}
EFFECTS = {12: [('expense', 300000), ('once', 3000000)],
           48: [('income', 400000), ('once', 2000000)],
           72: [('once', 4000000)], 96: [('once', 2000000)]}

class EventCreate(StrictModel):
    requestId: UUID
    base: PlanCreate
    eventMonth: Literal[12, 30, 48, 72, 96]
    accepted: bool = Field(strict=True)

class EventResult(StrictModel):
    basePlan: PlanDetail
    plan: PlanDetail
    run: RunDetail

async def stored(payload, owner, session):
    record = await session.scalar(select(EventBranch).where(
        EventBranch.owner_id == owner, EventBranch.request_id == str(payload.requestId)))
    if record is None:
        return None
    if record.command != payload.model_dump(mode='json'):
        raise HTTPException(409, 'REQUEST_ID_CONFLICT')
    base = await owned_plan(record.base_plan_id, owner, session)
    child = await owned_plan(record.plan_id, owner, session)
    run = await session.get(Run, record.run_id)
    return {'basePlan': {**summary(base), 'state': base.state},
            'plan': {**summary(child), 'state': child.state}, 'run': detail(run)}

@router.post('', response_model=EventResult, status_code=201)
async def branch(payload: EventCreate, response: Response,
                 owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    previous = await stored(payload, owner, session)
    if previous:
        return previous
    state = payload.base.state.model_dump(mode='json')
    event = payload.eventMonth
    if state['month'] != event or event in state['events']:
        raise HTTPException(422, 'EVENT_NOT_AVAILABLE')
    if payload.base.parentPlanId:
        await owned_plan(str(payload.base.parentPlanId), owner, session)
    candidate = deepcopy(state)
    if payload.accepted:
        if event == 30:
            baseline = await calculate(state, 120)
            effects = [{'type': 'income', 'v': -baseline.monthlyResults[m].income, 'm': m, 'end': m}
                       for m in range(event + 1, event + 4)]
        else:
            effects = [{'type': kind, 'v': value, 'm': event + 1, 'end': None}
                       for kind, value in EFFECTS[event]]
        candidate['changes'].extend(effects)
    candidate['events'].append(event)
    candidate['logs'] = [{'month': event, 'text': LABELS[event][0 if payload.accepted else 1]}, *candidate['logs']][:80]
    try:
        candidate = GameState.model_validate(candidate).model_dump(mode='json')
    except ValidationError:
        raise HTTPException(422, 'EVENT_STATE_INVALID') from None
    result = await calculate(candidate, 120)
    base_id, child_id, run_id = (str(uuid4()) for _ in range(3))
    now = int(time.time())
    base = Plan(id=base_id, owner_id=owner, name=state['initial']['name'],
                parent_plan_id=str(payload.base.parentPlanId) if payload.base.parentPlanId else None,
                schema_version=1, goal_basis='net_assets', created_at=now, state=state)
    child = Plan(id=child_id, owner_id=owner, name=state['initial']['name'], parent_plan_id=base_id,
                 schema_version=1, goal_basis='net_assets', created_at=now, state=candidate)
    run = Run(id=run_id, owner_id=owner, request_id=str(payload.requestId), plan_id=child_id,
              plan_version=1, engine_version=result.engineVersion, months=120,
              created_at=time.time_ns() // 1000,
              input_snapshot={'schemaVersion': 1, 'goalBasis': 'net_assets', 'state': candidate, 'months': 120},
              monthly_results=[r.model_dump() for r in result.monthlyResults], summary=result.summary.model_dump())
    record = EventBranch(id=str(uuid4()), owner_id=owner, request_id=str(payload.requestId),
                         command=payload.model_dump(mode='json'), base_plan_id=base_id,
                         plan_id=child_id, run_id=run_id)
    session.add_all([base, child, run, record])
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        previous = await stored(payload, owner, session)
        if previous:
            return previous
        raise
    return {'basePlan': {**summary(base), 'state': state},
            'plan': {**summary(child), 'state': candidate}, 'run': detail(run)}
