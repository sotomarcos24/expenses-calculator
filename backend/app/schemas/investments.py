from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)
from pydantic.json_schema import SkipJsonSchema

from app.models import InvestmentType
from app.schemas.money import MoneyOut, RateOut

NAME_MAX_LENGTH = 100
PLATFORM_MAX_LENGTH = 100
# Fields a partial update may omit but never set to null.
NOT_NULLABLE = ("name", "type", "amount_invested", "current_value", "value_updated_at")


def normalize_platform(value: str | None) -> str | None:
    """Trim the platform at both ends; empty or whitespace-only becomes ``None``.

    Raises ``ValueError`` (422) above 100 characters after trimming.
    """
    if value is None:
        return None
    platform = value.strip()
    if not platform:
        return None
    if len(platform) > PLATFORM_MAX_LENGTH:
        raise ValueError(f"The platform must be at most {PLATFORM_MAX_LENGTH} characters")
    return platform


# Stripped at both ends, then 1-100 characters. Inner whitespace is kept as typed.
InvestmentName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH)
]

Platform = Annotated[str | None, AfterValidator(normalize_platform)]

# Request money: a non-negative decimal (0 is valid) with at most 2 decimal places that fits
# NUMERIC(14, 2). Pydantic rejects NaN / Infinity and non-numeric strings for Decimal fields.
InvestmentMoneyIn = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


def reject_null(value: object, info: ValidationInfo) -> object:
    """Field validator body: an explicit ``null`` is 422.

    Field validators only run for values that were sent (defaults are not validated), so an
    omitted field keeps its ``None`` default.
    """
    if value is None:
        raise ValueError(f"'{info.field_name}' cannot be null")
    return value


class InvestmentCreate(BaseModel):
    """``value_updated_at`` may be omitted (the service sets today) but not sent as ``null``."""

    model_config = ConfigDict(extra="forbid")

    name: InvestmentName
    type: InvestmentType
    platform: Platform = None
    amount_invested: InvestmentMoneyIn
    current_value: InvestmentMoneyIn
    value_updated_at: date | SkipJsonSchema[None] = None

    @field_validator("value_updated_at")
    @classmethod
    def _reject_null(cls, value: object, info: ValidationInfo) -> object:
        return reject_null(value, info)


class InvestmentUpdate(BaseModel):
    """Partial update: omitted fields are unchanged, an explicit ``null`` clears ``platform``.

    The other fields are not nullable, so an explicit ``null`` is a 422. Their ``None`` default
    only means "not sent" (it is hidden from the JSON schema), and the service reads the sent
    fields with ``model_dump(exclude_unset=True)``.
    """

    model_config = ConfigDict(extra="forbid")

    name: InvestmentName | SkipJsonSchema[None] = None
    type: InvestmentType | SkipJsonSchema[None] = None
    platform: Platform = None
    amount_invested: InvestmentMoneyIn | SkipJsonSchema[None] = None
    current_value: InvestmentMoneyIn | SkipJsonSchema[None] = None
    value_updated_at: date | SkipJsonSchema[None] = None

    @field_validator(*NOT_NULLABLE)
    @classmethod
    def _reject_null(cls, value: object, info: ValidationInfo) -> object:
        return reject_null(value, info)


class InvestmentRead(BaseModel):
    id: int
    name: str
    type: InvestmentType
    platform: str | None
    amount_invested: MoneyOut
    current_value: MoneyOut
    value_updated_at: date
    gain: MoneyOut
    gain_pct: RateOut | None
    created_at: datetime
    updated_at: datetime


class PortfolioTotals(BaseModel):
    total_invested: MoneyOut
    current_value: MoneyOut
    gain: MoneyOut
    gain_pct: RateOut | None


class InvestmentList(BaseModel):
    items: list[InvestmentRead]
    totals: PortfolioTotals
