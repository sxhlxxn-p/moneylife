"""Expire temporary data without deleting saved financial plans or results."""

import time
from sqlalchemy import delete
from app.models import GuestSession, AIClarification, AIProposal, RequestQuota


async def cleanup(session, *, apply=False, now=None):
    now = int(time.time()) if now is None else now
    predicates = [
        (GuestSession, GuestSession.expires_at <= now),
        (AIClarification, AIClarification.expires_at <= now),
        (AIProposal, (AIProposal.expires_at <= now) & AIProposal.applied_plan_id.is_(None)),
        (RequestQuota, RequestQuota.expires_at <= now),
    ]
    from sqlalchemy import select, func

    counts = {}
    for model, predicate in predicates:
        counts[model.__tablename__] = await session.scalar(
            select(func.count()).select_from(model).where(predicate)
        )
        if apply:
            await session.execute(delete(model).where(predicate))
    if apply:
        await session.commit()
    return counts
