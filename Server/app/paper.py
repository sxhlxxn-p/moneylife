"""Immutable guest paper-trading snapshots. Author: sxhlxxn."""
from copy import deepcopy
from pydantic import ValidationError
import time
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.ai_changes import effective, build_candidate, month_name, month_number
from app.ai_schemas import ChangeIntent
from app.models import PaperPlan, PaperRun
from app.plans import get_owner, owned_plan
from app.market import load_series, source, catalog_sources
from app.investment_engine import calculate_investment, calculate_order_preview
from app.paper_schemas import (PaperCreate, PaperOrderCreate, PaperAdvance, PaperCancel,
    PaperSummary, PaperDetail, PaperRunDetail, PaperBundle, MarketSource, MarketView,
    OrderPreviewCreate, OrderPreviewDetail, PaperConditionsCreate, PaperConditionsDetail)

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
    action = plan.command.get('kind')
    result = {'id': plan.id, 'parentPaperPlanId': plan.parent_id,
        'action': action if action in ('create', 'order', 'advance', 'cancel', 'conditions') else None,
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

async def ensure_order_allowed(plan: PaperPlan, side: str, quantity: int, session: AsyncSession):
    month = plan.state['month']
    if month >= plan.market_snapshot['lastMonth']:
        raise HTTPException(409, 'SERIES_PERIOD_EXCEEDED')
    if len(plan.orders) >= 1000:
        raise HTTPException(409, 'ORDER_LIMIT_EXCEEDED')
    run = await stored_run(plan, session)
    if side == 'sell':
        held = run.result['invested']['account']['quantity']
        reserved = sum(o['quantity'] for o in plan.orders if o['submittedMonth'] == month and o['side'] == 'sell')
        if quantity > held - reserved:
            raise HTTPException(409, 'INSUFFICIENT_SHARES')
    return run

@router.post('/paper-plans/{plan_id}/orders', response_model=PaperBundle, status_code=201)
async def order(plan_id: UUID, payload: PaperOrderCreate, response: Response,
                owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    command = {'kind': 'order', 'parentId': str(plan_id), **payload.model_dump(mode='json', exclude={'requestId'})}
    prior = await existing(owner, str(payload.requestId), command, session)
    if prior is not None:
        return prior
    parent = await owned_paper(str(plan_id), owner, session)
    await ensure_order_allowed(parent, payload.side, payload.quantity, session)
    month = parent.state['month']
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


@router.post('/paper-plans/{plan_id}/order-preview', response_model=OrderPreviewDetail)
async def preview_order(plan_id: UUID, payload: OrderPreviewCreate, response: Response,
                        owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_paper(str(plan_id), owner, session)
    run = await ensure_order_allowed(plan, payload.side, payload.quantity, session)
    position = run.result['invested']['monthlyResults'][-1]['investment']
    price = position['price']
    if price is not None:
        gross = price * payload.quantity
        fee = (gross * plan.market_snapshot['costs'].get('feeBps', 0) + 5000) // 10000
        if gross > 9_007_199_254_740_991 or (payload.side == 'buy' and gross + fee > 9_007_199_254_740_991):
            raise HTTPException(422, 'ORDER_VALUE_TOO_LARGE')
    investment = {key: plan.market_snapshot[key] for key in ('symbol', 'priceSeriesId', 'prices', 'costs')}
    investment['orders'] = plan.orders
    values = await calculate_order_preview(plan.state, investment,
        {'id': str(uuid4()), 'side': payload.side, 'quantity': payload.quantity})
    final = run.result['invested']['monthlyResults'][-1]
    if values.currentCash != final['cash'] or values.currentQuantity != position['quantity']:
        raise HTTPException(503, 'ENGINE_OUTPUT_INVALID')
    return {**values.model_dump(mode='json'), 'paperPlanId': plan.id,
        'symbol': plan.market_snapshot['symbol'], 'side': payload.side, 'quantity': payload.quantity,
        'month': plan.state['month'], 'executionMonth': plan.state['month'] + 1}


@router.post('/paper-plans/{plan_id}/orders/{order_id}/cancel', response_model=PaperBundle, status_code=201)
async def cancel_order(plan_id: UUID, order_id: UUID, payload: PaperCancel, response: Response,
                       owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    command = {'kind': 'cancel', 'parentId': str(plan_id), 'orderId': str(order_id)}
    prior = await existing(owner, str(payload.requestId), command, session)
    if prior is not None:
        return prior
    parent = await owned_paper(str(plan_id), owner, session)
    selected = next((o for o in parent.orders if o['id'] == str(order_id)), None)
    if selected is None:
        raise HTTPException(404, 'ORDER_NOT_FOUND')
    run = await stored_run(parent, session)
    pending_ids = {o['id'] for o in run.result['invested']['pendingOrders']}
    if selected['submittedMonth'] != parent.state['month'] or str(order_id) not in pending_ids:
        raise HTTPException(409, 'ORDER_ALREADY_PROCESSED')
    orders = [o for o in parent.orders if o['id'] != str(order_id)]
    return await save(owner, str(payload.requestId), command, parent.financial_plan_id,
                      parent.id, parent.state, orders, parent.market_snapshot, session)


@router.get('/paper-plans/{plan_id}/conditions', response_model=PaperConditionsDetail)
async def read_conditions(plan_id: UUID, response: Response,
                          owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_paper(str(plan_id), owner, session)
    can_edit = plan.state['month'] < plan.market_snapshot['lastMonth']
    applies_from = plan.state['month'] + 1 if can_edit else None
    return {'paperPlanId': plan.id, 'month': plan.state['month'], 'canEdit': can_edit,
        'appliesFrom': applies_from, 'appliesThrough': plan.market_snapshot['lastMonth'],
        'values': {field: effective(plan.state, field, applies_from if can_edit else plan.state['month'])
                   for field in ('income', 'expense', 'monthlySaving')}}


@router.post('/paper-plans/{plan_id}/conditions', response_model=PaperBundle, status_code=201)
async def change_conditions(plan_id: UUID, payload: PaperConditionsCreate, response: Response,
                            owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    values = payload.values.model_dump(exclude_unset=True)
    command = {'kind': 'conditions', 'parentId': str(plan_id), 'values': values}
    prior = await existing(owner, str(payload.requestId), command, session)
    if prior is not None:
        return prior
    parent = await owned_paper(str(plan_id), owner, session)
    begin, end = parent.state['month'] + 1, parent.market_snapshot['lastMonth']
    if begin > end:
        raise HTTPException(409, 'SERIES_PERIOD_EXCEEDED')
    changed = {field: value for field, value in values.items()
               if any(effective(parent.state, field, month) != value for month in range(begin, end + 1))}
    if not changed:
        raise HTTPException(409, 'CONDITIONS_UNCHANGED')
    start = month_number(parent.state['startMonth'])
    intents = [ChangeIntent(field=field, operation='set', amount=value,
                           startMonth=month_name(start + begin), endMonth=month_name(start + end))
               for field, value in changed.items()]
    try:
        state, _ = build_candidate(parent.state, intents)
    except (ValidationError, ValueError):
        raise HTTPException(422, 'CONDITIONS_INVALID') from None
    return await save(owner, str(payload.requestId), command, parent.financial_plan_id,
                      parent.id, state, parent.orders, parent.market_snapshot, session)
