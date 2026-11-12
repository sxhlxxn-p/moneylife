"""Immutable news-game records from owned portfolio runs. Author: sxhlxxn."""
import time
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_changes import effective
from app.database import get_session
from app.engine import run_engine
from app.investment_engine import validate_result
from app.models import NewsGameRecord
from app.paper import owned_paper, stored_run
from app.paper_schemas import PaperEngineComparison
from app.plans import get_owner

router = APIRouter(tags=['news-games'])
Amount = Annotated[int, Field(strict=True, ge=0, le=9007199254740991)]
Signed = Annotated[int, Field(strict=True, ge=-9007199254740991, le=9007199254740991)]
Action = Literal['hold', 'half', 'sell']


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Create(Strict):
    requestId: UUID
    choices: Annotated[list[Action], Field(min_length=1, max_length=4)]


class State(Strict):
    cash: Amount
    saved: Amount
    quantity: Amount
    price: Annotated[int, Field(strict=True, ge=1, le=9007199254740991)]
    income: Amount
    expense: Amount
    unpaid: Amount


class Round(Strict):
    state: State
    eventId: Literal['rates', 'energy', 'recovery', 'employment']
    action: Action
    sold: Amount
    proceeds: Amount
    income: Amount
    expense: Amount
    shortfall: Amount
    stockChange: Signed
    incomeChange: Signed
    expenseChange: Signed
    total: Signed
    difference: Signed


class Result(Strict):
    version: Literal['news-game-v1']
    seed: State
    choices: Annotated[list[Action], Field(min_length=1, max_length=4)]
    history: Annotated[list[Round], Field(min_length=1, max_length=4)]
    heldHistory: Annotated[list[Round], Field(min_length=1, max_length=4)]
    finalAssets: Signed
    heldAssets: Signed


class Detail(Strict):
    id: UUID
    paperPlanId: UUID
    paperRunId: UUID
    name: str
    sourceMonth: int
    createdAt: int
    result: Result


def validate(result: Result):
    events = ['rates', 'energy', 'recovery', 'employment']
    for rows, actions, final in [(result.history, result.choices, result.finalAssets),
                                 (result.heldHistory, ['hold'] * len(result.choices), result.heldAssets)]:
        if len(rows) != len(result.choices):
            raise ValueError('Invalid round count')
        previous = result.seed
        previous_total = previous.cash + previous.saved + previous.quantity * previous.price - previous.unpaid
        for i, row in enumerate(rows):
            state = row.state
            if (row.eventId != events[i] or row.action != actions[i] or
                state.saved != result.seed.saved or state.income != result.seed.income or
                state.expense != result.seed.expense or state.quantity != previous.quantity - row.sold or
                state.unpaid != previous.unpaid + row.shortfall or
                row.total != state.cash + state.saved + state.quantity * state.price - state.unpaid or
                row.difference != row.total - previous_total):
                raise ValueError('Invalid round identity')
            previous, previous_total = state, row.total
        if rows[-1].total != final:
            raise ValueError('Invalid final assets')


def detail(record):
    try:
        result = Result.model_validate(record.result)
        validate(result)
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(503, 'NEWS_RESULT_INVALID') from None
    return {'id': record.id, 'paperPlanId': record.paper_plan_id, 'paperRunId': record.paper_run_id,
        'name': record.name, 'sourceMonth': record.source_month, 'createdAt': record.created_at, 'result': result}


async def prior(owner, request_id, plan_id, choices, session):
    record = await session.scalar(select(NewsGameRecord).where(
        NewsGameRecord.owner_id == owner, NewsGameRecord.request_id == request_id))
    if record is None:
        return None
    if record.paper_plan_id != plan_id or record.result.get('choices') != choices:
        raise HTTPException(409, 'REQUEST_ID_CONFLICT')
    return detail(record)


@router.post('/paper-plans/{plan_id}/news-games', response_model=Detail, status_code=201)
async def create(plan_id: UUID, payload: Create, response: Response,
                 owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_paper(str(plan_id), owner, session)
    existing = await prior(owner, str(payload.requestId), plan.id, payload.choices, session)
    if existing is not None:
        return existing
    run = await stored_run(plan, session)
    try:
        result = PaperEngineComparison.model_validate(run.result)
        if run.input_snapshot != {'state': plan.state, 'orders': plan.orders, 'market': plan.market_snapshot}:
            raise ValueError('Run input mismatch')
        if run.engine_version != result.invested.engineVersion:
            raise ValueError('Version mismatch')
        investment = {k: plan.market_snapshot[k] for k in ('symbol', 'priceSeriesId', 'prices', 'costs')}
        investment['orders'] = plan.orders
        validate_result(result, plan.state, investment, plan.state['month'])
        row = result.invested.monthlyResults[-1]
        if row.investment.price is None:
            raise ValueError('No observed price')
        next_month = min(plan.state['month'] + 1, plan.market_snapshot['lastMonth'])
        seed = State(cash=row.cash, saved=row.saved, quantity=row.investment.quantity,
            price=row.investment.price, unpaid=row.unpaid,
            income=effective(plan.state, 'income', next_month), expense=effective(plan.state, 'expense', next_month))
    except (ValidationError, ValueError, KeyError, TypeError):
        raise HTTPException(503, 'NEWS_SOURCE_INVALID') from None
    output = await run_engine({'mode': 'news-game', 'state': seed.model_dump(), 'choices': payload.choices}, max_output=100_000)
    try:
        result = Result.model_validate_json(output)
        validate(result)
        if result.seed != seed or result.choices != payload.choices:
            raise ValueError('Result input mismatch')
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(503, 'ENGINE_OUTPUT_INVALID') from None
    record = NewsGameRecord(id=str(uuid4()), owner_id=owner, request_id=str(payload.requestId),
        paper_plan_id=plan.id, paper_run_id=run.id, name=plan.state['initial']['name'],
        source_month=plan.state['month'], created_at=time.time_ns() // 1000, result=result.model_dump())
    session.add(record)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await prior(owner, str(payload.requestId), plan.id, payload.choices, session)
        if existing is not None:
            return existing
        raise
    return detail(record)


@router.get('/paper-plans/{plan_id}/news-games', response_model=list[Detail])
async def listing(plan_id: UUID, response: Response, limit: int = Query(20, ge=1, le=100),
                  offset: int = Query(0, ge=0), owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_paper(str(plan_id), owner, session)
    records = await session.scalars(select(NewsGameRecord).where(NewsGameRecord.owner_id == owner,
        NewsGameRecord.paper_plan_id == plan.id).order_by(NewsGameRecord.created_at.desc(), NewsGameRecord.id.desc()).limit(limit).offset(offset))
    return [detail(record) for record in records]


@router.get('/news-games/{record_id}', response_model=Detail)
async def read(record_id: UUID, response: Response, owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    record = await session.scalar(select(NewsGameRecord).where(NewsGameRecord.id == str(record_id), NewsGameRecord.owner_id == owner))
    if record is None:
        raise HTTPException(404, 'NEWS_GAME_NOT_FOUND')
    return detail(record)
