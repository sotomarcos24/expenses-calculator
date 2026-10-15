"""Mode A known values. Rates are built so the periodic rate is a round number:
monthly r_p = 1%  -> r = 1.01^12 - 1; weekly r_p = 0.1% -> r = 1.001^52 - 1.
"""

from dataclasses import replace
from decimal import Decimal, localcontext

import pytest

from app.simulator import (
    AccumulationInput,
    Frequency,
    Scenario,
    ScenarioRates,
    accumulate,
    periodic_rate,
)

D = Decimal
ZERO_RATES = ScenarioRates(D(0), D(0), D(0))


def rates_all(rate: Decimal) -> ScenarioRates:
    return ScenarioRates(rate, rate, rate)


def make(**overrides: object) -> AccumulationInput:
    base = AccumulationInput(
        starting_amount=D(0),
        contribution=D(0),
        frequency=Frequency.MONTHLY,
        horizon_years=1,
        rates=ZERO_RATES,
        inflation_rate=D(0),
        current_age=30,
        avg_monthly_expenses=D(0),
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


def base_scenario(inp: AccumulationInput) -> object:
    return accumulate(inp)[1]


@pytest.mark.parametrize("frequency", list(Frequency))
def test_pure_compounding_is_independent_of_frequency(frequency: Frequency) -> None:
    # 10000 * 1.05^10 = 16288.9462... -> 16288.95
    inp = make(
        starting_amount=D(10000),
        frequency=frequency,
        horizon_years=10,
        rates=rates_all(D("0.05")),
    )
    result = accumulate(inp)[1]

    assert result.points[-1].nominal == D("16288.95")
    assert result.points[-1].total_contributed == D("0.00")


def test_year_zero_is_the_starting_amount() -> None:
    result = accumulate(make(starting_amount=D(500), horizon_years=3, current_age=40))[0]

    first = result.points[0]
    assert (first.year, first.age) == (0, 40)
    assert first.nominal == D("500.00")
    assert first.real == D("500.00")
    assert first.total_contributed == D("0.00")
    assert [p.year for p in result.points] == [0, 1, 2, 3]
    assert [p.age for p in result.points] == [40, 41, 42, 43]


def test_zero_return_is_starting_plus_contributions() -> None:
    # 1000 + 100 * (12 * 5) = 7000
    inp = make(starting_amount=D(1000), contribution=D(100), horizon_years=5)
    for result in accumulate(inp):
        assert result.points[-1].nominal == D("7000.00")
        assert result.points[-1].total_contributed == D("6000.00")
        assert result.points[2].nominal == D("3400.00")


def test_yearly_contribution_known_value() -> None:
    # 5% a year, 1000 at the end of each year: 1000, 2050, 3152.50
    inp = make(
        contribution=D(1000),
        frequency=Frequency.YEARLY,
        horizon_years=3,
        rates=rates_all(D("0.05")),
    )
    points = accumulate(inp)[1].points

    assert [p.nominal for p in points] == [D("0.00"), D("1000.00"), D("2050.00"), D("3152.50")]
    assert points[3].total_contributed == D("3000.00")


def test_monthly_contribution_known_value() -> None:
    # r_p = 1%: FV = 100 * (1.01^n - 1) / 0.01 -> n=12: 1268.25, n=24: 2697.35
    rate = D("1.01") ** 12 - 1
    inp = make(contribution=D(100), horizon_years=2, rates=rates_all(rate))
    points = accumulate(inp)[1].points

    assert points[1].nominal == D("1268.25")
    assert points[2].nominal == D("2697.35")
    assert points[2].total_contributed == D("2400.00")


def test_weekly_contribution_known_value() -> None:
    # r_p = 0.1%: FV = 10 * (1.001^n - 1) / 0.001 -> n=52: 533.48, n=104: 1095.43
    with localcontext() as ctx:
        ctx.prec = 60
        rate = D("1.001") ** 52 - 1
    inp = make(
        contribution=D(10), frequency=Frequency.WEEKLY, horizon_years=2, rates=rates_all(rate)
    )
    points = accumulate(inp)[1].points

    assert points[1].nominal == D("533.48")
    assert points[2].nominal == D("1095.43")
    assert points[2].total_contributed == D("1040.00")


def test_negative_return() -> None:
    # 10000 * (1 - 0.02) = 9800 after a year, whatever the frequency
    inp = make(starting_amount=D(10000), rates=rates_all(D("-0.02")))
    assert accumulate(inp)[1].points[1].nominal == D("9800.00")


def test_real_value_known_values() -> None:
    # 10000 / 1.02 = 9803.92 ; 10000 / 1.02^2 = 9611.69
    inp = make(starting_amount=D(10000), horizon_years=2, inflation_rate=D("0.02"))
    points = accumulate(inp)[1].points

    assert [p.nominal for p in points] == [D("10000.00")] * 3
    assert [p.real for p in points] == [D("10000.00"), D("9803.92"), D("9611.69")]


def test_real_equals_nominal_without_inflation() -> None:
    inp = make(starting_amount=D(1000), contribution=D(50), horizon_years=4)
    inp = replace(inp, rates=rates_all(D("0.04")))
    for point in accumulate(inp)[1].points:
        assert point.real == point.nominal


def test_years_of_expenses_covered() -> None:
    # 120000 / (2000 * 12) = 5
    inp = make(starting_amount=D(120000), horizon_years=5, avg_monthly_expenses=D(2000))
    assert accumulate(inp)[1].years_of_expenses_covered == D("5.00")


def test_years_of_expenses_covered_uses_the_real_final_value() -> None:
    # 120000 / 1.1 = 109090.909... ; / 12000 = 9.09
    inp = make(
        starting_amount=D(120000),
        horizon_years=1,
        inflation_rate=D("0.1"),
        avg_monthly_expenses=D(1000),
    )
    assert accumulate(inp)[1].years_of_expenses_covered == D("9.09")


def test_years_of_expenses_covered_is_none_without_expenses() -> None:
    assert accumulate(make(starting_amount=D(1000)))[1].years_of_expenses_covered is None


def test_three_scenarios_in_fixed_order_and_independent() -> None:
    rates = ScenarioRates(D("0.03"), D("0.05"), D("0.07"))
    inp = make(starting_amount=D(1000), contribution=D(10), horizon_years=5, rates=rates)
    results = accumulate(inp)

    assert [r.scenario for r in results] == [
        Scenario.PESSIMISTIC,
        Scenario.BASE,
        Scenario.OPTIMISTIC,
    ]
    finals = [r.points[-1].nominal for r in results]
    assert finals[0] < finals[1] < finals[2]
    # The base scenario does not depend on the other two rates.
    alone = accumulate(replace(inp, rates=rates_all(D("0.05"))))
    assert results[1] == alone[1]


def test_is_deterministic() -> None:
    inp = make(
        starting_amount=D(1000),
        contribution=D(10),
        horizon_years=5,
        rates=ScenarioRates(D("0.03"), D("0.05"), D("0.07")),
        inflation_rate=D("0.02"),
        avg_monthly_expenses=D(500),
    )
    assert accumulate(inp) == accumulate(inp)


def test_long_weekly_horizon_runs() -> None:
    inp = make(
        starting_amount=D(1000),
        contribution=D(25),
        frequency=Frequency.WEEKLY,
        horizon_years=60,
        rates=rates_all(D("0.07")),
    )
    assert len(accumulate(inp)[1].points) == 61


def test_periodic_rate() -> None:
    assert periodic_rate(D(0), 12) == 0
    assert periodic_rate(D("0.05"), 1) == D("0.05")
    assert periodic_rate(D("0.05"), 12) > 0
    assert periodic_rate(D("-0.02"), 12) < 0
