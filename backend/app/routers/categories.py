from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.db import DbSession
from app.models import CategoryKind
from app.schemas.categories import (
    CategoryCreate,
    CategoryRead,
    CategoryTotals,
    CategoryTreeNode,
    CategoryUpdate,
)
from app.security import CurrentUser
from app.services import categories as service

router = APIRouter(prefix="/categories", tags=["categories"])

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
DUPLICATE = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="A category with this name already exists at this level",
)


@router.get("")
def list_categories(
    user: CurrentUser, db: DbSession, kind: CategoryKind | None = None
) -> list[CategoryTreeNode]:
    return [
        CategoryTreeNode.model_validate(category)
        for category in service.list_category_tree(db, user.id, kind)
    ]


@router.get("/totals")
def category_totals(
    user: CurrentUser,
    db: DbSession,
    date_from: Annotated[date, Query(alias="from")],
    date_to: Annotated[date, Query(alias="to")],
) -> list[CategoryTotals]:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="'from' must be on or before 'to'",
        )
    return service.category_totals(db, user.id, date_from, date_to)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, user: CurrentUser, db: DbSession) -> CategoryRead:
    try:
        category = service.create_category(db, user.id, body.name, body.kind, body.parent_id)
    except service.CategoryNotFoundError:
        raise NOT_FOUND from None
    except service.InvalidCategoryParentError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The parent must be a top-level category of the same kind",
        ) from None
    except service.DuplicateCategoryNameError:
        raise DUPLICATE from None
    return CategoryRead.model_validate(category)


@router.patch("/{category_id}")
def rename_category(
    category_id: int, body: CategoryUpdate, user: CurrentUser, db: DbSession
) -> CategoryRead:
    try:
        category = service.rename_category(db, user.id, category_id, body.name)
    except service.CategoryNotFoundError:
        raise NOT_FOUND from None
    except service.DuplicateCategoryNameError:
        raise DUPLICATE from None
    return CategoryRead.model_validate(category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, user: CurrentUser, db: DbSession) -> None:
    try:
        service.delete_category(db, user.id, category_id)
    except service.CategoryNotFoundError:
        raise NOT_FOUND from None
    except service.CategoryHasAmountsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category has monthly amounts; remove them first",
        ) from None
    except service.CategoryInUseError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This category or one of its subcategories has transactions",
        ) from None
