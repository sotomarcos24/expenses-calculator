from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, User
from app.services.auth import register_user
from app.services.categories import DEFAULT_CATEGORIES


def test_default_categories_match_plan() -> None:
    expense = [(name, subs) for kind, name, subs in DEFAULT_CATEGORIES if kind == "expense"]
    income = [(name, subs) for kind, name, subs in DEFAULT_CATEGORIES if kind == "income"]

    assert expense == [
        ("Housing", ("Rent", "Mortgage", "Utilities")),
        ("Food", ("Groceries", "Restaurants")),
        ("Transport", ("Fuel", "Car payment", "Train", "Metro")),
        ("Leisure", ("Nightlife", "Travel", "Weekends")),
        ("Other", ()),
    ]
    assert income == [
        ("Salary", ()),
        ("Rental income", ()),
        ("Dividends", ()),
        ("Other income", ()),
    ]


def test_register_rolls_back_user_when_seeding_fails(db_session: Session) -> None:
    with (
        patch("app.services.auth.seed_default_categories", side_effect=RuntimeError("boom")),
        pytest.raises(RuntimeError, match="boom"),
    ):
        register_user(db_session, "seed-fails@example.com", "secret123")

    assert db_session.scalar(select(func.count()).select_from(User)) == 0
    assert db_session.scalar(select(func.count()).select_from(Category)) == 0


def test_register_rolls_back_partial_seed(db_session: Session) -> None:
    from app.services import categories

    real_seed = categories.seed_default_categories

    def seed_then_fail(db: Session, user: User) -> None:
        real_seed(db, user)  # categories flushed into the transaction
        raise RuntimeError("boom")

    with (
        patch("app.services.auth.seed_default_categories", side_effect=seed_then_fail),
        pytest.raises(RuntimeError),
    ):
        register_user(db_session, "partial@example.com", "secret123")

    assert db_session.scalar(select(func.count()).select_from(User)) == 0
    assert db_session.scalar(select(func.count()).select_from(Category)) == 0
