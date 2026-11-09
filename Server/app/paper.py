"""Immutable guest paper-trading snapshots. Author: sxhlxxn / 202439688."""
from copy import deepcopy
import time
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models import PaperPlan, PaperRun
from app.plans import get_owner, owned_plan
from app.market import load_series, source, catalog_sources
from app.investment_engine import calculate_investment
from app.paper_schemas import (PaperCreate, PaperOrderCreate, PaperAdvance,
    PaperSummary, PaperDetail, PaperRunDetail, PaperBundle, MarketSource, MarketView)

router = APIRouter(tags=['paper-trading'])

async def owned_paper(plan_id: str, owner: str, session: AsyncSession) -> PaperPlan:
    plan = await session.scalar(select(PaperPlan).where(PaperPlan.id == plan_id, PaperPlan.owner_id == owner))
    if plan is None:
        raise HTTPException(404, 'PAPER_PLAN_NOT_FOUND')
    return plan

async def stored_run(plan: PaperPlan, session: AsyncSession) -> PaperRun:
    run = await session.scalar(select(PaperRun).where(PaperRun.paper_plan_id == plan.id, PaperRun.owner_id == plan.owner_id))
    if run is None:
        raise HTTPException(503, 'PAPER_RUN_UNAVAILABLE')
    return run

def detail(plan: PaperPlan, run: PaperRun, *, include_state=True) -> dict:
    result = {'id': plan.id, 'parentPaperPlanId': plan.parent_id,
        'financialPlanId': plan.financial_plan_id, 'name': plan.state['initial']['name'],
        'month': plan.state['month'], 'source': source(plan.market_snapshot),
        'runId': run.id, 'createdAt': plan.created_at}
    if include_state:
        result.update(state=plan.state, orders=plan.orders)
    return result

def run_detail(run: PaperRun) -> dict:
    return {'id': run.id, 'paperPlanId': run.paper_plan_id,
        'engineVersion': run.engine_version, 'createdAt': run.created_at,
        'source': source(run.input_snapshot['market']), 'result': run.result}

def bundle(plan: PaperPlan, run: PaperRun) -> dict:
    return {'plan': detail(plan, run), 'run': run_detail(run)}

async def existing(owner: str, request_id: str, command: dict, session: AsyncSession):
    plan = await session.scalar(select(PaperPlan).where(PaperPlan.owner_id == owner, PaperPlan.request_id == request_id))
    if plan is None:
        return None
    if plan.command != command:
        raise HTTPException(409, 'REQUEST_ID_CONFLICT')
    return bundle(plan, await stored_run(plan, session))

async def save(owner: str, request_id: str, command: dict, financial_plan_id: str,
               parent_id: str | None, state: dict, orders: list, market: dict,
               session: AsyncSession):
    investment = {key: market[key] for key in ('symbol', 'priceSeriesId', 'prices', 'costs')}
    investment['orders'] = orders
    calculated = await calculate_investment(state, investment, state['month'])
    now = time.time_ns() // 1000
    plan = PaperPlan(id=str(uuid4()), owner_id=owner, request_id=request_id,
        command=command, financial_plan_id=financial_plan_id, parent_id=parent_id,
        state=deepcopy(state), orders=deepcopy(orders), market_snapshot=deepcopy(market), created_at=now)
    run = PaperRun(id=str(uuid4()), owner_id=owner, paper_plan_id=plan.id,
        engine_version=calculated.invested.engineVersion, created_at=now,
        input_snapshot={'state': deepcopy(state), 'orders': deepcopy(orders), 'market': deepcopy(market)},
        result=calculated.model_dump(mode='json'))
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

@router.get('/market/series', response_model=list[MarketSource])
async def market_series(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return catalog_sources()

@router.post('/paper-plans', response_model=PaperBundle, status_code=201)
async def create(payload: PaperCreate, response: Response,
                 owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    command = {'kind': 'create', **payload.model_dump(mode='json', exclude={'requestId'})}
    prior = await existing(owner, str(payload.requestId), command, session)
    if prior is not None:
        return prior
    base = await owned_plan(str(payload.planId), owner, session)
    market = load_series(payload.priceSeriesId)
    if base.state['month'] > market['lastMonth']:
        raise HTTPException(409, 'SERIES_PERIOD_EXCEEDED')
    return await save(owner, str(payload.requestId), command, base.id, None, base.state, [], market, session)

@router.get('/paper-plans', response_model=list[PaperSummary])
async def listing(response: Response, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                  owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plans = await session.scalars(select(PaperPlan).where(PaperPlan.owner_id == owner)
        .order_by(PaperPlan.created_at.desc(), PaperPlan.id.desc()).limit(limit).offset(offset))
    return [detail(plan, await stored_run(plan, session), include_state=False) for plan in plans]

@router.get('/paper-plans/{plan_id}', response_model=PaperDetail)
async def get_plan(plan_id: UUID, response: Response, owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_paper(str(plan_id), owner, session)
    return detail(plan, await stored_run(plan, session))

@router.get('/paper-plans/{plan_id}/market', response_model=MarketView)
async def get_market(plan_id: UUID, request: Request, response: Response,
                     owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_paper(str(plan_id), owner, session)
    if request.query_params:
        raise HTTPException(422, 'MARKET_QUERY_NOT_ALLOWED')
    month = plan.state['month']
    return {'source': source(plan.market_snapshot), 'throughMonth': month,
            'prices': [q for q in plan.market_snapshot['prices'] if q['month'] <= month]}

@router.post('/paper-plans/{plan_id}/orders', response_model=PaperBundle, status_code=201)
async def order(plan_id: UUID, payload: PaperOrderCreate, response: Response,
                owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    command = {'kind': 'order', 'parentId': str(plan_id), **payload.model_dump(mode='json', exclude={'requestId'})}
    prior = await existing(owner, str(payload.requestId), command, session)
    if prior is not None:
        return prior
    parent = await owned_paper(str(plan_id), owner, session)
    month = parent.state['month']
    if month >= parent.market_snapshot['lastMonth']:
        raise HTTPException(409, 'SERIES_PERIOD_EXCEEDED')
    if len(parent.orders) >= 1000:
        raise HTTPException(409, 'ORDER_LIMIT_EXCEEDED')
    if payload.side == 'sell':
        run = await stored_run(parent, session)
        held = run.result['invested']['account']['quantity']
        reserved = sum(o['quantity'] for o in parent.orders if o['submittedMonth'] == month and o['side'] == 'sell')
        if payload.quantity > held - reserved:
            raise HTTPException(409, 'INSUFFICIENT_SHARES')
    orders = [*parent.orders, {'id': str(payload.requestId), 'symbol': parent.market_snapshot['symbol'],
        'side': payload.side, 'quantity': payload.quantity, 'submittedMonth': month}]
    return await save(owner, str(payload.requestId), command, parent.financial_plan_id,
                      parent.id, parent.state, orders, parent.market_snapshot, session)

@router.post('/paper-plans/{plan_id}/advance', response_model=PaperBundle, status_code=201)
async def advance(plan_id: UUID, payload: PaperAdvance, response: Response,
                  owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    command = {'kind': 'advance', 'parentId': str(plan_id), **payload.model_dump(mode='json', exclude={'requestId'})}
    prior = await existing(owner, str(payload.requestId), command, session)
    if prior is not None:
        return prior
    parent = await owned_paper(str(plan_id), owner, session)
    state = deepcopy(parent.state)
    state['month'] += payload.months
    if state['month'] > parent.market_snapshot['lastMonth']:
        raise HTTPException(409, 'SERIES_PERIOD_EXCEEDED')
    return await save(owner, str(payload.requestId), command, parent.financial_plan_id,
                      parent.id, state, parent.orders, parent.market_snapshot, session)

@router.get('/paper-runs/{run_id}', response_model=PaperRunDetail)
async def get_run(run_id: UUID, response: Response, owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    run = await session.scalar(select(PaperRun).where(PaperRun.id == str(run_id), PaperRun.owner_id == owner))
    if run is None:
        raise HTTPException(404, 'PAPER_RUN_NOT_FOUND')
    return run_detail(run)
