"""Owned, optionally ranked result explanations. Author: sxhlxxn / 202439688."""
import asyncio
import os
import time
from uuid import UUID
from weakref import WeakValueDictionary

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import PaperRun, PaperExplanation
from app.plans import get_owner
from app.paper_schemas import PaperExplainCreate, PaperExplainDetail
from app import paper_explanation as explanation

router = APIRouter(tags=['paper-explanation'])
locks = WeakValueDictionary()

async def owned_run(run_id, owner, session):
    run = await session.scalar(select(PaperRun).where(PaperRun.id == str(run_id), PaperRun.owner_id == owner))
    if run is None:
        raise HTTPException(404, 'PAPER_RUN_NOT_FOUND')
    return run

@router.get('/paper-runs/{run_id}/explanation', response_model=PaperExplainDetail)
async def basic_explanation(run_id: UUID, response: Response,
                            owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    run = await owned_run(run_id, owner, session)
    facts, _, default = explanation.facts_for(run)
    return explanation.output(run, facts, default)

@router.post('/paper-runs/{run_id}/explanation', response_model=PaperExplainDetail)
async def ranked_explanation(run_id: UUID, payload: PaperExplainCreate, response: Response,
                             owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    run = await owned_run(run_id, owner, session)
    facts, required, default = explanation.facts_for(run)
    model = os.getenv('LLM_MODEL', '').strip()
    key = (run.id, explanation.PROMPT_VERSION, model)
    lock = locks.setdefault(key, asyncio.Lock())
    async with lock:
        def cached_result(cached):
            if cached.owner_id != owner:
                raise HTTPException(404, 'PAPER_RUN_NOT_FOUND')
            try:
                selected = explanation.select_verified(cached.selected_ids, facts, required)
            except ValueError:
                return explanation.output(run, facts, default, fallback_reason='EXPLANATION_CACHE_INVALID')
            return explanation.output(run, facts, selected, source='llm-ranked',
                                      attempts=cached.attempts, cached=True)
        cached = await session.get(PaperExplanation, key)
        if cached is not None:
            return cached_result(cached)
        selected, attempts, reason = await explanation.rank_facts(facts, required, default)
        if reason is not None:
            return explanation.output(run, facts, default, attempts=attempts, fallback_reason=reason)
        # Store only IDs validated against this immutable Run; never store model-written prose.
        row = PaperExplanation(run_id=run.id, owner_id=owner, prompt_version=key[1], model=model,
            selected_ids=selected, attempts=attempts, created_at=time.time_ns() // 1000)
        session.add(row)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            cached = await session.get(PaperExplanation, key)
            if cached is None:
                raise
            return cached_result(cached)
        return explanation.output(run, facts, selected, source='llm-ranked', attempts=attempts)
