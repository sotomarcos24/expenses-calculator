from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, Transaction, User
from app.services import dashboard as service


@pytest.mark.parametrize(
    ("savings", "income", "rate"),
    [
        ("250.00", "1000.00", "0.2500"),
        ("-100.00", "400.00", "-0.2500"),
        ("1.00", "3.00", "0.3333"),
        ("2.00", "3.00", "0.6667"),
        ("0.00", "10.00", "0.0000"),
    ],
)
def test_compute_savings_rate(savings: str, income: str, rate: str) -> None:
    assert service.compute_savings_rate(Decimal(savings), Decimal(income)) == Decimal(rate)


def test_compute_savings_rate_without_income_is_none() -> None:
    assert service.compute_savings_rate(Decimal("-5.00"), Decimal("0.00")) is None


def test_build_dashboard_sums_with_decimal(db_session: Session) -> None:
    user = User(email="u@example.com", password_hash="x")
    db_session.add(user)
    db_session.flush()
    cat = Category(user_id=user.id, name="Food", kind=CategoryKind.EXPENSE)
    db_session.add(cat)
    db_session.flush()
    for _ in range(3):
        db_session.add(
            Transaction(
                user_id=user.id,
                type=CategoryKind.EXPENSE,
                date=date(2026, 3, 1),
                amount=Decimal("0.10"),
                category_id=cat.id,
            )
        )
    db_session.flush()

    result = service.build_dashboard(db_session, user.id, date(2026, 3, 1), date(2026, 3, 1))

    assert result.expense_total == Decimal("0.30")
    assert result.expenses_by_category[0].subcategories[0].name == "(none)"
