"""Mode C known values (timing convention in the docstring of app/simulator/core.py)."""

from dataclasses import replace
from decimal import Decimal

from app.simulator import (
    Frequency,
    Scenario,
    ScenarioRates,
    WithdrawalInput,
    WithdrawalMode,
    withdraw,
)

D = Decimal
ZERO_RATES = ScenarioRates(D(0), D(0), D(0))


def make(**overrides: object) -> WithdrawalInput:
    base = WithdrawalInput(
        starting_amount=D(120000),
        contribution=D(0),
        frequency=Frequency.MONTHLY,
        current_age=60,
        retirement_age=65,
        withdrawal_mode=WithdrawalMode.FIXED,
        rates=ZERO_RATES,
        inflation_rate=D(0),
        avg_monthly_expenses=D(0),
        monthly_withdrawal=D(1000),
        end_age=75,
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


def test_fixed_lasts_to_end_age_with_an_exact_zero() -> None:
    # 120000 at 65, 1000 a month for 10 years = 120 withdrawals -> exactly 0 at 75: lasts.
    for result in withdraw(make()):
        assert result.lasts_until_end is True
        assert result.depletion_age is None
        assert result.series[-1].age == 75
        assert result.series[-1].nominal == D("0.00")


def test_fixed_runs_out_at_a_hand_calculated_age() -> None:
    # Same money until age 80: the 121st withdrawal fails; it falls in the 11th year of
    # retirement, so the money runs out during age 65 + 10 = 75.
    result = withdraw(make(end_age=80))[1]

    assert result.lasts_until_end is False
    assert result.depletion_age == 75
    ages = [p.age for p in result.series]
    assert ages == list(range(60, 77))
    assert [p.nominal for p in result.series[:6]] == [D("120000.00")] * 6
    assert result.series[6].nominal == D("108000.00")  # age 66
    assert result.series[-1].age == 76
    assert result.series[-1].nominal == D("0.00")


def test_fixed_with_inflation_runs_out_at_a_hand_calculated_age() -> None:
    # Inflation 100% a year, retirement after one year: 1000 today = 2000 nominal at 65.
    # Year 1 (age 65): 2000 * 12 = 24000 -> 96000 at 66. Year 2 (age 66): 4000 * 12 = 48000
    # -> 48000 at 67. Year 3 (age 67): 8000 a month, 6 payments use the 48000 exactly, the 7th
    # fails -> depletion age 67.
    inp = make(current_age=64, inflation_rate=D(1), end_age=80)
    result = withdraw(inp)[1]

    assert result.depletion_age == 67
    assert result.lasts_until_end is False
    assert [(p.age, p.nominal) for p in result.series] == [
        (64, D("120000.00")),
        (65, D("120000.00")),
        (66, D("96000.00")),
        (67, D("48000.00")),
        (68, D("0.00")),
    ]
    # real = nominal / 2^(age - 64)
    assert [p.real for p in result.series] == [
        D("120000.00"),
        D("60000.00"),
        D("24000.00"),
        D("6000.00"),
        D("0.00"),
    ]
    assert result.monthly_income == D("1000.00")
    assert result.balance_at_retirement_nominal == D("120000.00")
    assert result.balance_at_retirement_real == D("60000.00")


def test_percent_mode_runs_out_at_a_hand_calculated_age() -> None:
    # 100000 at 65, 12% a year -> 1000 a month, constant (no inflation): 100 payments last,
    # the 101st fails: year index 8 -> age 73.
    inp = make(
        starting_amount=D(100000),
        current_age=64,
        withdrawal_mode=WithdrawalMode.PERCENT,
        withdrawal_rate=D("0.12"),
        monthly_withdrawal=None,
        end_age=100,
    )
    result = withdraw(inp)[1]

    assert result.depletion_age == 73
    assert result.lasts_until_end is False
    assert result.monthly_income == D("1000.00")
    assert result.series[-1].age == 74


def test_percent_mode_lasts_with_a_return() -> None:
    # 3% a year withdrawal with a 5% return never runs dry in 10 years.
    inp = make(
        withdrawal_mode=WithdrawalMode.PERCENT,
        withdrawal_rate=D("0.03"),
        monthly_withdrawal=None,
        rates=ScenarioRates(D("0.05"), D("0.05"), D("0.05")),
    )
    result = withdraw(inp)[1]

    assert result.lasts_until_end is True
    assert result.depletion_age is None
    # first monthly withdrawal: 0.03 * balance_at_65 / 12
    assert result.monthly_income == (
        result.balance_at_retirement_nominal * D("0.03") / 12
    ).quantize(D("0.01"))


def test_accumulation_phase_matches_mode_a() -> None:
    # 0% return: 1000 + 100 * 12 * 5 = 7000 at 65.
    inp = make(starting_amount=D(1000), contribution=D(100), monthly_withdrawal=D(10))
    result = withdraw(inp)[1]

    assert result.balance_at_retirement_nominal == D("7000.00")
    assert [p.nominal for p in result.series[:6]] == [
        D("1000.00"),
        D("2200.00"),
        D("3400.00"),
        D("4600.00"),
        D("5800.00"),
        D("7000.00"),
    ]


def test_monthly_income_is_in_todays_dollars_for_percent() -> None:
    # 120000 at 62, 10% inflation, 10% a year: nominal 1000 a month.
    # Today's dollars: 1000 / 1.1^2 = 826.45 ; real balance 120000 / 1.21 = 99173.55.
    inp = make(
        retirement_age=62,
        withdrawal_mode=WithdrawalMode.PERCENT,
        withdrawal_rate=D("0.1"),
        monthly_withdrawal=None,
        inflation_rate=D("0.1"),
        avg_monthly_expenses=D(1000),
    )
    result = withdraw(inp)[1]

    assert result.monthly_income == D("826.45")
    assert result.balance_at_retirement_real == D("99173.55")
    assert result.expenses_coverage_pct == D("0.8264")


def test_monthly_income_is_the_input_for_fixed() -> None:
    inp = make(monthly_withdrawal=D(1500), inflation_rate=D("0.03"), avg_monthly_expenses=D(2000))
    result = withdraw(inp)[1]

    assert result.monthly_income == D("1500.00")
    assert result.expenses_coverage_pct == D("0.7500")


def test_coverage_is_none_without_expenses() -> None:
    assert withdraw(make())[1].expenses_coverage_pct is None


def test_negative_return_does_not_break() -> None:
    inp = make(rates=ScenarioRates(D("-0.02"), D("-0.02"), D("-0.02")), end_age=90)
    result = withdraw(inp)[1]

    assert result.balance_at_retirement_nominal < D("120000.00")
    assert result.lasts_until_end is False


def test_empty_balance_at_retirement_depletes_immediately() -> None:
    result = withdraw(make(starting_amount=D(0)))[1]

    assert result.depletion_age == 65
    assert [(p.age, p.nominal) for p in result.series][-2:] == [(65, D("0.00")), (66, D("0.00"))]


def test_percent_with_empty_balance_lasts() -> None:
    inp = make(
        starting_amount=D(0),
        withdrawal_mode=WithdrawalMode.PERCENT,
        withdrawal_rate=D("0.04"),
        monthly_withdrawal=None,
    )
    result = withdraw(inp)[1]

    assert result.lasts_until_end is True
    assert result.monthly_income == D("0.00")


def test_three_scenarios_in_fixed_order_and_independent() -> None:
    rates = ScenarioRates(D("0.03"), D("0.05"), D("0.07"))
    inp = make(rates=rates, contribution=D(100), end_age=90)
    results = withdraw(inp)

    assert [r.scenario for r in results] == [
        Scenario.PESSIMISTIC,
        Scenario.BASE,
        Scenario.OPTIMISTIC,
    ]
    balances = [r.balance_at_retirement_nominal for r in results]
    assert balances[0] < balances[1] < balances[2]
    alone = withdraw(replace(inp, rates=ScenarioRates(D("0.05"), D("0.05"), D("0.05"))))
    assert results[1] == alone[1]


def test_is_deterministic() -> None:
    inp = make(
        rates=ScenarioRates(D("0.03"), D("0.05"), D("0.07")),
        inflation_rate=D("0.02"),
        avg_monthly_expenses=D(900),
        end_age=90,
    )
    assert withdraw(inp) == withdraw(inp)
