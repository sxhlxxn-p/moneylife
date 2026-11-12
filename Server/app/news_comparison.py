"""Compare saved responses over common news rounds. Author: sxhlxxn."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import NewsGameRecord
from app.news_games import Strict, Amount, Signed, Round, detail
from app.plans import get_owner

router = APIRouter(tags=['news-games'])


class Selection(Strict):
    recordIds: Annotated[list[UUID], Field(min_length=2, max_length=3)]
    throughRound: Annotated[int, Field(strict=True, ge=1, le=4)] | None = None

    @field_validator('recordIds')
    @classmethod
    def distinct(cls, value):
        if len(set(value)) != len(value):
            raise ValueError('Select distinct records')
        return value


class Path(Strict):
    recordId: UUID
    savedRounds: int
    finalAssets: Signed
    cash: Amount
    stockValue: Amount
    stockChange: Signed
    incomeChange: Signed
    expenseChange: Signed
    shortfall: Amount
    assetsDifference: Signed
    history: list[Round]


class Comparison(Strict):
    basis: str
    paperPlanId: UUID
    paperRunId: UUID
    version: str
    throughRound: int
    initialAssets: Signed
    heldAssets: Signed
    paths: list[Path]


@router.post('/news-game-comparisons', response_model=Comparison)
async def compare(payload: Selection, response: Response, owner: str = Depends(get_owner),
                  session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    records = []
    # Check every owner before revealing compatibility or saved results.
    for record_id in payload.recordIds:
        record = await session.scalar(select(NewsGameRecord).where(
            NewsGameRecord.id == str(record_id), NewsGameRecord.owner_id == owner))
        if record is None:
            raise HTTPException(404, 'NEWS_GAME_NOT_FOUND')
        records.append(record)
    results = [detail(record)['result'] for record in records]
    first, seed = records[0], results[0].seed
    if any(record.paper_plan_id != first.paper_plan_id or record.paper_run_id != first.paper_run_id or
           result.seed != seed or result.version != results[0].version
           for record, result in zip(records, results)):
        raise HTTPException(409, 'NEWS_COMPARISON_INCOMPATIBLE')
    common = min(len(result.history) for result in results)
    through = common if payload.throughRound is None else payload.throughRound
    if through > common:
        raise HTTPException(409, 'NEWS_COMPARISON_FUTURE_ROUND')
    paths = []
    reference_total = results[0].history[through - 1].total
    for record, result in zip(records, results):
        rows = result.history[:through]
        final = rows[-1]
        paths.append({'recordId': record.id, 'savedRounds': len(result.history),
            'finalAssets': final.total, 'cash': final.state.cash,
            'stockValue': final.state.quantity * final.state.price,
            'stockChange': sum(row.stockChange for row in rows),
            'incomeChange': sum(row.incomeChange for row in rows),
            'expenseChange': sum(row.expenseChange for row in rows),
            'shortfall': final.state.unpaid - seed.unpaid,
            'assetsDifference': final.total - reference_total, 'history': rows})
    return {'basis': 'saved-news-common-rounds', 'paperPlanId': first.paper_plan_id,
        'paperRunId': first.paper_run_id, 'version': results[0].version, 'throughRound': through,
        'initialAssets': seed.cash + seed.saved + seed.quantity * seed.price - seed.unpaid,
        'heldAssets': results[0].heldHistory[through - 1].total, 'paths': paths}
