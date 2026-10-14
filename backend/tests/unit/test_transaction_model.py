from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import ForeignKey, Table, delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, Transaction, User
from tests.unit.test_category_model import add_category, make_user

EXPENSE = CategoryKind.EXPENSE
INCOME = CategoryKind.INCOME
DAY = date(2026, 10, 1)


def add_transaction(
    db: Session,
    user: User,
    category: Category,
    amount: Decimal = Decimal("10.00"),
    *,
    type_: CategoryKind = EXPENSE,
    gross_amount: Decimal | None = None,
    subcategory: Category | None = None,
    commit: bool = True,
) -> Transaction:
    transaction = Transaction(
        user_id=user.id,
        type=type_,
        date=DAY,
        amount=amount,
        gross_amount=gross_amount,
        category_id=category.id,
        subcategory_id=subcategory.id if subcategory else None,
    )
    db.add(transaction)
    if commit:
        db.commit()
    return transaction


def count(db: Session, model: type[Category] | type[Transaction], user: User) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.user_id == user.id)) or 0


def foreign_key(column: str) -> ForeignKey:
    table = Transaction.__table__
    assert isinstance(table, Table)
    foreign_keys: set[ForeignKey] = table.c[column].foreign_keys
    return next(iter(foreign_keys))


@pytest.mark.parametrize("amount", [Decimal("0.10"), Decimal("1234.50"), Decimal("9999999999.99")])
def test_expense_amount_round_trips_as_decimal(db_session: Session, amount: Decimal) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")
    transaction = add_transaction(db_session, user, food, amount)

    db_session.expire_all()
    loaded = db_session.scalars(select(Transaction).where(Transaction.id == transaction.id)).one()

    assert isinstance(loaded.amount, Decimal)
    assert loaded.amount == amount
    assert loaded.gross_amount is None
    assert loaded.type is EXPENSE
    assert loaded.date == DAY


@pytest.mark.parametrize(
    ("net", "gross"),
    [
        (Decimal("0.10"), Decimal("0.10")),
        (Decimal("1234.50"), Decimal("1500.00")),
        (Decimal("2400.00"), Decimal("9999999999.99")),
    ],
)
def test_income_with_gross_amount_round_trips_as_decimal(
    db_session: Session, net: Decimal, gross: Decimal
) -> None:
    user = make_user(db_session)
    salary = add_category(db_session, user, "Salary", kind=INCOME)
    transaction = add_transaction(db_session, user, salary, net, type_=INCOME, gross_amount=gross)

    db_session.expire_all()
    loaded = db_session.get_one(Transaction, transaction.id)

    assert isinstance(loaded.amount, Decimal)
    assert isinstance(loaded.gross_amount, Decimal)
    assert (loaded.amount, loaded.gross_amount) == (net, gross)


def test_type_is_stored_as_lowercase_value(db_session: Session) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")
    salary = add_category(db_session, user, "Salary", kind=INCOME)
    add_transaction(db_session, user, food)
    add_transaction(db_session, user, salary, type_=INCOME)

    stored = (
        db_session.connection()
        .exec_driver_sql("SELECT type FROM transactions ORDER BY id")
        .scalars()
        .all()
    )
    assert stored == ["expense", "income"]


@pytest.mark.parametrize("amount", [Decimal("0"), Decimal("-5.00")])
def test_non_positive_amount_raises(db_session: Session, amount: Decimal) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")

    add_transaction(db_session, user, food, amount, commit=False)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_gross_amount_below_net_raises(db_session: Session) -> None:
    user = make_user(db_session)
    salary = add_category(db_session, user, "Salary", kind=INCOME)

    add_transaction(
        db_session,
        user,
        salary,
        Decimal("2400.00"),
        type_=INCOME,
        gross_amount=Decimal("2000.00"),
        commit=False,
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_gross_amount_on_expense_raises(db_session: Session) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")

    add_transaction(
        db_session, user, food, Decimal("10.00"), gross_amount=Decimal("12.00"), commit=False
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_gross_amount_equal_to_net_is_accepted(db_session: Session) -> None:
    user = make_user(db_session)
    salary = add_category(db_session, user, "Salary", kind=INCOME)

    add_transaction(
        db_session, user, salary, Decimal("2400.00"), type_=INCOME, gross_amount=Decimal("2400.00")
    )

    assert count(db_session, Transaction, user) == 1


def test_unknown_type_value_raises(db_session: Session) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO transactions (user_id, type, date, amount, category_id) "
                "VALUES (:user_id, 'refund', '2026-10-01', 10, :category_id)"
            ),
            {"user_id": user.id, "category_id": food.id},
        )
        db_session.commit()


@pytest.mark.parametrize("column", ["category_id", "subcategory_id"])
def test_non_existent_category_raises(db_session: Session, column: str) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")

    transaction = add_transaction(db_session, user, food, commit=False)
    setattr(transaction, column, 9999)
    with pytest.raises(IntegrityError):
        db_session.commit()


@pytest.mark.parametrize("how", ["orm", "sql"])
def test_deleting_category_in_use_raises_and_keeps_data(db_session: Session, how: str) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")
    transaction = add_transaction(db_session, user, food)

    with pytest.raises(IntegrityError):
        if how == "orm":
            db_session.delete(food)
        else:
            db_session.execute(delete(Category).where(Category.id == food.id))
        db_session.commit()
    db_session.rollback()
    db_session.expire_all()

    assert db_session.get(Category, food.id) is not None
    kept = db_session.get_one(Transaction, transaction.id)
    assert kept.category_id == food.id


def test_deleting_subcategory_in_use_raises_and_keeps_transaction(db_session: Session) -> None:
    user = make_user(db_session)
    transport = add_category(db_session, user, "Transport")
    fuel = add_category(db_session, user, "Fuel", parent=transport)
    transaction = add_transaction(db_session, user, transport, subcategory=fuel)

    db_session.delete(fuel)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
    db_session.expire_all()

    kept = db_session.get_one(Transaction, transaction.id)
    assert (kept.category_id, kept.subcategory_id) == (transport.id, fuel.id)
    assert db_session.get(Category, fuel.id) is not None


def test_deleting_parent_of_subcategory_in_use_raises(db_session: Session) -> None:
    user = make_user(db_session)
    transport = add_category(db_session, user, "Transport")
    fuel = add_category(db_session, user, "Fuel", parent=transport)
    other = add_category(db_session, user, "Other")
    add_transaction(db_session, user, other, subcategory=fuel)

    db_session.delete(transport)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_unused_category_still_cascades_to_subcategories(db_session: Session) -> None:
    user = make_user(db_session)
    transport = add_category(db_session, user, "Transport")
    add_category(db_session, user, "Fuel", parent=transport)
    food = add_category(db_session, user, "Food")
    add_transaction(db_session, user, food)

    db_session.delete(transport)
    db_session.commit()

    assert db_session.scalars(select(Category.id)).all() == [food.id]


def test_deleting_user_removes_their_categories_and_transactions(db_session: Session) -> None:
    user = make_user(db_session)
    other_user = make_user(db_session, "other@example.com")
    for owner in (user, other_user):
        transport = add_category(db_session, owner, "Transport")
        fuel = add_category(db_session, owner, "Fuel", parent=transport)
        salary = add_category(db_session, owner, "Salary", kind=INCOME)
        add_transaction(db_session, owner, transport, subcategory=fuel)
        add_transaction(db_session, owner, salary, type_=INCOME, gross_amount=Decimal("12.00"))

    db_session.delete(user)
    db_session.commit()
    db_session.expire_all()

    assert count(db_session, Category, user) == 0
    assert count(db_session, Transaction, user) == 0
    assert count(db_session, Category, other_user) == 3
    assert count(db_session, Transaction, other_user) == 2


def test_deleting_user_in_sql_cascades(db_session: Session) -> None:
    user = make_user(db_session)
    food = add_category(db_session, user, "Food")
    add_transaction(db_session, user, food)

    db_session.execute(delete(User).where(User.id == user.id))
    db_session.commit()

    assert count(db_session, Category, user) == 0
    assert count(db_session, Transaction, user) == 0


def test_foreign_key_on_delete_actions() -> None:
    assert foreign_key("user_id").ondelete == "CASCADE"
    assert foreign_key("category_id").ondelete is None
    assert foreign_key("subcategory_id").ondelete is None


def test_category_relationships_load_the_right_categories(db_session: Session) -> None:
    user = make_user(db_session)
    transport = add_category(db_session, user, "Transport")
    fuel = add_category(db_session, user, "Fuel", parent=transport)
    transaction = add_transaction(db_session, user, transport, subcategory=fuel)
    plain = add_transaction(db_session, user, transport)
    db_session.expire_all()

    assert transaction.category.id == transport.id
    assert transaction.subcategory is not None
    assert transaction.subcategory.id == fuel.id
    assert plain.subcategory is None
    assert not hasattr(Category, "transactions")
