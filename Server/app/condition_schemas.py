"""Financial condition changes shared by manual and natural-language inputs."""

from typing import Literal
from pydantic import Field
from app.schemas import StrictModel, Money


class ChangeIntent(StrictModel):
    field: Literal["income", "expense", "monthlySaving"]
    operation: Literal["set", "add", "subtract"]
    amount: Money
    startMonth: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    endMonth: str | None
