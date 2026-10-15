"""Dashboard aggregations: period totals, expenses by category and the investments snapshot."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import ColumnElement, Numeric, func, select, type_coerce
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.models import Category, CategoryKind, Investment, Transaction
from app.schemas.dashboard import (
    CategoryTotal,
    Dashboard,
    DashboardInvestments,
    SubcategoryTotal,
    TypeValue,
)
from app.schemas.money import CENT, RATE_STEP
from app.services.investments import compute_totals

NO_SUBCATEGORY = "(none)"


def _sum(column: InstrumentedAttribute[Decimal]) -> ColumnElement[Decimal]:
    return type_coerce(func.sum(column), Numeric(16, 2))


def _money(value: Decimal | None) -> Decimal:
    # SQLite sums as floats: quantizing to cents removes the representation error.
    return Decimal(0).quantize(CENT) if value is None else Decimal(value).quantize(CENT)


def compute_savings_rate(savings: Decimal, income: Decimal) -> Decimal | None:
    """``savings / income`` to 4 decimals half up; ``None`` when there is no income."""
    if income == 0:
        return None
    return (savings / income).quantize(RATE_STEP, rounding=ROUND_HALF_UP)


def _type_totals(db: Session, user_id: int, date_from: date, date_to: date) -> dict[str, Decimal]:
    rows = db.execute(
        select(Transaction.type, _sum(Transaction.amount))
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .group_by(Transaction.type)
    ).all()
    return {str(kind): _money(total) for kind, total in rows}


def _expenses_by_category(
    db: Session, user_id: int, date_from: date, date_to: date
) -> list[CategoryTotal]:
    rows = db.execute(
        select(Transaction.category_id, Transaction.subcategory_id, _sum(Transaction.amount))
        .where(
            Transaction.user_id == user_id,
            Transaction.type == CategoryKind.EXPENSE,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .group_by(Transaction.category_id, Transaction.subcategory_id)
    ).all()
    if not rows:
        return []
    ids = {row[0] for row in rows} | {row[1] for row in rows if row[1] is not None}
    names = dict(
        db.execute(
            select(Category.id, Category.name).where(
                Category.user_id == user_id, Category.id.in_(ids)
            )
        ).all()
    )
    subs: dict[int, list[SubcategoryTotal]] = {}
    for category_id, subcategory_id, total in rows:
        sub_name = NO_SUBCATEGORY if subcategory_id is None else names[subcategory_id]
        subs.setdefault(category_id, []).append(
            SubcategoryTotal(id=subcategory_id, name=sub_name, total=_money(total))
        )
    result: list[CategoryTotal] = []
    for category_id, sub_list in subs.items():
        sub_list.sort(key=lambda s: (-s.total, s.name))
        result.append(
            CategoryTotal(
                category_id=category_id,
                name=names[category_id],
                total=sum((s.total for s in sub_list), Decimal(0)),
                subcategories=sub_list,
            )
        )
    result.sort(key=lambda c: (-c.total, c.name))
    return result


def _investments(db: Session, user_id: int) -> DashboardInvestments:
    investments = list(db.scalars(select(Investment).where(Investment.user_id == user_id)))
    totals = compute_totals(investments)
    by_type: dict[str, Decimal] = {}
    for investment in investments:
        key = str(investment.type)
        by_type[key] = by_type.get(key, Decimal(0)) + investment.current_value
    entries = [TypeValue(type=kind, current_value=value) for kind, value in by_type.items()]
    entries.sort(key=lambda e: (-e.current_value, e.type.value))
    return DashboardInvestments(**totals.model_dump(), by_type=entries)


def build_dashboard(db: Session, user_id: int, date_from: date, date_to: date) -> Dashboard:
    totals = _type_totals(db, user_id, date_from, date_to)
    income = totals.get(CategoryKind.INCOME.value, Decimal(0).quantize(CENT))
    expense = totals.get(CategoryKind.EXPENSE.value, Decimal(0).quantize(CENT))
    savings = income - expense
    return Dashboard(
        income_total=income,
        expense_total=expense,
        savings=savings,
        savings_rate=compute_savings_rate(savings, income),
        expenses_by_category=_expenses_by_category(db, user_id, date_from, date_to),
        investments=_investments(db, user_id),
    )
