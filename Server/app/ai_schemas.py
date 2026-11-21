"""AI extraction and approval contracts."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas import StrictModel, Money, CalculatedMoney, PlanDetail, RunDetail
from app.condition_schemas import ChangeIntent


class Extraction(StrictModel):
    status: Literal["ready", "needs_clarification", "unsupported"]
    changes: list[ChangeIntent] = Field(max_length=10)
    question: str | None = Field(max_length=1000)


class ParseChange(StrictModel):
    planId: UUID
    message: str = Field(min_length=1, max_length=2000)
    clarificationId: UUID | None = None


class ApplyChange(StrictModel):
    confirmed: Literal[True]

    @field_validator("confirmed", mode="before")
    @classmethod
    def explicit_confirmation(cls, value):
        if value is not True:
            raise ValueError("명시적인 확인이 필요합니다.")
        return value


class ExplainRequest(StrictModel):
    runId: UUID


class ExplainResult(StrictModel):
    text: str
    source: Literal["template", "llm"]
    attempts: int
    fallbackReason: str | None
    verifiedNumbers: Literal[True]


class Comparison(StrictModel):
    baseGoalMonth: int | None
    candidateGoalMonth: int | None
    finalAssetsDifference: int
    shortageMonthsDifference: int


class ApplyResult(StrictModel):
    plan: PlanDetail
    run: RunDetail
    comparison: Comparison
    explanation: str
    explanationSource: Literal["template"]
    toolsExecuted: list[str]


class ChangePreviewSegment(StrictModel):
    startMonth: str
    endMonth: str
    before: CalculatedMoney
    after: CalculatedMoney


class ChangePreview(StrictModel):
    field: Literal["income", "expense", "monthlySaving"]
    label: str
    operation: Literal["set", "add", "subtract"]
    amount: Money
    startMonth: str
    endMonth: str
    segments: list[ChangePreviewSegment] = Field(max_length=120)


class ProposalResponse(StrictModel):
    status: Literal["ready", "needs_clarification", "unsupported", "invalid_change"]
    proposalId: UUID | None = None
    clarificationId: UUID | None = None
    basePlanId: UUID
    message: str
    changes: list[ChangeIntent] = Field(default_factory=list)
    question: str | None = None
    preview: list[str] = Field(default_factory=list)
    previewDetails: list[ChangePreview] = Field(default_factory=list, max_length=10)
    expiresAt: int | None = None
    model: str | None = None
    promptVersion: str
