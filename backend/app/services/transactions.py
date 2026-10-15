"""Transaction business logic: validation of the category rules, CRUD and the filtered list."""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Category, CategoryKind, Transaction
from app.schemas.money import RATE_STEP
from app.schemas.transactions import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)
from app.services.categories import CategoryNotFoundError, get_category


class TransactionNotFoundError(Exception):
    """The transaction does not exist or belongs to another user."""


class InvalidTransactionError(Exception):
    """A domain rule failed (category kind/level, subcategory parent, gross amount)."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


__all__ = [
    "CategoryNotFoundError",
    "InvalidTransactionError",
    "TransactionFilters",
    "TransactionNotFoundError",
    "compute_deduction_rate",
    "create_transaction",
    "delete_transaction",
    "get_transaction",
    "list_transactions",
    "to_read",
    "update_transaction",
]


def compute_deduction_rate(amount: Decimal, gross_amount: Decimal | None) -> Decimal | None:
    """``(gross - net) / gross`` quantized to 4 decimals half up; ``None`` without a gross."""
    if gross_amount is None:
        return None
    return ((gross_amount - amount) / gross_amount).quantize(RATE_STEP, rounding=ROUND_HALF_UP)


def to_read(transaction: Transaction) -> TransactionRead:
    subcategory = transaction.subcategory
    return TransactionRead(
        id=transaction.id,
        type=transaction.type,
        date=transaction.date,
        amount=transaction.amount,
        gross_amount=transaction.gross_amount,
        deduction_rate=compute_deduction_rate(transaction.amount, transaction.gross_amount),
        category_id=transaction.category_id,
        category_name=transaction.category.name,
        subcategory_id=transaction.subcategory_id,
        subcategory_name=subcategory.name if subcategory is not None else None,
        note=transaction.note,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
    )


@dataclass(frozen=True)
class _Resolved:
    category: Category
    subcategory: Category | None


def _validate(
    db: Session,
    user_id: int,
    *,
    type_: CategoryKind,
    amount: Decimal,
    gross_amount: Decimal | None,
    category_id: int,
    subcategory_id: int | None,
) -> _Resolved:
    """Check a whole (created or merged) transaction; ownership (404) before domain rules (422)."""
    category = get_category(db, user_id, category_id)
    subcategory = get_category(db, user_id, subcategory_id) if subcategory_id is not None else None

    if category.parent_id is not None:
        raise InvalidTransactionError("The category must be a top-level category")
    if category.kind != type_:
        raise InvalidTransactionError("The category kind must match the transaction type")
    if subcategory is not None and subcategory.parent_id != category.id:
        raise InvalidTransactionError("The subcategory must be a subcategory of the category")
    if gross_amount is not None and type_ != CategoryKind.INCOME:
        raise InvalidTransactionError("Only income transactions can have a gross amount")
    if gross_amount is not None and gross_amount < amount:
        raise InvalidTransactionError(
            "The gross amount must be greater than or equal to the amount"
        )
    return _Resolved(category=category, subcategory=subcategory)


# Load the category and subcategory names with the rows, without N+1 queries.
_LOAD_CATEGORIES = (selectinload(Transaction.category), selectinload(Transaction.subcategory))


def get_transaction(db: Session, user_id: int, transaction_id: int) -> Transaction:
    """Return the user's transaction, or raise ``TransactionNotFoundError`` (also for others')."""
    transaction = db.scalar(
        select(Transaction)
        .where(Transaction.id == transaction_id, Transaction.user_id == user_id)
        .options(*_LOAD_CATEGORIES)
    )
    if transaction is None:
        raise TransactionNotFoundError
    return transaction


def create_transaction(db: Session, user_id: int, body: TransactionCreate) -> Transaction:
    resolved = _validate(
        db,
        user_id,
        type_=body.type,
        amount=body.amount,
        gross_amount=body.gross_amount,
        category_id=body.category_id,
        subcategory_id=body.subcategory_id,
    )
    transaction = Transaction(
        user_id=user_id,
        type=body.type,
        date=body.date,
        amount=body.amount,
        gross_amount=body.gross_amount,
        category=resolved.category,
        subcategory=resolved.subcategory,
        note=body.note,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def update_transaction(
    db: Session, user_id: int, transaction_id: int, body: TransactionUpdate
) -> Transaction:
    """Apply a partial update after re-validating the merged transaction as a whole.

    Nothing is changed on the row unless the merged values pass every rule.
    """
    transaction = get_transaction(db, user_id, transaction_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if not changes:
        return transaction

    merged: dict[str, Any] = {
        "type": transaction.type,
        "date": transaction.date,
        "amount": transaction.amount,
        "gross_amount": transaction.gross_amount,
        "category_id": transaction.category_id,
        "subcategory_id": transaction.subcategory_id,
        "note": transaction.note,
    }
    merged.update(changes)
    resolved = _validate(
        db,
        user_id,
        type_=merged["type"],
        amount=merged["amount"],
        gross_amount=merged["gross_amount"],
        category_id=merged["category_id"],
        subcategory_id=merged["subcategory_id"],
    )

    transaction.type = merged["type"]
    transaction.date = merged["date"]
    transaction.amount = merged["amount"]
    transaction.gross_amount = merged["gross_amount"]
    transaction.category = resolved.category
    transaction.subcategory = resolved.subcategory
    transaction.note = merged["note"]
    db.commit()
    db.refresh(transaction)
    return transaction


def delete_transaction(db: Session, user_id: int, transaction_id: int) -> None:
    transaction = get_transaction(db, user_id, transaction_id)
    db.delete(transaction)
    db.commit()


@dataclass(frozen=True)
class TransactionFilters:
    """List filters; every one is optional and they combine with AND. Dates are inclusive."""

    date_from: date | None = None
    date_to: date | None = None
    type: CategoryKind | None = None
    category_id: int | None = None
    subcategory_id: int | None = None


def list_transactions(
    db: Session, user_id: int, filters: TransactionFilters, page: int, page_size: int
) -> tuple[list[Transaction], int]:
    """One page of the user's transactions (date desc, id desc) and the total before paging.

    A category or subcategory id that does not exist or belongs to another user simply matches
    no rows, since every query is restricted to ``user_id`` first.
    """
    conditions: list[ColumnElement[bool]] = [Transaction.user_id == user_id]
    if filters.date_from is not None:
        conditions.append(Transaction.date >= filters.date_from)
    if filters.date_to is not None:
        conditions.append(Transaction.date <= filters.date_to)
    if filters.type is not None:
        conditions.append(Transaction.type == filters.type)
    if filters.category_id is not None:
        conditions.append(Transaction.category_id == filters.category_id)
    if filters.subcategory_id is not None:
        conditions.append(Transaction.subcategory_id == filters.subcategory_id)

    total = db.scalar(select(func.count()).select_from(Transaction).where(*conditions)) or 0
    query = (
        select(Transaction)
        .where(*conditions)
        .options(*_LOAD_CATEGORIES)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(db.scalars(query)), total
