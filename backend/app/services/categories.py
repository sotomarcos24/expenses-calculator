"""Category business logic: the default set, the tree, create, rename and delete."""

from collections.abc import Sequence

from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import Category, CategoryKind, Transaction, User

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


class CategoryNotFoundError(Exception):
    """The category (or the requested parent) does not exist or belongs to another user."""


class InvalidCategoryParentError(Exception):
    """The parent is a subcategory (no third level) or has a different kind."""


class DuplicateCategoryNameError(Exception):
    """Another category at the same level already has this name (case-insensitive)."""


class CategoryInUseError(Exception):
    """The category or one of its subcategories has transactions."""


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


def list_category_tree(
    db: Session, user_id: int, kind: CategoryKind | None = None
) -> list[Category]:
    """Top-level categories of the user ordered by id, with subcategories eagerly loaded."""
    query = (
        select(Category)
        .where(Category.user_id == user_id, Category.parent_id.is_(None))
        .options(selectinload(Category.subcategories))
        .order_by(Category.id)
    )
    if kind is not None:
        query = query.where(Category.kind == kind)
    return list(db.scalars(query))


def get_category(db: Session, user_id: int, category_id: int) -> Category:
    """Return the user's category, or raise ``CategoryNotFoundError`` (also for other users')."""
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if category is None:
        raise CategoryNotFoundError
    return category


def _name_taken(
    db: Session,
    user_id: int,
    kind: CategoryKind,
    parent_id: int | None,
    name: str,
    exclude_id: int | None = None,
) -> bool:
    """Case-insensitive duplicate check at one level, with the DB's ``lower()`` semantics."""
    query = select(Category.id).where(
        Category.user_id == user_id,
        Category.kind == kind,
        func.lower(Category.name) == func.lower(name),
    )
    if parent_id is None:
        query = query.where(Category.parent_id.is_(None))
    else:
        query = query.where(Category.parent_id == parent_id)
    if exclude_id is not None:
        query = query.where(Category.id != exclude_id)
    return db.scalar(query.limit(1)) is not None


def _commit_or_duplicate(db: Session) -> None:
    """Commit; a unique-constraint race is rolled back and reported as a duplicate name."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCategoryNameError from exc


def create_category(
    db: Session, user_id: int, name: str, kind: CategoryKind, parent_id: int | None
) -> Category:
    if parent_id is not None:
        parent = get_category(db, user_id, parent_id)
        if parent.parent_id is not None or parent.kind != kind:
            raise InvalidCategoryParentError
    if _name_taken(db, user_id, kind, parent_id, name):
        raise DuplicateCategoryNameError
    category = Category(user_id=user_id, name=name, kind=kind, parent_id=parent_id)
    db.add(category)
    _commit_or_duplicate(db)
    db.refresh(category)
    return category


def rename_category(db: Session, user_id: int, category_id: int, name: str) -> Category:
    category = get_category(db, user_id, category_id)
    if _name_taken(db, user_id, category.kind, category.parent_id, name, exclude_id=category.id):
        raise DuplicateCategoryNameError
    category.name = name
    _commit_or_duplicate(db)
    db.refresh(category)
    return category


def category_ids_in_use(db: Session, user_id: int, category_ids: Sequence[int]) -> bool:
    """Whether any of the user's transactions references one of these categories.

    A category is in use when a transaction of ``user_id`` has it as ``category_id`` or
    ``subcategory_id``. A single ``EXISTS`` query; no rows are loaded.
    """
    if not category_ids:
        return False
    query = select(
        exists().where(
            Transaction.user_id == user_id,
            or_(
                Transaction.category_id.in_(category_ids),
                Transaction.subcategory_id.in_(category_ids),
            ),
        )
    )
    return bool(db.scalar(query))


def delete_category(db: Session, user_id: int, category_id: int) -> None:
    """Delete the category and its subcategories, unless any of them has transactions.

    The FK on ``transactions`` is the safety net: if a transaction was created between the
    check and the delete, the commit fails, is rolled back and is reported as in use too.
    """
    category = get_category(db, user_id, category_id)
    ids = [category.id, *(sub.id for sub in category.subcategories)]
    if category_ids_in_use(db, user_id, ids):
        raise CategoryInUseError
    if category.parent is not None:
        # Keep an already loaded parent collection in sync (expire_on_commit is off).
        category.parent.subcategories.remove(category)
    db.delete(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CategoryInUseError from exc
