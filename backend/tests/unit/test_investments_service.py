from datetime import date
from decimal import Decimal

import pytest

from app.models import Investment, InvestmentType
from app.services import investments as service


def make(amount_invested: str, current_value: str) -> Investment:
    return Investment(
        name="x",
        type=InvestmentType.ETF,
        amount_invested=Decimal(amount_invested),
        current_value=Decimal(current_value),
    )


@pytest.mark.parametrize(
    ("invested", "current", "gain"),
    [
        ("1000.00", "1150.00", "150.00"),
        ("1000.00", "900.00", "-100.00"),
        ("1000.00", "1000.00", "0.00"),
        ("0.00", "50.00", "50.00"),
        ("0.00", "0.00", "0.00"),
    ],
)
def test_compute_gain(invested: str, current: str, gain: str) -> None:
    result = service.compute_gain(Decimal(invested), Decimal(current))

    assert isinstance(result, Decimal)
    assert result == Decimal(gain)


@pytest.mark.parametrize(
    ("invested", "current", "pct"),
    [
        ("1000.00", "1150.00", "0.1500"),
        ("1000.00", "900.00", "-0.1000"),
        ("1000.00", "1000.00", "0.0000"),
        ("3.00", "4.00", "0.3333"),
        ("3.00", "5.00", "0.6667"),
    ],
)
def test_compute_gain_pct(invested: str, current: str, pct: str) -> None:
    result = service.compute_gain_pct(Decimal(invested), Decimal(current))

    assert isinstance(result, Decimal)
    assert str(result) == pct


@pytest.mark.parametrize("current", ["0.00", "50.00"])
def test_compute_gain_pct_with_zero_invested_is_none(current: str) -> None:
    assert service.compute_gain_pct(Decimal("0.00"), Decimal(current)) is None


def test_compute_gain_pct_rounds_half_up() -> None:
    # A gain of 0.0004 on 8 is 0.00005 exactly: half up gives 0.0001, half even would give 0.
    assert str(service.compute_gain_pct(Decimal("8"), Decimal("8.0004"))) == "0.0001"
    # The same for a loss: -0.00005 rounds away from zero to -0.0001.
    assert str(service.compute_gain_pct(Decimal("8"), Decimal("7.9996"))) == "-0.0001"


def test_compute_totals_several_rows() -> None:
    totals = service.compute_totals(
        [make("1000.00", "1150.00"), make("500.00", "400.00"), make("0.00", "50.00")]
    )

    assert totals.total_invested == Decimal("1500.00")
    assert totals.current_value == Decimal("1600.00")
    assert totals.gain == Decimal("100.00")
    assert totals.gain_pct is not None
    assert str(totals.gain_pct) == "0.0667"


def test_compute_totals_empty() -> None:
    totals = service.compute_totals([])

    assert totals.model_dump(mode="json") == {
        "total_invested": "0.00",
        "current_value": "0.00",
        "gain": "0.00",
        "gain_pct": None,
    }


def test_compute_totals_with_zero_invested_has_no_pct() -> None:
    totals = service.compute_totals([make("0.00", "50.00"), make("0.00", "0.00")])

    assert totals.gain == Decimal("50.00")
    assert totals.gain_pct is None


def test_compute_totals_decimal_precision() -> None:
    totals = service.compute_totals([make("0.10", "0.10"), make("0.20", "0.20")])

    assert totals.total_invested == Decimal("0.30")
    assert totals.model_dump(mode="json")["total_invested"] == "0.30"


def test_compute_totals_above_numeric_14_2() -> None:
    big = "999999999999.99"
    totals = service.compute_totals([make(big, big), make(big, big)])

    dumped = totals.model_dump(mode="json")
    assert dumped["total_invested"] == "1999999999999.98"
    assert dumped["current_value"] == "1999999999999.98"
    assert dumped["gain"] == "0.00"
    assert dumped["gain_pct"] == "0.0000"


def test_today_is_a_date() -> None:
    assert service.today() == date.today()
