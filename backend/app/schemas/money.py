"""Shared money and rate types for API responses: Decimal values serialized as strings."""

from decimal import Decimal
from typing import Annotated

from pydantic import PlainSerializer

CENT = Decimal("0.01")
RATE_STEP = Decimal("0.0001")

# Response money: always a JSON string with exactly 2 decimals ("10.50").
MoneyOut = Annotated[
    Decimal, PlainSerializer(lambda value: str(value.quantize(CENT)), return_type=str)
]

# A fraction (rate or percentage) as a JSON string with 4 decimals ("0.2000" = 20 %).
RateOut = Annotated[
    Decimal, PlainSerializer(lambda value: str(value.quantize(RATE_STEP)), return_type=str)
]
