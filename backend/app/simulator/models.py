"""Inputs and outputs of the simulator: frozen dataclasses, no behaviour beyond tiny helpers."""

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum


class Frequency(StrEnum):
    """Contribution frequency; the value of ``periods_per_year`` is ``n`` in the spec."""

    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"

    @property
    def periods_per_year(self) -> int:
        return _PERIODS_PER_YEAR[self]


_PERIODS_PER_YEAR = {
    Frequency.WEEKLY: 52,
    Frequency.MONTHLY: 12,
    Frequency.YEARLY: 1,
}


class Scenario(StrEnum):
    PESSIMISTIC = "pessimistic"
    BASE = "base"
    OPTIMISTIC = "optimistic"


class WithdrawalMode(StrEnum):
    PERCENT = "percent"
    FIXED = "fixed"


@dataclass(frozen=True)
class ScenarioRates:
    """Annual return rate of each scenario (e.g. ``0.03`` / ``0.05`` / ``0.07``)."""

    pessimistic: Decimal
    base: Decimal
    optimistic: Decimal


@dataclass(frozen=True)
class AccumulationInput:
    starting_amount: Decimal
    contribution: Decimal
    frequency: Frequency
    horizon_years: int
    rates: ScenarioRates
    inflation_rate: Decimal
    current_age: int
    avg_monthly_expenses: Decimal


@dataclass(frozen=True)
class YearPoint:
    year: int
    age: int
    nominal: Decimal
    real: Decimal
    total_contributed: Decimal


@dataclass(frozen=True)
class AccumulationResult:
    scenario: Scenario
    points: tuple[YearPoint, ...]
    years_of_expenses_covered: Decimal | None


@dataclass(frozen=True)
class GoalInput:
    starting_amount: Decimal
    target_amount: Decimal
    years: int
    frequency: Frequency
    rates: ScenarioRates
    inflation_rate: Decimal
    target_is_real: bool = True


@dataclass(frozen=True)
class GoalResult:
    scenario: Scenario
    required_contribution: Decimal
    total_contributed: Decimal
    already_reached: bool
    nominal_target: Decimal


@dataclass(frozen=True)
class WithdrawalInput:
    starting_amount: Decimal
    contribution: Decimal
    frequency: Frequency
    current_age: int
    retirement_age: int
    withdrawal_mode: WithdrawalMode
    rates: ScenarioRates
    inflation_rate: Decimal
    avg_monthly_expenses: Decimal
    withdrawal_rate: Decimal | None = None
    monthly_withdrawal: Decimal | None = None
    end_age: int = 100


@dataclass(frozen=True)
class AgePoint:
    age: int
    nominal: Decimal
    real: Decimal


@dataclass(frozen=True)
class WithdrawalResult:
    scenario: Scenario
    balance_at_retirement_nominal: Decimal
    balance_at_retirement_real: Decimal
    monthly_income: Decimal
    expenses_coverage_pct: Decimal | None
    lasts_until_end: bool
    depletion_age: int | None
    series: tuple[AgePoint, ...]
