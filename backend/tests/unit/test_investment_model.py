from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Investment, InvestmentType, User
from tests.unit.test_category_model import make_user

DAY = date(2026, 10, 1)


def add_investment(db: Session, user: User, *, commit: bool = True, **overrides: Any) -> Investment:
    values: dict[str, Any] = {
        "user_id": user.id,
        "name": "Index fund",
        "type": InvestmentType.FUND,
        "platform": "Broker X",
        "amount_invested": Decimal("1000.00"),
        "current_value": Decimal("1100.00"),
        "value_updated_at": DAY,
    }
    values.update(overrides)
    investment = Investment(**values)
    db.add(investment)
    if commit:
        db.commit()
    return investment


def reload(db: Session, investment: Investment) -> Investment:
    db.expire_all()
    return db.get_one(Investment, investment.id)


def count(db: Session, user: User) -> int:
    query = select(func.count()).select_from(Investment).where(Investment.user_id == user.id)
    return db.scalar(query) or 0


@pytest.mark.parametrize("platform", [None, "Broker X"])
def test_platform_is_optional_and_round_trips(db_session: Session, platform: str | None) -> None:
    user = make_user(db_session)
    investment = add_investment(db_session, user, platform=platform)

    loaded = reload(db_session, investment)

    assert loaded.platform == platform
    if platform is None:
        assert loaded.platform is None


def test_all_fields_round_trip(db_session: Session) -> None:
    user = make_user(db_session)
    investment = add_investment(db_session, user)

    loaded = reload(db_session, investment)

    assert loaded.user_id == user.id
    assert loaded.name == "Index fund"
    assert loaded.type is InvestmentType.FUND
    assert loaded.value_updated_at == DAY
    assert loaded.created_at is not None
    assert loaded.updated_at is not None


@pytest.mark.parametrize(
    "column", ["name", "type", "amount_invested", "current_value", "value_updated_at"]
)
def test_required_column_set_to_none_raises(db_session: Session, column: str) -> None:
    user = make_user(db_session)

    add_investment(db_session, user, commit=False, **{column: None})
    with pytest.raises(IntegrityError):
        db_session.commit()


@pytest.mark.parametrize("column", ["amount_invested", "current_value"])
def test_negative_money_raises(db_session: Session, column: str) -> None:
    user = make_user(db_session)

    add_investment(db_session, user, commit=False, **{column: Decimal("-0.01")})
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_zero_money_is_accepted(db_session: Session) -> None:
    user = make_user(db_session)
    investment = add_investment(
        db_session, user, amount_invested=Decimal("0"), current_value=Decimal("0")
    )

    loaded = reload(db_session, investment)

    assert (loaded.amount_invested, loaded.current_value) == (Decimal("0"), Decimal("0"))


@pytest.mark.parametrize(
    "amount", [Decimal("0.01"), Decimal("1234.56"), Decimal("999999999999.99")]
)
def test_money_round_trips_as_decimal(db_session: Session, amount: Decimal) -> None:
    user = make_user(db_session)
    investment = add_investment(db_session, user, amount_invested=amount, current_value=amount)

    loaded = reload(db_session, investment)

    assert isinstance(loaded.amount_invested, Decimal)
    assert isinstance(loaded.current_value, Decimal)
    assert loaded.amount_invested == amount
    assert loaded.current_value == amount


def test_investment_type_has_the_seven_values() -> None:
    assert [type_.value for type_ in InvestmentType] == [
        "stock",
        "fund",
        "etf",
        "crypto",
        "deposit",
        "real_estate",
        "other",
    ]


@pytest.mark.parametrize("type_", list(InvestmentType))
def test_each_type_round_trips_as_lowercase_value(
    db_session: Session, type_: InvestmentType
) -> None:
    user = make_user(db_session)
    investment = add_investment(db_session, user, type=type_)

    loaded = reload(db_session, investment)
    stored = db_session.execute(
        text("SELECT type FROM investments WHERE id = :id"), {"id": investment.id}
    ).scalar_one()

    assert loaded.type is type_
    assert stored == type_.value


@pytest.mark.parametrize("value", ["bond", "STOCK", "Real estate", ""])
def test_unknown_type_value_raises(db_session: Session, value: str) -> None:
    user = make_user(db_session)

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO investments "
                "(user_id, name, type, amount_invested, current_value, value_updated_at) "
                "VALUES (:user_id, 'Bond', :type, 10, 10, '2026-10-01')"
            ),
            {"user_id": user.id, "type": value},
        )
        db_session.commit()


def test_non_existent_user_raises(db_session: Session) -> None:
    user = make_user(db_session)

    add_investment(db_session, user, commit=False, user_id=9999)
    with pytest.raises(IntegrityError):
        db_session.commit()


@pytest.mark.parametrize("how", ["orm", "sql"])
def test_deleting_user_removes_only_their_investments(db_session: Session, how: str) -> None:
    user = make_user(db_session)
    other_user = make_user(db_session, "other@example.com")
    for owner in (user, other_user):
        add_investment(db_session, owner)
        add_investment(db_session, owner, name="Bitcoin", type=InvestmentType.CRYPTO, platform=None)

    if how == "orm":
        db_session.delete(user)
    else:
        db_session.execute(delete(User).where(User.id == user.id))
    db_session.commit()
    db_session.expire_all()

    assert count(db_session, user) == 0
    assert count(db_session, other_user) == 2


def test_user_has_no_investments_back_reference() -> None:
    assert not hasattr(User, "investments")
