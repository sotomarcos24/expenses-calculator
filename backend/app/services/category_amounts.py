"""Monthly category amounts: CRUD and the per-period sums used by dashboard and totals."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CategoryAmount
from app.schemas.category_amounts import CategoryAmountPut
from app.services.categories import CategoryNotFoundError, get_category


class CategoryAmountNotFoundError(Exception):
    """The amount does not exist or belongs to another user."""


class InvalidCategoryAmountError(Exception):
    """The subcategory is not a child of the category."""


def list_category_amounts(db: Session, user_id: int) -> list[CategoryAmount]:
    return list(
        db.scalars(
            select(CategoryAmount)
            .where(CategoryAmount.user_id == user_id)
            .order_by(CategoryAmount.id)
        )
    )


def put_category_amount(
    db: Session, user_id: int, body: CategoryAmountPut
) -> tuple[CategoryAmount, bool]:
    """Create or update the row for (category, subcategory); returns it and whether it is new."""
    category = get_category(db, user_id, body.category_id)
    if category.parent_id is not None:
        # A subcategory is not valid as category_id: reported like an unknown category.
        raise CategoryNotFoundError
    if body.subcategory_id is not None:
        subcategory = get_category(db, user_id, body.subcategory_id)
        if subcategory.parent_id != category.id:
            raise InvalidCategoryAmountError
    query = select(CategoryAmount).where(
        CategoryAmount.user_id == user_id, CategoryAmount.category_id == body.category_id
    )
    if body.subcategory_id is None:
        query = query.where(CategoryAmount.subcategory_id.is_(None))
    else:
        query = query.where(CategoryAmount.subcategory_id == body.subcategory_id)
    row = db.scalar(query)
    created = row is None
    if row is None:
        row = CategoryAmount(
            user_id=user_id, category_id=body.category_id, subcategory_id=body.subcategory_id
        )
        db.add(row)
    row.amount = body.amount
    row.note = body.note
    db.commit()
    db.refresh(row)
    return row, created


def delete_category_amount(db: Session, user_id: int, amount_id: int) -> None:
    row = db.scalar(
        select(CategoryAmount).where(
            CategoryAmount.id == amount_id, CategoryAmount.user_id == user_id
        )
    )
    if row is None:
        raise CategoryAmountNotFoundError
    db.delete(row)
    db.commit()
