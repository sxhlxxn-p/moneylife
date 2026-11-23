"""Saved news-game contracts, validation and replay lookup shared by routes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from app.models import NewsGameRecord

Amount = Annotated[int, Field(strict=True, ge=0, le=9007199254740991)]
Signed = Annotated[int, Field(strict=True, ge=-9007199254740991, le=9007199254740991)]
Action = Literal["hold", "half", "sell"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


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
    eventId: Literal["rates", "energy", "recovery", "employment"]
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
    version: Literal["news-game-v1"]
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
    events = ["rates", "energy", "recovery", "employment"]
    for rows, actions, final in [
        (result.history, result.choices, result.finalAssets),
        (result.heldHistory, ["hold"] * len(result.choices), result.heldAssets),
    ]:
        if len(rows) != len(result.choices):
            raise ValueError("Invalid round count")
        previous = result.seed
        previous_total = (
            previous.cash + previous.saved + previous.quantity * previous.price - previous.unpaid
        )
        for i, row in enumerate(rows):
            state = row.state
            if (
                row.eventId != events[i]
                or row.action != actions[i]
                or state.saved != result.seed.saved
                or state.income != result.seed.income
                or state.expense != result.seed.expense
                or state.quantity != previous.quantity - row.sold
                or state.unpaid != previous.unpaid + row.shortfall
                or row.total
                != state.cash + state.saved + state.quantity * state.price - state.unpaid
                or row.difference != row.total - previous_total
            ):
                raise ValueError("Invalid round identity")
            sold = (
                previous.quantity
                if row.action == "sell"
                else previous.quantity // 2
                if row.action == "half"
                else 0
            )
            available = previous.cash + row.proceeds + row.income
            if (
                row.sold != sold
                or row.proceeds != row.sold * previous.price
                or state.cash != max(0, available - row.expense)
                or row.shortfall != max(0, row.expense - available)
                or row.stockChange != state.quantity * (state.price - previous.price)
                or row.incomeChange != row.income - result.seed.income
                or row.expenseChange != row.expense - result.seed.expense
                or row.difference != row.stockChange + row.income - row.expense
            ):
                raise ValueError("Invalid round attribution")
            previous, previous_total = state, row.total
        if rows[-1].total != final:
            raise ValueError("Invalid final assets")


def detail(record):
    try:
        result = Result.model_validate(record.result)
        validate(result)
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(503, "NEWS_RESULT_INVALID") from None
    return {
        "id": record.id,
        "paperPlanId": record.paper_plan_id,
        "paperRunId": record.paper_run_id,
        "name": record.name,
        "sourceMonth": record.source_month,
        "createdAt": record.created_at,
        "result": result,
    }


async def prior(owner, request_id, plan_id, choices, session):
    record = await session.scalar(
        select(NewsGameRecord).where(
            NewsGameRecord.owner_id == owner, NewsGameRecord.request_id == request_id
        )
    )
    if record is None:
        return None
    if record.paper_plan_id != plan_id or record.result.get("choices") != choices:
        raise HTTPException(409, "REQUEST_ID_CONFLICT")
    return detail(record)
