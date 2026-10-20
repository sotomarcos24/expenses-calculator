from pydantic import BaseModel, ConfigDict

from app.schemas.money import MoneyOut
from app.schemas.transactions import MoneyIn, Note


class CategoryAmountPut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: int
    subcategory_id: int | None = None
    amount: MoneyIn
    note: Note = None


class CategoryAmountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    subcategory_id: int | None
    amount: MoneyOut
    note: str | None
