from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, Transaction, User
from app.services import categories as service


def test_category_totals_sum_with_decimal(db_session: Session) -> None:
    user = User(email="u@example.com", password_hash="x")
    db_session.add(user)
    db_session.flush()
    food = Category(user_id=user.id, name="Food", kind=CategoryKind.EXPENSE)
    db_session.add(food)
    db_session.flush()
    groceries = Category(
        user_id=user.id, name="Groceries", kind=CategoryKind.EXPENSE, parent_id=food.id
    )
    empty = Category(user_id=user.id, name="Empty", kind=CategoryKind.EXPENSE, parent_id=food.id)
    db_session.add_all([groceries, empty])
    db_session.flush()
    for sub_id in (groceries.id, groceries.id, None):
        db_session.add(
            Transaction(
                user_id=user.id,
                type=CategoryKind.EXPENSE,
                date=date(2026, 3, 1),
                amount=Decimal("0.10"),
                category_id=food.id,
                subcategory_id=sub_id,
            )
        )
    db_session.flush()

    result = service.category_totals(db_session, user.id, date(2026, 3, 1), date(2026, 3, 1))

    assert len(result) == 1
    assert result[0].category_id == food.id
    assert result[0].total == Decimal("0.30")
    assert {s.id: s.total for s in result[0].subcategories} == {
        groceries.id: Decimal("0.20"),
        empty.id: Decimal("0.00"),
    }
