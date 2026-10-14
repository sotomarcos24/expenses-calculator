from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.db import DbSession
from app.models import CategoryKind
from app.schemas.transactions import (
    TransactionCreate,
    TransactionPage,
    TransactionRead,
    TransactionUpdate,
)
from app.security import CurrentUser
from app.services import transactions as service

router = APIRouter(prefix="/transactions", tags=["transactions"])

TRANSACTION_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
)
CATEGORY_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
)


def _invalid(error: service.InvalidTransactionError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=error.detail)


@router.get("")
def list_transactions(
    user: CurrentUser,
    db: DbSession,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    type: CategoryKind | None = None,
    category_id: int | None = None,
    subcategory_id: int | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> TransactionPage:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="'from' must be on or before 'to'",
        )
    filters = service.TransactionFilters(
        date_from=date_from,
        date_to=date_to,
        type=type,
        category_id=category_id,
        subcategory_id=subcategory_id,
    )
    items, total = service.list_transactions(db, user.id, filters, page, page_size)
    return TransactionPage(items=[service.to_read(item) for item in items], total=total)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionCreate, user: CurrentUser, db: DbSession
) -> TransactionRead:
    try:
        transaction = service.create_transaction(db, user.id, body)
    except service.CategoryNotFoundError:
        raise CATEGORY_NOT_FOUND from None
    except service.InvalidTransactionError as error:
        raise _invalid(error) from None
    return service.to_read(transaction)


@router.get("/{transaction_id}")
def get_transaction(transaction_id: int, user: CurrentUser, db: DbSession) -> TransactionRead:
    try:
        transaction = service.get_transaction(db, user.id, transaction_id)
    except service.TransactionNotFoundError:
        raise TRANSACTION_NOT_FOUND from None
    return service.to_read(transaction)


@router.patch("/{transaction_id}")
def update_transaction(
    transaction_id: int, body: TransactionUpdate, user: CurrentUser, db: DbSession
) -> TransactionRead:
    try:
        transaction = service.update_transaction(db, user.id, transaction_id, body)
    except service.TransactionNotFoundError:
        raise TRANSACTION_NOT_FOUND from None
    except service.CategoryNotFoundError:
        raise CATEGORY_NOT_FOUND from None
    except service.InvalidTransactionError as error:
        raise _invalid(error) from None
    return service.to_read(transaction)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, user: CurrentUser, db: DbSession) -> None:
    try:
        service.delete_transaction(db, user.id, transaction_id)
    except service.TransactionNotFoundError:
        raise TRANSACTION_NOT_FOUND from None
