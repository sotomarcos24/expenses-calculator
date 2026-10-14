import pytest
from sqlalchemy import Table, delete, func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.engine import Dialect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateIndex

from app.models import Category, CategoryKind, User

EXPENSE = CategoryKind.EXPENSE
INCOME = CategoryKind.INCOME


def make_user(db: Session, email: str = "user@example.com") -> User:
    user = User(email=email, password_hash="not-a-real-hash")
    db.add(user)
    db.commit()
    return user


def add_category(
    db: Session,
    user: User,
    name: str,
    kind: CategoryKind = EXPENSE,
    parent: Category | None = None,
) -> Category:
    category = Category(
        user_id=user.id, name=name, kind=kind, parent_id=parent.id if parent else None
    )
    db.add(category)
    db.commit()
    return category


def category_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Category)) or 0


def top_level_index_ddl(dialect: Dialect) -> str:
    table = Category.__table__
    assert isinstance(table, Table)
    index = next(i for i in table.indexes if i.name == "uq_categories_top_level_name")
    return str(CreateIndex(index).compile(dialect=dialect))


DIALECTS: list[Dialect] = [postgresql.dialect(), sqlite.dialect()]  # type: ignore[no-untyped-call]


@pytest.mark.parametrize("dialect", DIALECTS, ids=["postgresql", "sqlite"])
def test_top_level_index_ddl_is_partial_and_case_insensitive(dialect: Dialect) -> None:
    ddl = top_level_index_ddl(dialect)

    assert ddl.startswith("CREATE UNIQUE INDEX uq_categories_top_level_name ON categories")
    assert "lower(name)" in ddl
    assert "WHERE parent_id IS NULL" in ddl


def test_category_is_persisted_with_kind_value_and_timestamps(db_session: Session) -> None:
    user = make_user(db_session)
    category = add_category(db_session, user, "Food")
    db_session.refresh(category)

    assert category.id is not None
    assert category.parent_id is None
    assert category.created_at is not None
    stored = db_session.connection().exec_driver_sql("SELECT kind FROM categories").scalar_one()
    assert stored == "expense"


def test_duplicate_top_level_name_differing_in_case_raises(db_session: Session) -> None:
    user = make_user(db_session)
    add_category(db_session, user, "Food")

    db_session.add(Category(user_id=user.id, name="food", kind=EXPENSE))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_top_level_name_with_other_kind_or_user_is_allowed(db_session: Session) -> None:
    user = make_user(db_session)
    other_user = make_user(db_session, "other@example.com")
    add_category(db_session, user, "Other")

    add_category(db_session, user, "Other", kind=INCOME)
    add_category(db_session, other_user, "Other")

    assert category_count(db_session) == 3


def test_duplicate_subcategory_under_same_parent_raises(db_session: Session) -> None:
    user = make_user(db_session)
    parent = add_category(db_session, user, "Transport")
    add_category(db_session, user, "Fuel", parent=parent)

    db_session.add(Category(user_id=user.id, name="Fuel", kind=EXPENSE, parent_id=parent.id))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_subcategory_name_under_different_parents_is_allowed(db_session: Session) -> None:
    user = make_user(db_session)
    housing = add_category(db_session, user, "Housing")
    leisure = add_category(db_session, user, "Leisure")

    add_category(db_session, user, "Misc", parent=housing)
    add_category(db_session, user, "Misc", parent=leisure)

    assert category_count(db_session) == 4


def test_deleting_parent_through_orm_removes_subcategories(db_session: Session) -> None:
    user = make_user(db_session)
    parent = add_category(db_session, user, "Transport")
    add_category(db_session, user, "Fuel", parent=parent)
    add_category(db_session, user, "Metro", parent=parent)
    keep = add_category(db_session, user, "Food")

    db_session.delete(parent)
    db_session.commit()

    assert db_session.scalars(select(Category.id)).all() == [keep.id]


def test_deleting_parent_in_db_cascades_to_subcategories(db_session: Session) -> None:
    user = make_user(db_session)
    parent = add_category(db_session, user, "Transport")
    add_category(db_session, user, "Fuel", parent=parent)

    db_session.execute(delete(Category).where(Category.id == parent.id))
    db_session.commit()

    assert category_count(db_session) == 0


def test_subcategories_relationship_is_ordered_by_id(db_session: Session) -> None:
    user = make_user(db_session)
    parent = add_category(db_session, user, "Leisure")
    names = ["Weekends", "Nightlife", "Travel"]
    for name in names:
        add_category(db_session, user, name, parent=parent)
    db_session.expire_all()

    assert [sub.name for sub in parent.subcategories] == names
    assert all(sub.parent is parent for sub in parent.subcategories)


def test_deleting_user_removes_their_categories(db_session: Session) -> None:
    user = make_user(db_session)
    other_user = make_user(db_session, "other@example.com")
    parent = add_category(db_session, user, "Transport")
    add_category(db_session, user, "Fuel", parent=parent)
    kept = add_category(db_session, other_user, "Transport")

    db_session.delete(user)
    db_session.commit()
    db_session.expire_all()

    assert db_session.scalars(select(Category.id)).all() == [kept.id]
