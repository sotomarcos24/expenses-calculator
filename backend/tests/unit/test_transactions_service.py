from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind
from app.schemas.transactions import TransactionCreate, normalize_note
from app.services import transactions as service
from app.services.categories import seed_default_categories
from tests.unit.test_category_model import make_user


@pytest.mark.parametrize(
    ("gross", "net", "rate"),
    [
        (Decimal("3000.00"), Decimal("2400.00"), Decimal("0.2000")),
        (Decimal("6.00"), Decimal("5.00"), Decimal("0.1667")),
        (Decimal("100.00"), Decimal("100.00"), Decimal("0.0000")),
        (Decimal("3000.00"), Decimal("2999.99"), Decimal("0.0000")),
    ],
)
def test_compute_deduction_rate(gross: Decimal, net: Decimal, rate: Decimal) -> None:
    result = service.compute_deduction_rate(net, gross)

    assert result == rate
    assert isinstance(result, Decimal)
    assert str(result) == str(rate)


def test_compute_deduction_rate_without_gross() -> None:
    assert service.compute_deduction_rate(Decimal("2400.00"), None) is None


def test_compute_deduction_rate_rounds_half_up() -> None:
    # (20000 - 19999) / 20000 = 0.00005 exactly: half up gives 0.0001, half even would give 0.
    assert service.compute_deduction_rate(Decimal("19999.00"), Decimal("20000.00")) == Decimal(
        "0.0001"
    )


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        ("   \t\n ", None),
        ("  weekly shop  ", "weekly shop"),
        ("a  b", "a  b"),
        (" " + "x" * 500 + " ", "x" * 500),
    ],
)
def test_normalize_note(value: str | None, expected: str | None) -> None:
    assert normalize_note(value) == expected


def test_normalize_note_rejects_501_characters() -> None:
    with pytest.raises(ValueError):
        normalize_note("x" * 501)


def test_service_sum_is_exact(db_session: Session) -> None:
    user = make_user(db_session)
    seed_default_categories(db_session, user)
    db_session.commit()
    food = db_session.query(Category).filter_by(user_id=user.id, name="Food").one()
    for amount in ("0.10", "0.20"):
        service.create_transaction(
            db_session,
            user.id,
            TransactionCreate(
                type=CategoryKind.EXPENSE,
                date=date(2026, 10, 1),
                amount=Decimal(amount),
                category_id=food.id,
            ),
        )

    items, total = service.list_transactions(
        db_session, user.id, service.TransactionFilters(), page=1, page_size=50
    )

    assert total == 2
    assert all(isinstance(item.amount, Decimal) for item in items)
    assert sum((item.amount for item in items), Decimal(0)) == Decimal("0.30")
