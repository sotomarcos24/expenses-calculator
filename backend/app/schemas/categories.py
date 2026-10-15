from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models import CategoryKind
from app.schemas.money import MoneyOut

# Stripped at both ends, then 1-100 characters. Inner whitespace is kept as typed.
CategoryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: CategoryKind
    parent_id: int | None


class CategoryTreeNode(CategoryRead):
    subcategories: list[CategoryRead]


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName
    kind: CategoryKind
    parent_id: int | None = None


class CategoryUpdate(BaseModel):
    """Rename only: moving a category to another parent or kind is not supported."""

    model_config = ConfigDict(extra="forbid")

    name: CategoryName


class SubcategoryTotals(BaseModel):
    id: int
    total: MoneyOut


class CategoryTotals(BaseModel):
    """Period total of a top-level category: its direct transactions plus its subcategories'."""

    category_id: int
    total: MoneyOut
    subcategories: list[SubcategoryTotals]
