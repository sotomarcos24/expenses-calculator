from fastapi import APIRouter, HTTPException, Response, status

from app.db import DbSession
from app.schemas.category_amounts import CategoryAmountPut, CategoryAmountRead
from app.security import CurrentUser
from app.services import category_amounts as service
from app.services.categories import CategoryNotFoundError

router = APIRouter(prefix="/category-amounts", tags=["category-amounts"])


@router.get("")
def list_category_amounts(user: CurrentUser, db: DbSession) -> list[CategoryAmountRead]:
    return [
        CategoryAmountRead.model_validate(row) for row in service.list_category_amounts(db, user.id)
    ]


@router.put("", responses={201: {"model": CategoryAmountRead}})
def put_category_amount(
    body: CategoryAmountPut, user: CurrentUser, db: DbSession, response: Response
) -> CategoryAmountRead:
    try:
        row, created = service.put_category_amount(db, user.id, body)
    except CategoryNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        ) from None
    except service.InvalidCategoryAmountError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The subcategory must belong to the category",
        ) from None
    if created:
        response.status_code = status.HTTP_201_CREATED
    return CategoryAmountRead.model_validate(row)


@router.delete("/{amount_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category_amount(amount_id: int, user: CurrentUser, db: DbSession) -> None:
    try:
        service.delete_category_amount(db, user.id, amount_id)
    except service.CategoryAmountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Monthly amount not found"
        ) from None
