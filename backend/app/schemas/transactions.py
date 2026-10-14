from datetime import date as date_type
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    ValidationInfo,
    field_validator,
)
from pydantic.json_schema import SkipJsonSchema

from app.models import CategoryKind

NOTE_MAX_LENGTH = 500
CENT = Decimal("0.01")
RATE_STEP = Decimal("0.0001")
# Fields a partial update may omit but never set to null.
NOT_NULLABLE = ("type", "date", "amount", "category_id")


def normalize_note(value: str | None) -> str | None:
    """Trim the note at both ends; empty or whitespace-only becomes ``None``.

    Inner whitespace is kept. Raises ``ValueError`` (422) above 500 characters after trimming.
    """
    if value is None:
        return None
    note = value.strip()
    if not note:
        return None
    if len(note) > NOTE_MAX_LENGTH:
        raise ValueError(f"The note must be at most {NOTE_MAX_LENGTH} characters")
    return note


# Request money: a positive decimal with at most 2 decimal places that fits NUMERIC(12, 2).
# Pydantic rejects NaN / Infinity and non-numeric strings for Decimal fields.
MoneyIn = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]

# Response money: always a JSON string with exactly 2 decimals ("10.50").
MoneyOut = Annotated[
    Decimal, PlainSerializer(lambda value: str(value.quantize(CENT)), return_type=str)
]

# Deduction rate: a fraction as a JSON string with 4 decimals ("0.2000").
RateOut = Annotated[
    Decimal, PlainSerializer(lambda value: str(value.quantize(RATE_STEP)), return_type=str)
]

Note = Annotated[str | None, AfterValidator(normalize_note)]


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CategoryKind
    date: date_type
    amount: MoneyIn
    gross_amount: MoneyIn | None = None
    category_id: int
    subcategory_id: int | None = None
    note: Note = None


class TransactionUpdate(BaseModel):
    """Partial update: omitted fields are unchanged, explicit ``null`` clears nullable fields.

    ``type``, ``date``, ``amount`` and ``category_id`` are not nullable, so an explicit ``null``
    is a 422. Their ``None`` default only means "not sent" (it is hidden from the JSON schema),
    and the service reads the sent fields with ``model_dump(exclude_unset=True)``.
    """

    model_config = ConfigDict(extra="forbid")

    type: CategoryKind | SkipJsonSchema[None] = None
    date: date_type | SkipJsonSchema[None] = None
    amount: MoneyIn | SkipJsonSchema[None] = None
    gross_amount: MoneyIn | None = None
    category_id: int | SkipJsonSchema[None] = None
    subcategory_id: int | None = None
    note: Note = None

    @field_validator(*NOT_NULLABLE)
    @classmethod
    def _reject_null(cls, value: object, info: ValidationInfo) -> object:
        # Only runs for values that were sent (defaults are not validated).
        if value is None:
            raise ValueError(f"'{info.field_name}' cannot be null")
        return value


class TransactionRead(BaseModel):
    id: int
    type: CategoryKind
    date: date_type
    amount: MoneyOut
    gross_amount: MoneyOut | None
    deduction_rate: RateOut | None
    category_id: int
    category_name: str
    subcategory_id: int | None
    subcategory_name: str | None
    note: str | None
    created_at: datetime
    updated_at: datetime


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
