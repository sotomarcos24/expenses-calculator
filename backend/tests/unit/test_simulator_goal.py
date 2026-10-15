"""Mode B known values."""

from dataclasses import replace
from decimal import Decimal

from app.simulator import (
    Frequency,
    GoalInput,
    Scenario,
    ScenarioRates,
    required_contribution,
)

D = Decimal


def rates_all(rate: Decimal) -> ScenarioRates:
    return ScenarioRates(rate, rate, rate)


def make(**overrides: object) -> GoalInput:
    base = GoalInput(
        starting_amount=D(0),
        target_amount=D(60000),
        years=10,
        frequency=Frequency.MONTHLY,
        rates=rates_all(D(0)),
        inflation_rate=D(0),
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


def test_zero_rate_is_a_straight_division() -> None:
    # 60000 / 120 months = 500
    result = required_contribution(make())[1]

    assert result.required_contribution == D("500.00")
    assert result.total_contributed == D("60000.00")
    assert result.already_reached is False
    assert result.nominal_target == D("60000.00")


def test_zero_rate_with_starting_amount() -> None:
    # (60000 - 10000) / 120 = 416.666... -> 416.67 ; total = 50000
    result = required_contribution(make(starting_amount=D(10000)))[1]

    assert result.required_contribution == D("416.67")
    assert result.total_contributed == D("50000.00")


def test_annuity_with_return() -> None:
    # r_p = 1%, N = 120: PMT = 60000 * 0.01 / (1.01^120 - 1) = 600 / 2.30038689... = 260.83
    # total = 260.8256904... * 120 = 31299.08
    inp = make(rates=rates_all(D("1.01") ** 12 - 1))
    result = required_contribution(inp)[1]

    assert result.required_contribution == D("260.83")
    assert result.total_contributed == D("31299.08")


def test_yearly_frequency() -> None:
    # 5%, 3 yearly payments of P: P * (1.05^3 - 1) / 0.05 = 1000 * 3.1525 -> P = 317.21
    inp = make(
        target_amount=D(1000),
        years=3,
        frequency=Frequency.YEARLY,
        rates=rates_all(D("0.05")),
    )
    result = required_contribution(inp)[1]

    assert result.required_contribution == D("317.21")
    assert result.total_contributed == D("951.63")


def test_target_in_todays_dollars_is_inflated() -> None:
    # 60000 * 1.02^10 = 73139.665... ; / 120 = 609.497... -> 609.50
    result = required_contribution(make(inflation_rate=D("0.02")))[1]

    assert result.nominal_target == D("73139.67")
    assert result.required_contribution == D("609.50")


def test_target_not_inflated_when_nominal() -> None:
    inp = make(inflation_rate=D("0.02"), target_is_real=False)
    result = required_contribution(inp)[1]

    assert result.nominal_target == D("60000.00")
    assert result.required_contribution == D("500.00")


def test_already_reached_with_return() -> None:
    result = required_contribution(make(starting_amount=D(60000), rates=rates_all(D("0.05"))))[1]

    assert result.already_reached is True
    assert result.required_contribution == D("0.00")
    assert result.total_contributed == D("0.00")


def test_already_reached_when_start_equals_the_nominal_target() -> None:
    # 1000 * 1.1 = 1100 nominal, starting amount exactly 1100
    for rate in (D(0), D("0.05")):
        inp = make(
            starting_amount=D(1100),
            target_amount=D(1000),
            years=1,
            inflation_rate=D("0.1"),
            rates=rates_all(rate),
        )
        result = required_contribution(inp)[1]
        assert result.already_reached is True
        assert result.required_contribution == D("0.00")


def test_negative_return() -> None:
    # r_p = -2%, one yearly payment: P = 1000 (no growth before the end of the year)
    inp = make(
        target_amount=D(1000),
        years=1,
        frequency=Frequency.YEARLY,
        rates=rates_all(D("-0.02")),
    )
    assert required_contribution(inp)[1].required_contribution == D("1000.00")


def test_three_scenarios_in_fixed_order_and_independent() -> None:
    rates = ScenarioRates(D("0.03"), D("0.05"), D("0.07"))
    inp = make(rates=rates)
    results = required_contribution(inp)

    assert [r.scenario for r in results] == [
        Scenario.PESSIMISTIC,
        Scenario.BASE,
        Scenario.OPTIMISTIC,
    ]
    needed = [r.required_contribution for r in results]
    assert needed[0] > needed[1] > needed[2]
    assert results[1] == required_contribution(replace(inp, rates=rates_all(D("0.05"))))[1]


def test_is_deterministic() -> None:
    inp = make(rates=ScenarioRates(D("0.03"), D("0.05"), D("0.07")), inflation_rate=D("0.02"))
    assert required_contribution(inp) == required_contribution(inp)
