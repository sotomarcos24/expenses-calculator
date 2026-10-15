"""Simulator request and response schemas (tech-spec sections 6 and 7).

Requests carry every input (the endpoints are stateless); rates travel as decimal strings
such as ``"0.05"``, ages and years as integers. Responses serialize money as 2-decimal strings.
"""

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, ValidationInfo, field_validator

from app.schemas.money import MoneyOut, RateOut
from app.simulator.models import Frequency, WithdrawalMode

MAX_MONEY = Decimal("1000000000000")
MAX_AGE = 120
MAX_YEARS = 60

# Request money: non-negative, at most 2 decimals, at most 1,000,000,000,000.
MoneyIn = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, decimal_places=2)]
# Annual rate in [-0.5, 0.5].
RateIn = Annotated[Decimal, Field(ge=Decimal("-0.5"), le=Decimal("0.5"), decimal_places=6)]
WithdrawalRateIn = Annotated[Decimal, Field(ge=0, le=Decimal("0.5"), decimal_places=6)]
Years = Annotated[int, Field(ge=1, le=MAX_YEARS)]
Age = Annotated[int, Field(ge=0, le=MAX_AGE)]

# A rate as a plain decimal string ("0.02"), without padding.
RateString = Annotated[Decimal, PlainSerializer(lambda v: format(v, "f"), return_type=str)]


class ScenarioRatesIn(BaseModel):
    pessimistic: RateIn
    base: RateIn
    optimistic: RateIn


class ScenarioRatesOut(BaseModel):
    pessimistic: RateString
    base: RateString
    optimistic: RateString


class SimulatorDefaults(BaseModel):
    starting_amount: MoneyOut
    avg_monthly_expenses: MoneyOut
    inflation_rate: RateString
    scenarios: ScenarioRatesOut


class AccumulationRequest(BaseModel):
    starting_amount: MoneyIn
    contribution: MoneyIn
    frequency: Frequency
    horizon_years: Years
    scenarios: ScenarioRatesIn
    inflation_rate: RateIn
    current_age: Age
    avg_monthly_expenses: MoneyIn


class GoalRequest(BaseModel):
    starting_amount: MoneyIn
    target_amount: MoneyIn
    years: Years
    frequency: Frequency
    scenarios: ScenarioRatesIn
    inflation_rate: RateIn
    target_is_real: bool = True


class WithdrawalRequest(BaseModel):
    starting_amount: MoneyIn
    contribution: MoneyIn
    frequency: Frequency
    scenarios: ScenarioRatesIn
    inflation_rate: RateIn
    current_age: Age
    avg_monthly_expenses: MoneyIn
    retirement_age: Age
    end_age: Age = 100
    withdrawal_mode: WithdrawalMode
    withdrawal_rate: WithdrawalRateIn | None = Field(default=None, validate_default=True)
    monthly_withdrawal: MoneyIn | None = Field(default=None, validate_default=True)

    @field_validator("retirement_age")
    @classmethod
    def _retirement_after_current(cls, value: int, info: ValidationInfo) -> int:
        current = info.data.get("current_age")
        if current is None:
            return value
        if value <= current:
            raise ValueError("retirement_age must be greater than current_age")
        if value - current > MAX_YEARS:
            raise ValueError(f"retirement_age must be at most {MAX_YEARS} years after current_age")
        return value

    @field_validator("end_age")
    @classmethod
    def _end_after_retirement(cls, value: int, info: ValidationInfo) -> int:
        retirement = info.data.get("retirement_age")
        if retirement is not None and value <= retirement:
            raise ValueError("end_age must be greater than retirement_age")
        return value

    @field_validator("withdrawal_rate")
    @classmethod
    def _rate_required_for_percent(
        cls, value: Decimal | None, info: ValidationInfo
    ) -> Decimal | None:
        if value is None and info.data.get("withdrawal_mode") is WithdrawalMode.PERCENT:
            raise ValueError("withdrawal_rate is required when withdrawal_mode is 'percent'")
        return value

    @field_validator("monthly_withdrawal")
    @classmethod
    def _amount_required_for_fixed(
        cls, value: Decimal | None, info: ValidationInfo
    ) -> Decimal | None:
        if value is None and info.data.get("withdrawal_mode") is WithdrawalMode.FIXED:
            raise ValueError("monthly_withdrawal is required when withdrawal_mode is 'fixed'")
        return value


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class YearPointOut(_Out):
    year: int
    age: int
    nominal: MoneyOut
    real: MoneyOut
    total_contributed: MoneyOut


class AccumulationScenarioResult(_Out):
    points: list[YearPointOut]
    years_of_expenses_covered: MoneyOut | None


class AccumulationResponse(BaseModel):
    pessimistic: AccumulationScenarioResult
    base: AccumulationScenarioResult
    optimistic: AccumulationScenarioResult


class GoalScenarioResult(_Out):
    required_contribution: MoneyOut
    total_contributed: MoneyOut
    already_reached: bool
    nominal_target: MoneyOut


class GoalResponse(BaseModel):
    pessimistic: GoalScenarioResult
    base: GoalScenarioResult
    optimistic: GoalScenarioResult


class AgePointOut(_Out):
    age: int
    nominal: MoneyOut
    real: MoneyOut


class WithdrawalScenarioResult(_Out):
    balance_at_retirement_nominal: MoneyOut
    balance_at_retirement_real: MoneyOut
    monthly_income: MoneyOut
    expenses_coverage_pct: RateOut | None
    lasts_until_end: bool
    depletion_age: int | None
    series: list[AgePointOut]


class WithdrawalResponse(BaseModel):
    pessimistic: WithdrawalScenarioResult
    base: WithdrawalScenarioResult
    optimistic: WithdrawalScenarioResult
