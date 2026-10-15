"""Pure simulator (tech-spec section 7): no DB, no I/O, no FastAPI."""

from app.simulator.core import accumulate, periodic_rate, required_contribution, withdraw
from app.simulator.models import (
    AccumulationInput,
    AccumulationResult,
    AgePoint,
    Frequency,
    GoalInput,
    GoalResult,
    Scenario,
    ScenarioRates,
    WithdrawalInput,
    WithdrawalMode,
    WithdrawalResult,
    YearPoint,
)

__all__ = [
    "AccumulationInput",
    "AccumulationResult",
    "AgePoint",
    "Frequency",
    "GoalInput",
    "GoalResult",
    "Scenario",
    "ScenarioRates",
    "WithdrawalInput",
    "WithdrawalMode",
    "WithdrawalResult",
    "YearPoint",
    "accumulate",
    "periodic_rate",
    "required_contribution",
    "withdraw",
]
