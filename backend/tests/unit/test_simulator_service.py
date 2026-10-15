from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, Investment, InvestmentType, Transaction, User
from app.services import simulator as service

TODAY = date(2026, 6, 15)


def make_user(db: Session, email: str = "u@example.com") -> tuple[User, Category, Category]:
    user = User(email=email, password_hash="x")
    db.add(user)
    db.flush()
    expense = Category(user_id=user.id, name="Food", kind=CategoryKind.EXPENSE)
    income = Category(user_id=user.id, name="Salary", kind=CategoryKind.INCOME)
    db.add_all([expense, income])
    db.flush()
    return user, expense, income


def add_tx(
    db: Session, user: User, category: Category, day: date, amount: str, kind: CategoryKind
) -> None:
    db.add(
        Transaction(
            user_id=user.id,
            type=kind,
            date=day,
            amount=Decimal(amount),
            category_id=category.id,
        )
    )
    db.flush()


def test_month_start_crosses_year_boundary() -> None:
    assert service._month_start(date(2026, 3, 20), 0) == date(2026, 3, 1)
    assert service._month_start(date(2026, 3, 20), 12) == date(2025, 3, 1)
    assert service._month_start(date(2026, 1, 5), 1) == date(2025, 12, 1)


def test_average_is_total_over_months_with_expenses(db_session: Session) -> None:
    user, food, income = make_user(db_session)
    add_tx(db_session, user, food, date(2025, 6, 1), "300.00", CategoryKind.EXPENSE)  # first month
    add_tx(db_session, user, food, date(2025, 9, 10), "400.00", CategoryKind.EXPENSE)
    add_tx(db_session, user, food, date(2025, 9, 20), "200.00", CategoryKind.EXPENSE)
    add_tx(db_session, user, food, date(2026, 5, 31), "900.00", CategoryKind.EXPENSE)  # last month
    # Ignored: current month, older than the window, income.
    add_tx(db_session, user, food, date(2026, 6, 1), "5000.00", CategoryKind.EXPENSE)
    add_tx(db_session, user, food, date(2025, 5, 31), "7000.00", CategoryKind.EXPENSE)
    add_tx(db_session, user, income, date(2025, 9, 1), "9000.00", CategoryKind.INCOME)

    assert service.average_monthly_expenses(db_session, user.id, TODAY) == Decimal("600.00")


def test_average_without_expenses_is_zero(db_session: Session) -> None:
    user, _, income = make_user(db_session)
    add_tx(db_session, user, income, date(2026, 1, 1), "100.00", CategoryKind.INCOME)

    assert service.average_monthly_expenses(db_session, user.id, TODAY) == Decimal("0.00")


def test_average_uses_exact_decimals(db_session: Session) -> None:
    user, food, _ = make_user(db_session)
    for _ in range(3):
        add_tx(db_session, user, food, date(2026, 1, 5), "0.10", CategoryKind.EXPENSE)

    assert service.average_monthly_expenses(db_session, user.id, TODAY) == Decimal("0.30")


def test_defaults_sum_investments_of_the_user_only(db_session: Session) -> None:
    user, _, _ = make_user(db_session)
    other, _, _ = make_user(db_session, "o@example.com")
    for owner, value in ((user, "1000.00"), (user, "500.00"), (other, "99999.00")):
        db_session.add(
            Investment(
                user_id=owner.id,
                name="X",
                type=InvestmentType.ETF,
                amount_invested=Decimal("1.00"),
                current_value=Decimal(value),
                value_updated_at=TODAY,
            )
        )
    db_session.flush()

    defaults = service.build_defaults(db_session, user.id, TODAY)

    assert defaults.starting_amount == Decimal("1500.00")
    assert defaults.inflation_rate == Decimal("0.02")
    assert defaults.avg_monthly_expenses == Decimal("0.00")


def test_defaults_without_investments(db_session: Session) -> None:
    user, _, _ = make_user(db_session)

    assert service.build_defaults(db_session, user.id, TODAY).starting_amount == Decimal("0.00")
