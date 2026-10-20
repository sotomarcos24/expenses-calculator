"""Monthly amounts applied to a period: the months-in-period rule and the per-period sums."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, CategoryAmount, CategoryKind


def months_in_period(date_from: date, date_to: date) -> int:
    """Calendar months touched by ``date_from..date_to``, even partially (single day = 1)."""
    return (date_to.year - date_from.year) * 12 + (date_to.month - date_from.month) + 1


def monthly_amounts(
    db: Session, user_id: int, kind: CategoryKind | None = None
) -> list[tuple[int, int | None, Decimal]]:
    """``(category_id, subcategory_id, amount)`` of the user's monthly amounts, by id."""
    query = select(CategoryAmount.category_id, CategoryAmount.subcategory_id, CategoryAmount.amount)
    query = query.where(CategoryAmount.user_id == user_id).order_by(CategoryAmount.id)
    if kind is not None:
        query = query.join(Category, Category.id == CategoryAmount.category_id).where(
            Category.kind == kind
        )
    return [(cat, sub, Decimal(amount)) for cat, sub, amount in db.execute(query).all()]


def period_amounts(
    db: Session, user_id: int, date_from: date, date_to: date, kind: CategoryKind | None = None
) -> list[tuple[int, int | None, Decimal]]:
    """Like ``monthly_amounts`` with each amount multiplied by the months in the period."""
    months = months_in_period(date_from, date_to)
    return [(cat, sub, amount * months) for cat, sub, amount in monthly_amounts(db, user_id, kind)]
