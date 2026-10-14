from collections.abc import Callable
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, User
from tests.conftest import JSON_HEADERS, AuthenticatedClient

EXPECTED_TREE = {
    CategoryKind.EXPENSE: [
        ("Housing", ["Rent", "Mortgage", "Utilities"]),
        ("Food", ["Groceries", "Restaurants"]),
        ("Transport", ["Fuel", "Car payment", "Train", "Metro"]),
        ("Leisure", ["Nightlife", "Travel", "Weekends"]),
        ("Other", []),
    ],
    CategoryKind.INCOME: [
        ("Salary", []),
        ("Rental income", []),
        ("Dividends", []),
        ("Other income", []),
    ],
}


def user_categories(db: Session, user_id: int) -> list[Category]:
    db.expire_all()
    return list(db.scalars(select(Category).where(Category.user_id == user_id)))


def tree_by_id(categories: list[Category]) -> dict[CategoryKind, list[tuple[str, list[str]]]]:
    """Rebuild {kind: [(top-level name, [subcategory names])]} ordered by id, from rows only."""
    tops = sorted((c for c in categories if c.parent_id is None), key=lambda c: c.id)
    tree: dict[CategoryKind, list[tuple[str, list[str]]]] = {}
    for top in tops:
        subs = sorted((c for c in categories if c.parent_id == top.id), key=lambda c: c.id)
        tree.setdefault(top.kind, []).append((top.name, [s.name for s in subs]))
    return tree


def test_register_seeds_exactly_the_default_categories(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    categories = user_categories(db_session, auth_client.user_id)
    by_id = {c.id: c for c in categories}

    assert len(categories) == 21
    assert sum(c.parent_id is None for c in categories) == 9
    assert tree_by_id(categories) == EXPECTED_TREE
    for category in categories:
        if category.parent_id is not None:
            parent = by_id[category.parent_id]
            assert parent.parent_id is None
            assert category.kind == parent.kind


def test_seeded_categories_are_in_plan_order_by_id(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    categories = user_categories(db_session, auth_client.user_id)
    tops = sorted((c for c in categories if c.parent_id is None), key=lambda c: c.id)

    assert [c.name for c in tops] == [
        "Housing",
        "Food",
        "Transport",
        "Leisure",
        "Other",
        "Salary",
        "Rental income",
        "Dividends",
        "Other income",
    ]
    transport = next(c for c in tops if c.name == "Transport")
    assert [s.name for s in transport.subcategories] == ["Fuel", "Car payment", "Train", "Metro"]


def test_each_user_gets_independent_categories(
    make_auth_client: Callable[[str], AuthenticatedClient], db_session: Session
) -> None:
    alice = make_auth_client("alice@example.com")
    bob = make_auth_client("bob@example.com")

    for user in (alice, bob):
        categories = user_categories(db_session, user.user_id)
        own_ids = {c.id for c in categories}
        assert len(categories) == 21
        assert tree_by_id(categories) == EXPECTED_TREE
        assert all(c.parent_id is None or c.parent_id in own_ids for c in categories)

    assert db_session.scalar(select(func.count()).select_from(Category)) == 42


def test_register_returns_500_and_leaves_nothing_when_seeding_fails(
    app: FastAPI, db_session: Session
) -> None:
    with (
        patch("app.services.auth.seed_default_categories", side_effect=RuntimeError("boom")),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        response = client.post(
            "/api/auth/register",
            json={"email": "seed-fails@example.com", "password": "secret123"},
            headers=JSON_HEADERS,
        )

    assert response.status_code == 500
    assert db_session.scalar(select(func.count()).select_from(User)) == 0
    assert db_session.scalar(select(func.count()).select_from(Category)) == 0
