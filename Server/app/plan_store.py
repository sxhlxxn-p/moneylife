"""Owned financial-plan queries and response projection."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Plan


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
