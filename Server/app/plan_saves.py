"""Create a plan once; calculation retries use the existing simulations API."""
import time
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Plan, PlanSave
from app.plans import get_owner, owned_plan, summary
from app.schemas import StrictModel, PlanCreate, PlanDetail

router = APIRouter(prefix='/plan-saves', tags=['plans'])


class SaveCommand(StrictModel):
    requestId: UUID
    plan: PlanCreate


async def existing(payload, owner, session):
    record = await session.scalar(
        select(PlanSave).where(
            PlanSave.owner_id == owner,
            PlanSave.request_id == str(payload.requestId),
        )
    )
    if record is None:
        return None
    if record.command != payload.plan.model_dump(mode='json'):
        raise HTTPException(409, 'REQUEST_ID_CONFLICT')
    return await owned_plan(record.plan_id, owner, session)


@router.post('', response_model=PlanDetail, status_code=201)
async def save(
    payload: SaveCommand,
    response: Response,
    owner: str = Depends(get_owner),
    session: AsyncSession = Depends(get_session),
):
    response.headers['Cache-Control'] = 'no-store'
    plan = await existing(payload, owner, session)
    if plan is not None:
        return {**summary(plan), 'state': plan.state}
    source = payload.plan
    if source.parentPlanId:
        await owned_plan(str(source.parentPlanId), owner, session)
    plan = Plan(
        id=str(uuid4()),
        owner_id=owner,
        name=source.state.initial.name,
        parent_plan_id=str(source.parentPlanId) if source.parentPlanId else None,
        schema_version=source.schemaVersion,
        goal_basis=source.goalBasis,
        created_at=int(time.time()),
        state=source.state.model_dump(mode='json'),
    )
    record = PlanSave(
        id=str(uuid4()),
        owner_id=owner,
        request_id=str(payload.requestId),
        plan_id=plan.id,
        command=source.model_dump(mode='json'),
    )
    session.add_all([plan, record])
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        plan = await existing(payload, owner, session)
        if plan is None:
            raise
    return {**summary(plan), 'state': plan.state}
