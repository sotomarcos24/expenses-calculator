"""Category business logic: the default set every new user starts with."""

from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, User

# Default categories from plan.md §4.2, in display order: (kind, name, subcategory names).
# Inserted in this exact order, so ordering by id reproduces it.
DEFAULT_CATEGORIES: tuple[tuple[CategoryKind, str, tuple[str, ...]], ...] = (
    (CategoryKind.EXPENSE, "Housing", ("Rent", "Mortgage", "Utilities")),
    (CategoryKind.EXPENSE, "Food", ("Groceries", "Restaurants")),
    (CategoryKind.EXPENSE, "Transport", ("Fuel", "Car payment", "Train", "Metro")),
    (CategoryKind.EXPENSE, "Leisure", ("Nightlife", "Travel", "Weekends")),
    (CategoryKind.EXPENSE, "Other", ()),
    (CategoryKind.INCOME, "Salary", ()),
    (CategoryKind.INCOME, "Rental income", ()),
    (CategoryKind.INCOME, "Dividends", ()),
    (CategoryKind.INCOME, "Other income", ()),
)


def seed_default_categories(db: Session, user: User) -> None:
    """Add the default category set for ``user`` to the session.

    Flushes after each top-level category so ids ascend in ``DEFAULT_CATEGORIES`` order, but
    never commits: the caller owns the transaction (registration commits user + categories once).
    """
    for kind, name, subcategory_names in DEFAULT_CATEGORIES:
        parent = Category(user_id=user.id, kind=kind, name=name)
        db.add(parent)
        db.flush()
        for subcategory_name in subcategory_names:
            db.add(Category(user_id=user.id, kind=kind, name=subcategory_name, parent_id=parent.id))
        db.flush()
