"""Simulator defaults (tech-spec 7.5) and the adapters between API schemas and the pure module."""

from datetime import date
from decimal import Decimal

from sqlalchemy import Numeric, func, select, type_coerce
from sqlalchemy.orm import Session

from app.models import CategoryKind, Investment, Transaction
from app.schemas.money import CENT
from app.schemas.simulator import (
    AccumulationRequest,
    AccumulationResponse,
    GoalRequest,
    GoalResponse,
    ScenarioRatesIn,
    ScenarioRatesOut,
    SimulatorDefaults,
    WithdrawalRequest,
    WithdrawalResponse,
)
from app.simulator import accumulate, required_contribution, withdraw
from app.simulator.models import (
    AccumulationInput,
    GoalInput,
    ScenarioRates,
    WithdrawalInput,
)

DEFAULT_INFLATION = Decimal("0.02")
DEFAULT_SCENARIOS = ScenarioRatesOut(
    pessimistic=Decimal("0.03"), base=Decimal("0.05"), optimistic=Decimal("0.07")
)
MONTHS_WINDOW = 12


def _month_start(day: date, months_back: int) -> date:
    index = day.year * 12 + (day.month - 1) - months_back
    return date(index // 12, index % 12 + 1, 1)


def average_monthly_expenses(db: Session, user_id: int, today: date) -> Decimal:
    """Net expenses of the 12 full months before ``today``'s month ÷ months with an expense."""
    start = _month_start(today, MONTHS_WINDOW)
    end = _month_start(today, 0)
    rows = db.execute(
        select(
            Transaction.date,
            type_coerce(func.sum(Transaction.amount), Numeric(16, 2)),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.type == CategoryKind.EXPENSE,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.date)
    ).all()
    if not rows:
        return Decimal(0).quantize(CENT)
    months = {(day.year, day.month) for day, _ in rows}
    # SQLite sums as floats: quantizing each day's total removes the representation error.
    total = sum((Decimal(amount).quantize(CENT) for _, amount in rows), Decimal(0))
    return (total / len(months)).quantize(CENT)


def build_defaults(db: Session, user_id: int, today: date) -> SimulatorDefaults:
    value = db.execute(
        select(type_coerce(func.sum(Investment.current_value), Numeric(16, 2))).where(
            Investment.user_id == user_id
        )
    ).scalar_one()
    starting = Decimal(0) if value is None else Decimal(value)
    return SimulatorDefaults(
        starting_amount=starting.quantize(CENT),
        avg_monthly_expenses=average_monthly_expenses(db, user_id, today),
        inflation_rate=DEFAULT_INFLATION,
        scenarios=DEFAULT_SCENARIOS,
    )


def _rates(scenarios: ScenarioRatesIn) -> ScenarioRates:
    return ScenarioRates(scenarios.pessimistic, scenarios.base, scenarios.optimistic)


def run_accumulation(body: AccumulationRequest) -> AccumulationResponse:
    pessimistic, base, optimistic = accumulate(
        AccumulationInput(
            starting_amount=body.starting_amount,
            contribution=body.contribution,
            frequency=body.frequency,
            horizon_years=body.horizon_years,
            rates=_rates(body.scenarios),
            inflation_rate=body.inflation_rate,
            current_age=body.current_age,
            avg_monthly_expenses=body.avg_monthly_expenses,
        )
    )
    return AccumulationResponse.model_validate(
        {"pessimistic": pessimistic, "base": base, "optimistic": optimistic},
        from_attributes=True,
    )


def run_goal(body: GoalRequest) -> GoalResponse:
    pessimistic, base, optimistic = required_contribution(
        GoalInput(
            starting_amount=body.starting_amount,
            target_amount=body.target_amount,
            years=body.years,
            frequency=body.frequency,
            rates=_rates(body.scenarios),
            inflation_rate=body.inflation_rate,
            target_is_real=body.target_is_real,
        )
    )
    return GoalResponse.model_validate(
        {"pessimistic": pessimistic, "base": base, "optimistic": optimistic},
        from_attributes=True,
    )


def run_withdrawal(body: WithdrawalRequest) -> WithdrawalResponse:
    pessimistic, base, optimistic = withdraw(
        WithdrawalInput(
            starting_amount=body.starting_amount,
            contribution=body.contribution,
            frequency=body.frequency,
            current_age=body.current_age,
            retirement_age=body.retirement_age,
            withdrawal_mode=body.withdrawal_mode,
            rates=_rates(body.scenarios),
            inflation_rate=body.inflation_rate,
            avg_monthly_expenses=body.avg_monthly_expenses,
            withdrawal_rate=body.withdrawal_rate,
            monthly_withdrawal=body.monthly_withdrawal,
            end_age=body.end_age,
        )
    )
    return WithdrawalResponse.model_validate(
        {"pessimistic": pessimistic, "base": base, "optimistic": optimistic},
        from_attributes=True,
    )
