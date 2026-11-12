"""Validate persisted game inputs in KRW. Author: sxhlxxn."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


Money = Annotated[int, Field(strict=True, ge=0, le=10_000_000_000)]
Month = Annotated[int, Field(strict=True, ge=0, le=120)]
EffectMonth = Annotated[int, Field(strict=True, ge=1, le=120)]
Rate = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InitialState(StrictModel):
    name: str = Field(min_length=1, max_length=40)
    age: int = Field(strict=True, ge=18, le=80)
    avatar: str = Field(min_length=1, max_length=16)
    cash: Money
    saved: Money
    income: Money
    expense: Money
    target: Annotated[int, Field(strict=True, ge=1, le=10_000_000_000)]


class Change(StrictModel):
    type: Literal["expense", "income", "saving", "once"]
    v: int = Field(strict=True, ge=-10_000_000_000, le=10_000_000_000)
    m: EffectMonth
    end: EffectMonth | None = None

    @model_validator(mode="after")
    def validate_effect(self):
        if self.end is not None and self.end < self.m:
            raise ValueError("종료 월은 시작 월보다 빠를 수 없습니다.")
        if self.type in ("saving", "once") and self.v < 0:
            raise ValueError("저축 설정과 일회성 지출은 음수일 수 없습니다.")
        return self


class RateChange(StrictModel):
    m: EffectMonth
    v: Rate


class LogEntry(StrictModel):
    month: Month
    text: str = Field(max_length=500)


class GameState(StrictModel):
    startMonth: Literal["2026-10"] = "2026-10"
    months: Literal[120] = 120
    initial: InitialState
    monthlySaving: Money
    annualRate: Rate
    month: Month
    changes: list[Change] = Field(default_factory=list, max_length=200)
    rateChanges: list[RateChange] = Field(default_factory=list, max_length=200)
    logs: list[LogEntry] = Field(default_factory=list, max_length=80)
    events: list[Literal[12, 30, 48, 72, 96]] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def validate_progress(self):
        if len(set(self.events)) != len(self.events) or any(m > self.month for m in self.events):
            raise ValueError("이벤트 선택 기록이 진행 월과 맞지 않습니다.")
        if any(entry.month > self.month for entry in self.logs):
            raise ValueError("기록 시점은 진행 월 이후일 수 없습니다.")
        for month in range(1, 121):
            income, expense = self.initial.income, self.initial.expense
            for change in self.changes:
                if month >= change.m and (change.end is None or month <= change.end):
                    if change.type == "income":
                        income += change.v
                    elif change.type == "expense":
                        expense += change.v
            if income < 0 or expense < 0:
                raise ValueError("적용 후 소득과 생활비는 음수일 수 없습니다.")
        return self


class PlanCreate(StrictModel):
    schemaVersion: Literal[1] = 1
    goalBasis: Literal["net_assets"] = "net_assets"
    parentPlanId: UUID | None = None
    state: GameState


class PlanSummary(StrictModel):
    id: UUID
    name: str
    parentPlanId: UUID | None
    schemaVersion: int
    goalBasis: str
    createdAt: int
    month: int


class PlanDetail(PlanSummary):
    state: GameState


class SimulationCreate(StrictModel):
    planId: UUID
    requestId: UUID
    months: Annotated[int, Field(strict=True, ge=1, le=120)] = 120


CalculatedMoney = Annotated[int, Field(strict=True, ge=0, le=9_007_199_254_740_991)]
NetAssets = Annotated[int, Field(strict=True, ge=-9_007_199_254_740_991, le=9_007_199_254_740_991)]


class MonthlyResult(StrictModel):
    month: Month
    cash: CalculatedMoney
    saved: CalculatedMoney
    unpaid: CalculatedMoney
    total: NetAssets
    income: CalculatedMoney
    expense: CalculatedMoney
    short: CalculatedMoney


class RunMetrics(StrictModel):
    goalMonth: Month | None
    finalNetAssets: NetAssets
    finalCash: CalculatedMoney
    finalSaved: CalculatedMoney
    firstShortageMonth: Month | None
    shortageMonths: Annotated[int, Field(strict=True, ge=0, le=120)]
    unmetTotal: CalculatedMoney


class EngineResult(StrictModel):
    engineVersion: Literal["cash-savings-krw-v1"]
    monthlyResults: list[MonthlyResult] = Field(min_length=2, max_length=121)
    summary: RunMetrics


class RunSummary(StrictModel):
    id: UUID
    planId: UUID
    requestId: UUID
    planVersion: Literal[1]
    engineVersion: str
    months: int
    createdAt: int
    summary: RunMetrics


class RunDetail(RunSummary):
    inputSnapshot: dict
    monthlyResults: list[MonthlyResult]
