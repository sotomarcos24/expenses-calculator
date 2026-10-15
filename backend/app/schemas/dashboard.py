from pydantic import BaseModel

from app.models import InvestmentType
from app.schemas.investments import PortfolioTotals
from app.schemas.money import MoneyOut, RateOut


class SubcategoryTotal(BaseModel):
    id: int | None  # None for the "(none)" entry: expenses without a subcategory
    name: str
    total: MoneyOut


class CategoryTotal(BaseModel):
    category_id: int
    name: str
    total: MoneyOut
    subcategories: list[SubcategoryTotal]


class TypeValue(BaseModel):
    type: InvestmentType
    current_value: MoneyOut


class DashboardInvestments(PortfolioTotals):
    by_type: list[TypeValue]


class Dashboard(BaseModel):
    income_total: MoneyOut
    expense_total: MoneyOut
    savings: MoneyOut
    savings_rate: RateOut | None
    expenses_by_category: list[CategoryTotal]
    investments: DashboardInvestments
