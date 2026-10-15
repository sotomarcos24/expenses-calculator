"""Pure simulator functions (tech-spec section 7).

No I/O, no DB, no clock, no randomness. All arithmetic is ``Decimal`` with a fixed 50-digit
context (enough for 60 years of weekly compounding); results are rounded to 2 decimals
(``ROUND_HALF_UP``) only when they are put in an output dataclass.

Conventions:

* Periodic rate ``r_p = (1 + r)^(1/n) - 1``; exactly 0 when ``r = 0``.
* Contributions are made at the end of each period.
* Real value after ``t`` years is ``nominal / (1 + inflation)^t``.
* Each of the three scenarios is computed independently, in the fixed order
  pessimistic, base, optimistic.

Mode C timing convention (the spec does not fix it):

* The accumulation phase runs exactly like mode A until ``retirement_age``.
* The withdrawal phase is monthly: ``balance = balance * (1 + r_m) - withdrawal`` with
  ``r_m = (1 + r)^(1/12) - 1``. The monthly withdrawal is constant within a year of retirement and
  is multiplied by ``(1 + inflation)`` at the start of each following year.
* The money has run out when the balance after a month's withdrawal is below 0; ending at exactly
  0 still counts as lasting. ``depletion_age`` is the integer age during which that happens:
  ``retirement_age + (m - 1) // 12`` for the first failing month ``m``.
* The yearly series holds the balance at each birthday from ``current_age``. When the money runs
  out, the series ends with a 0 point at ``depletion_age + 1``.
"""

from collections.abc import Callable
from decimal import ROUND_HALF_UP, Context, Decimal, localcontext

from app.simulator.models import (
    AccumulationInput,
    AccumulationResult,
    AgePoint,
    GoalInput,
    GoalResult,
    Scenario,
    ScenarioRates,
    WithdrawalInput,
    WithdrawalMode,
    WithdrawalResult,
    YearPoint,
)

PRECISION = 50
CENT = Decimal("0.01")
RATIO_STEP = Decimal("0.0001")
ZERO = Decimal(0)
ONE = Decimal(1)
MONTHS_PER_YEAR = 12


def _ctx() -> Context:
    return Context(prec=PRECISION, rounding=ROUND_HALF_UP)


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _ratio(value: Decimal) -> Decimal:
    return value.quantize(RATIO_STEP, rounding=ROUND_HALF_UP)


def periodic_rate(annual_rate: Decimal, periods_per_year: int) -> Decimal:
    """Compound-equivalent rate per period; call inside the simulator context."""
    if annual_rate == 0:
        return ZERO
    return ((ONE + annual_rate).ln() / periods_per_year).exp() - ONE


def _scenarios(rates: ScenarioRates) -> tuple[tuple[Scenario, Decimal], ...]:
    return (
        (Scenario.PESSIMISTIC, rates.pessimistic),
        (Scenario.BASE, rates.base),
        (Scenario.OPTIMISTIC, rates.optimistic),
    )


def _year_end_balances(
    starting_amount: Decimal,
    contribution: Decimal,
    periods_per_year: int,
    annual_rate: Decimal,
    years: int,
) -> list[Decimal]:
    """Nominal balance at the end of each year ``0..years`` (index 0 = starting amount)."""
    r_p = periodic_rate(annual_rate, periods_per_year)
    growth = ONE + r_p
    balance = starting_amount
    balances = [balance]
    for _ in range(years):
        for _ in range(periods_per_year):
            balance = balance * growth + contribution
        balances.append(balance)
    return balances


def accumulate(inp: AccumulationInput) -> tuple[AccumulationResult, ...]:
    """Mode A: balance growth over ``horizon_years`` for the three scenarios."""
    n = inp.frequency.periods_per_year
    with localcontext(_ctx()):
        yearly_expenses = inp.avg_monthly_expenses * MONTHS_PER_YEAR
        results: list[AccumulationResult] = []
        for scenario, rate in _scenarios(inp.rates):
            balances = _year_end_balances(
                inp.starting_amount, inp.contribution, n, rate, inp.horizon_years
            )
            points = tuple(
                YearPoint(
                    year=year,
                    age=inp.current_age + year,
                    nominal=_money(nominal),
                    real=_money(nominal / (ONE + inp.inflation_rate) ** year),
                    total_contributed=_money(inp.contribution * n * year),
                )
                for year, nominal in enumerate(balances)
            )
            covered: Decimal | None = None
            if yearly_expenses != 0:
                real_final = balances[-1] / (ONE + inp.inflation_rate) ** inp.horizon_years
                covered = _money(real_final / yearly_expenses)
            results.append(AccumulationResult(scenario, points, covered))
        return tuple(results)


def required_contribution(inp: GoalInput) -> tuple[GoalResult, ...]:
    """Mode B: contribution per period needed to reach the target."""
    n = inp.frequency.periods_per_year
    periods = inp.years * n
    with localcontext(_ctx()):
        if inp.target_is_real:
            future_value = inp.target_amount * (ONE + inp.inflation_rate) ** inp.years
        else:
            future_value = inp.target_amount
        results: list[GoalResult] = []
        for scenario, rate in _scenarios(inp.rates):
            r_p = periodic_rate(rate, n)
            if r_p == 0:
                payment = (future_value - inp.starting_amount) / periods
            else:
                growth = (ONE + r_p) ** periods
                payment = (future_value - inp.starting_amount * growth) * r_p / (growth - ONE)
            if payment <= 0:
                results.append(GoalResult(scenario, ZERO, ZERO, True, _money(future_value)))
            else:
                results.append(
                    GoalResult(
                        scenario,
                        _money(payment),
                        _money(payment * periods),
                        False,
                        _money(future_value),
                    )
                )
        return tuple(results)


def _withdraw_one(
    inp: WithdrawalInput,
    rate: Decimal,
    first_monthly_withdrawal: Callable[[Decimal], Decimal],
) -> tuple[Decimal, Decimal, int | None, tuple[tuple[int, Decimal], ...]]:
    """Run both phases for one scenario.

    Returns the balance at retirement, the first monthly withdrawal (nominal), the depletion age
    and the nominal balance at each birthday (including the final 0 point after depletion).
    """
    retirement_years = inp.retirement_age - inp.current_age
    balances = _year_end_balances(
        inp.starting_amount,
        inp.contribution,
        inp.frequency.periods_per_year,
        rate,
        retirement_years,
    )
    at_retirement = balances[-1]
    birthdays = [(inp.current_age + i, b) for i, b in enumerate(balances)]
    first = first_monthly_withdrawal(at_retirement)

    r_m = periodic_rate(rate, MONTHS_PER_YEAR)
    growth = ONE + r_m
    balance = at_retirement
    withdrawal = first
    for month in range(1, (inp.end_age - inp.retirement_age) * MONTHS_PER_YEAR + 1):
        year_index, month_in_year = divmod(month - 1, MONTHS_PER_YEAR)
        if month_in_year == 0 and year_index > 0:
            withdrawal = withdrawal * (ONE + inp.inflation_rate)
        balance = balance * growth - withdrawal
        if balance < 0:
            depletion_age = inp.retirement_age + year_index
            birthdays.append((depletion_age + 1, ZERO))
            return at_retirement, first, depletion_age, tuple(birthdays)
        if month_in_year == MONTHS_PER_YEAR - 1:
            birthdays.append((inp.retirement_age + year_index + 1, balance))
    return at_retirement, first, None, tuple(birthdays)


def withdraw(inp: WithdrawalInput) -> tuple[WithdrawalResult, ...]:
    """Mode C: accumulate until retirement, then withdraw monthly until ``end_age``."""
    retirement_years = inp.retirement_age - inp.current_age
    with localcontext(_ctx()):
        inflation_at_retirement = (ONE + inp.inflation_rate) ** retirement_years

        def first_withdrawal(balance_at_retirement: Decimal) -> Decimal:
            if inp.withdrawal_mode is WithdrawalMode.PERCENT:
                assert inp.withdrawal_rate is not None
                return inp.withdrawal_rate * balance_at_retirement / MONTHS_PER_YEAR
            assert inp.monthly_withdrawal is not None
            return inp.monthly_withdrawal * inflation_at_retirement

        results: list[WithdrawalResult] = []
        for scenario, rate in _scenarios(inp.rates):
            at_retirement, first, depletion_age, birthdays = _withdraw_one(
                inp, rate, first_withdrawal
            )
            monthly_income = first / inflation_at_retirement
            coverage: Decimal | None = None
            if inp.avg_monthly_expenses != 0:
                coverage = _ratio(monthly_income / inp.avg_monthly_expenses)
            series = tuple(
                AgePoint(
                    age=age,
                    nominal=_money(nominal),
                    real=_money(nominal / (ONE + inp.inflation_rate) ** (age - inp.current_age)),
                )
                for age, nominal in birthdays
            )
            results.append(
                WithdrawalResult(
                    scenario=scenario,
                    balance_at_retirement_nominal=_money(at_retirement),
                    balance_at_retirement_real=_money(at_retirement / inflation_at_retirement),
                    monthly_income=_money(monthly_income),
                    expenses_coverage_pct=coverage,
                    lasts_until_end=depletion_age is None,
                    depletion_age=depletion_age,
                    series=series,
                )
            )
        return tuple(results)
