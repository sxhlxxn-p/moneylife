"""Paper trading API contracts. Author: sxhlxxn / 202439688."""
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from pydantic import Field, field_validator, model_validator
from app.schemas import (StrictModel, GameState, CalculatedMoney, NetAssets,
                         Month, MonthlyResult, RunMetrics, EngineResult, Money)

Quantity = Annotated[int, Field(strict=True, ge=1, le=1_000_000_000)]

class PaperCreate(StrictModel):
    requestId: UUID
    planId: UUID
    priceSeriesId: str = Field(min_length=1, max_length=64)

class PaperOrderCreate(StrictModel):
    requestId: UUID
    side: Literal['buy', 'sell']
    quantity: Quantity

class PaperAdvance(StrictModel):
    requestId: UUID
    months: Annotated[int, Field(strict=True, ge=1, le=12)] = 1

class MarketSource(StrictModel):
    priceSeriesId: str
    symbol: str
    label: str
    dataKind: Literal['synthetic-test-only', 'historical-market']
    priceDataHash: str
    lastMonth: Month
    provider: str | None = None
    sourceUrl: str | None = None
    collectedAt: datetime | None = None
    historicalStartMonth: str | None = None
    historicalEndMonth: str | None = None
    adjustment: Literal['unadjusted'] | None = None
    sampling: Literal['last-observed-daily-close'] | None = None
    corporateActions: Literal['not-modeled'] | None = None

class Price(StrictModel):
    month: Month
    price: Annotated[int, Field(strict=True, ge=1, le=9_007_199_254_740_991)] | None
    tradable: bool
    observedOn: date | None = None

class MarketView(StrictModel):
    source: MarketSource
    throughMonth: Month
    prices: list[Price]

class OrderIntent(StrictModel):
    id: str
    symbol: str
    side: Literal['buy', 'sell']
    quantity: CalculatedMoney

class OrderRecord(OrderIntent):
    submittedMonth: Month

class FilledTrade(StrictModel):
    order: OrderIntent
    status: Literal['filled']
    price: CalculatedMoney
    gross: CalculatedMoney
    fee: CalculatedMoney
    tax: CalculatedMoney
    feeBps: Annotated[int, Field(strict=True, ge=0, le=10000)]
    sellTaxBps: Annotated[int, Field(strict=True, ge=0, le=10000)]
    cashDelta: NetAssets
    removedCost: CalculatedMoney
    realizedPnl: NetAssets
    cashAfter: CalculatedMoney
    quantityAfter: CalculatedMoney
    costBasisAfter: CalculatedMoney

class RejectedTrade(StrictModel):
    order: OrderIntent
    status: Literal['rejected']
    reason: Literal['SYMBOL_MISMATCH', 'PRICE_UNAVAILABLE', 'NOT_TRADABLE',
                    'INSUFFICIENT_CASH', 'INSUFFICIENT_SHARES', 'COST_EXCEEDS_PROCEEDS']

class FilledExecution(FilledTrade):
    submittedMonth: Month
    executionMonth: Month

class RejectedExecution(RejectedTrade):
    submittedMonth: Month
    executionMonth: Month

Trade = Annotated[FilledTrade | RejectedTrade, Field(discriminator='status')]
Execution = Annotated[FilledExecution | RejectedExecution, Field(discriminator='status')]

class Position(StrictModel):
    quantity: CalculatedMoney
    costBasis: CalculatedMoney
    averageCost: str | None
    marketValue: CalculatedMoney
    realizedPnl: NetAssets
    unrealizedPnl: NetAssets
    feesPaid: CalculatedMoney
    taxesPaid: CalculatedMoney
    price: CalculatedMoney | None
    priceMonth: Month | None
    stale: bool

class InvestmentMonth(MonthlyResult):
    investment: Position

class InvestmentMetrics(RunMetrics):
    finalInvestmentValue: CalculatedMoney
    finalRealizedPnl: NetAssets
    finalUnrealizedPnl: NetAssets

class InvestmentAccount(StrictModel):
    symbol: str
    initialCash: CalculatedMoney
    cash: CalculatedMoney
    quantity: CalculatedMoney
    costBasis: CalculatedMoney
    realizedPnl: NetAssets
    netCashFlow: NetAssets
    feesPaid: CalculatedMoney
    taxesPaid: CalculatedMoney
    executions: list[Trade] = Field(max_length=1000)

class InvestmentEngineResult(StrictModel):
    engineVersion: Literal['monthly-investment-krw-v2']
    priceSeriesId: str
    monthlyResults: list[InvestmentMonth] = Field(min_length=1, max_length=121)
    summary: InvestmentMetrics
    executions: list[Execution] = Field(max_length=1000)
    pendingOrders: list[OrderRecord] = Field(max_length=1000)
    account: InvestmentAccount

class BaselineResult(EngineResult):
    monthlyResults: list[MonthlyResult] = Field(min_length=1, max_length=121)

class Comparison(StrictModel):
    finalAssetsDifference: NetAssets
    goalMonthDifference: Annotated[int, Field(strict=True, ge=-120, le=120)] | None
    shortageMonthsDifference: Annotated[int, Field(strict=True, ge=-120, le=120)]

class PaperEngineComparison(StrictModel):
    baseline: BaselineResult
    invested: InvestmentEngineResult
    comparison: Comparison

class PaperCancel(StrictModel):
    requestId: UUID

class PaperSummary(StrictModel):
    action: Literal['create', 'order', 'advance', 'cancel', 'conditions'] | None = None
    id: UUID
    parentPaperPlanId: UUID | None
    financialPlanId: UUID
    name: str
    month: Month
    source: MarketSource
    runId: UUID
    createdAt: int

class PaperDetail(PaperSummary):
    state: GameState
    orders: list[OrderRecord]

class PaperRunDetail(StrictModel):
    id: UUID
    paperPlanId: UUID
    engineVersion: str
    createdAt: int
    source: MarketSource
    result: PaperEngineComparison

class PaperBundle(StrictModel):
    plan: PaperDetail
    run: PaperRunDetail

class OrderPreviewCreate(StrictModel):
    side: Literal['buy', 'sell']
    quantity: Quantity

class OrderPreviewValues(StrictModel):
    basis: Literal['current-price-assumption']
    referencePrice: CalculatedMoney | None
    referencePriceMonth: Month | None
    staleReference: bool
    referenceGross: CalculatedMoney | None
    referenceFee: CalculatedMoney | None
    referenceTax: CalculatedMoney | None
    referenceCashChange: NetAssets | None
    currentCash: CalculatedMoney
    currentQuantity: CalculatedMoney
    reservedSellQuantity: CalculatedMoney
    availableSellQuantity: CalculatedMoney
    existingPendingCount: Annotated[int, Field(strict=True, ge=0, le=1000)]
    nextIncome: CalculatedMoney
    nextExpense: CalculatedMoney
    estimatedNextCash: CalculatedMoney | None
    estimatedNextSaved: CalculatedMoney | None
    estimatedNextShortfall: CalculatedMoney
    estimatedStatus: Literal['filled', 'rejected', 'unavailable']
    estimatedReason: str | None

class OrderPreviewDetail(OrderPreviewValues):
    paperPlanId: UUID
    symbol: str
    side: Literal['buy', 'sell']
    quantity: Quantity
    month: Month
    executionMonth: Month

class PaperExplainCreate(StrictModel):
    useAI: Literal[True]

    @field_validator('useAI', mode='before')
    @classmethod
    def explicit_ai_request(cls, value):
        if value is not True:
            raise ValueError('Explicit AI request required')
        return value

class ExplanationSection(StrictModel):
    id: Literal['comparison', 'portfolio', 'pnl', 'goal', 'liquidity', 'orders', 'assumptions', 'valuation']
    title: str
    text: str

class PaperExplainDetail(StrictModel):
    runId: UUID
    paperPlanId: UUID
    throughMonth: Month
    sections: list[ExplanationSection] = Field(min_length=4, max_length=7)
    source: Literal['template', 'llm-ranked']
    attempts: Annotated[int, Field(strict=True, ge=0, le=2)]
    fallbackReason: str | None
    cached: bool
    promptVersion: str
    verifiedFacts: Literal[True]


class PaperConditionValues(StrictModel):
    income: Money | None = None
    expense: Money | None = None
    monthlySaving: Money | None = None

    @model_validator(mode='after')
    def selected_values(self):
        if not self.model_fields_set or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError('At least one non-null condition is required')
        return self

class PaperConditionsCreate(StrictModel):
    requestId: UUID
    values: PaperConditionValues

class EffectivePaperConditions(StrictModel):
    income: CalculatedMoney
    expense: CalculatedMoney
    monthlySaving: CalculatedMoney

class PaperConditionsDetail(StrictModel):
    paperPlanId: UUID
    month: Month
    canEdit: bool
    appliesFrom: Month | None
    appliesThrough: Month
    values: EffectivePaperConditions
