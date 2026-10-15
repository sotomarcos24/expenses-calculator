from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, Transaction
from app.services import categories as service
from tests.conftest import JSON_HEADERS, AuthenticatedClient

DUPLICATE = {"detail": "A category with this name already exists at this level"}
NOT_FOUND = {"detail": "Category not found"}
IN_USE = {"detail": "This category or one of its subcategories has transactions"}

EXPECTED_EXPENSE: list[tuple[str, list[str]]] = [
    ("Housing", ["Rent", "Mortgage", "Utilities"]),
    ("Food", ["Groceries", "Restaurants"]),
    ("Transport", ["Fuel", "Car payment", "Train", "Metro"]),
    ("Leisure", ["Nightlife", "Travel", "Weekends"]),
    ("Other", []),
]
EXPECTED_INCOME: list[tuple[str, list[str]]] = [
    ("Salary", []),
    ("Rental income", []),
    ("Dividends", []),
    ("Other income", []),
]


def get_tree(client: TestClient, kind: str | None = None) -> list[dict[str, Any]]:
    params = {"kind": kind} if kind else None
    response = client.get("/api/categories", params=params)
    assert response.status_code == 200, response.text
    tree: list[dict[str, Any]] = response.json()
    return tree


def shape(tree: list[dict[str, Any]]) -> list[tuple[str, list[str]]]:
    return [(node["name"], [sub["name"] for sub in node["subcategories"]]) for node in tree]


def ids(client: TestClient) -> dict[str, int]:
    """Map every category name of the user to its id (default names are unique)."""
    result: dict[str, int] = {}
    for node in get_tree(client):
        result[node["name"]] = node["id"]
        for sub in node["subcategories"]:
            result[sub["name"]] = sub["id"]
    return result


def post(client: TestClient, **body: Any) -> Any:
    return client.post("/api/categories", json=body)


def patch(client: TestClient, category_id: int | str, body: dict[str, Any]) -> Any:
    return client.patch(f"/api/categories/{category_id}", json=body)


def delete(client: TestClient, category_id: int | str) -> Any:
    return client.delete(f"/api/categories/{category_id}", headers=JSON_HEADERS)


def db_names(db: Session, user_id: int) -> set[str]:
    db.expire_all()
    return set(db.scalars(select(Category.name).where(Category.user_id == user_id)))


# --- Tree -------------------------------------------------------------------------------------


def test_tree_after_register_is_the_default_set(auth_client: AuthenticatedClient) -> None:
    tree = get_tree(auth_client.client)
    expense = [n for n in tree if n["kind"] == "expense"]
    income = [n for n in tree if n["kind"] == "income"]
    assert shape(expense) == EXPECTED_EXPENSE
    assert shape(income) == EXPECTED_INCOME
    # Both kinds, ordered by id: all expense top-levels were seeded first.
    assert shape(tree) == EXPECTED_EXPENSE + EXPECTED_INCOME
    for node in tree:
        assert set(node) == {"id", "name", "kind", "parent_id", "subcategories"}
        assert node["parent_id"] is None
        for sub in node["subcategories"]:
            assert set(sub) == {"id", "name", "kind", "parent_id"}
            assert sub["parent_id"] == node["id"]
            assert sub["kind"] == node["kind"]


def test_tree_filters_by_kind(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    assert shape(get_tree(client, "expense")) == EXPECTED_EXPENSE
    assert shape(get_tree(client, "income")) == EXPECTED_INCOME
    assert client.get("/api/categories", params={"kind": "foo"}).status_code == 422


def test_new_categories_appear_last(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    assert post(client, name="Health", kind="expense").status_code == 201
    assert post(client, name="Bonus", kind="income").status_code == 201
    assert (
        post(client, name="Dentist", kind="expense", parent_id=ids(client)["Food"]).status_code
        == 201
    )

    expense = shape(get_tree(client, "expense"))
    assert expense[-1] == ("Health", [])
    assert expense[1] == ("Food", ["Groceries", "Restaurants", "Dentist"])
    assert shape(get_tree(client, "income"))[-1] == ("Bonus", [])


# --- Create -----------------------------------------------------------------------------------


def test_create_top_level(auth_client: AuthenticatedClient) -> None:
    response = post(auth_client.client, name="Health", kind="expense")
    assert response.status_code == 201
    body = response.json()
    assert body == {"id": body["id"], "name": "Health", "kind": "expense", "parent_id": None}


def test_create_subcategory_trims_name(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    health_id = post(client, name="Health", kind="expense").json()["id"]
    response = post(client, name="  Gym  ", kind="expense", parent_id=health_id)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Gym"
    assert body["parent_id"] == health_id
    assert ("Health", ["Gym"]) in shape(get_tree(client))


def test_create_rejects_third_level(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    response = post(client, name="Organic", kind="expense", parent_id=ids(client)["Groceries"])
    assert response.status_code == 422
    assert "Organic" not in ids(client)


def test_create_rejects_kind_mismatch(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    response = post(client, name="Bonus", kind="income", parent_id=ids(client)["Food"])
    assert response.status_code == 422
    assert "Bonus" not in ids(client)


@pytest.mark.parametrize("name", ["", "   ", "x" * 101, " " + "x" * 101 + " "])
def test_create_rejects_invalid_names(auth_client: AuthenticatedClient, name: str) -> None:
    assert post(auth_client.client, name=name, kind="expense").status_code == 422


def test_create_accepts_100_characters(auth_client: AuthenticatedClient) -> None:
    name = "x" * 100
    response = post(auth_client.client, name=f"  {name}  ", kind="expense")
    assert response.status_code == 201
    assert response.json()["name"] == name


def test_create_keeps_inner_whitespace(auth_client: AuthenticatedClient) -> None:
    response = post(auth_client.client, name=" Pet  care ", kind="expense")
    assert response.status_code == 201
    assert response.json()["name"] == "Pet  care"


@pytest.mark.parametrize(
    "body",
    [
        {"name": "X", "kind": "expense", "color": "red"},
        {"name": "X"},
        {"kind": "expense"},
        {"name": "X", "kind": "savings"},
    ],
)
def test_create_rejects_invalid_bodies(
    auth_client: AuthenticatedClient, body: dict[str, Any]
) -> None:
    client = auth_client.client
    assert client.post("/api/categories", json=body).status_code == 422
    assert "X" not in ids(client)


# --- Duplicates -------------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["food", " FOOD ", "Food"])
def test_create_duplicate_top_level(auth_client: AuthenticatedClient, name: str) -> None:
    response = post(auth_client.client, name=name, kind="expense")
    assert response.status_code == 409
    assert response.json() == DUPLICATE


def test_create_duplicate_subcategory(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    response = post(client, name="groceries", kind="expense", parent_id=ids(client)["Food"])
    assert response.status_code == 409
    assert response.json() == DUPLICATE


def test_create_same_name_at_other_level_is_not_a_duplicate(
    auth_client: AuthenticatedClient,
) -> None:
    client = auth_client.client
    housing_id = ids(client)["Housing"]
    assert post(client, name="Other", kind="income").status_code == 201
    assert post(client, name="Groceries", kind="expense", parent_id=housing_id).status_code == 201
    assert post(client, name="Food", kind="expense", parent_id=housing_id).status_code == 201
    housing = next(n for n in get_tree(client, "expense") if n["id"] == housing_id)
    assert [s["name"] for s in housing["subcategories"]][-2:] == ["Groceries", "Food"]


def test_rename_to_duplicate(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    category_ids = ids(client)
    response = patch(client, category_ids["Transport"], {"name": "food"})
    assert response.status_code == 409
    assert response.json() == DUPLICATE
    response = patch(client, category_ids["Fuel"], {"name": "METRO"})
    assert response.status_code == 409
    assert response.json() == DUPLICATE
    assert {"Transport", "Fuel"} <= set(ids(client))


@pytest.mark.parametrize("name", ["Food", "FOOD"])
def test_rename_to_itself_or_case_change(auth_client: AuthenticatedClient, name: str) -> None:
    client = auth_client.client
    response = patch(client, ids(client)["Food"], {"name": name})
    assert response.status_code == 200
    assert response.json()["name"] == name


def test_db_constraint_race_returns_409(
    auth_client: AuthenticatedClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = auth_client.client
    monkeypatch.setattr(service, "_name_taken", lambda *args, **kwargs: False)
    response = post(client, name="food", kind="expense")
    assert response.status_code == 409
    assert response.json() == DUPLICATE
    # Rename into a top-level duplicate also hits the partial index.
    response = patch(client, ids(client)["Transport"], {"name": "HOUSING"})
    assert response.status_code == 409
    assert response.json() == DUPLICATE
    # The session is still usable.
    assert post(client, name="Health", kind="expense").status_code == 201
    assert shape(get_tree(client, "expense"))[-1] == ("Health", [])


# --- Rename -----------------------------------------------------------------------------------


def test_rename_trims_and_keeps_position(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    restaurants_id = ids(client)["Restaurants"]
    response = patch(client, restaurants_id, {"name": "  Eating out  "})
    assert response.status_code == 200
    assert response.json() == {
        "id": restaurants_id,
        "name": "Eating out",
        "kind": "expense",
        "parent_id": ids(client)["Food"],
    }
    assert shape(get_tree(client, "expense"))[1] == ("Food", ["Groceries", "Eating out"])


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 101},
        {"name": "X", "parent_id": 1},
        {"name": "X", "kind": "income"},
    ],
)
def test_rename_rejects_invalid_bodies(
    auth_client: AuthenticatedClient, body: dict[str, Any]
) -> None:
    client = auth_client.client
    before = get_tree(client)
    food_id = ids(client)["Food"]
    assert patch(client, food_id, body).status_code == 422
    assert get_tree(client) == before


# --- Delete -----------------------------------------------------------------------------------


def test_delete_top_level_cascades(auth_client: AuthenticatedClient, db_session: Session) -> None:
    client = auth_client.client
    response = delete(client, ids(client)["Food"])
    assert response.status_code == 204
    assert response.content == b""
    remaining = ids(client)
    assert not {"Food", "Groceries", "Restaurants"} & set(remaining)
    assert not {"Food", "Groceries", "Restaurants"} & db_names(db_session, auth_client.user_id)
    assert len(db_names(db_session, auth_client.user_id)) == 21 - 3


def test_delete_subcategory_leaves_parent_and_siblings(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    assert delete(client, ids(client)["Fuel"]).status_code == 204
    assert shape(get_tree(client, "expense"))[2] == ("Transport", ["Car payment", "Train", "Metro"])


def add_transaction(
    db: Session,
    user_id: int,
    category_id: int,
    subcategory_id: int | None = None,
    kind: CategoryKind = CategoryKind.EXPENSE,
) -> int:
    """Insert a transaction directly with the ORM and return its id."""
    transaction = Transaction(
        user_id=user_id,
        type=kind,
        date=date(2026, 1, 15),
        amount=Decimal("42.50"),
        category_id=category_id,
        subcategory_id=subcategory_id,
    )
    db.add(transaction)
    db.commit()
    return transaction.id


def transaction_exists(db: Session, transaction_id: int) -> bool:
    db.expire_all()
    return db.get(Transaction, transaction_id) is not None


def test_delete_in_use_via_subcategory_returns_409(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    transaction_id = add_transaction(
        db_session, auth_client.user_id, category_ids["Food"], category_ids["Groceries"]
    )

    for name in ("Food", "Groceries"):
        response = delete(client, category_ids[name])
        assert response.status_code == 409
        assert response.json() == IN_USE

    names = db_names(db_session, auth_client.user_id)
    assert {"Food", "Groceries", "Restaurants"} <= names
    assert len(names) == 21
    assert {"Food", "Groceries", "Restaurants"} <= set(ids(client))
    assert transaction_exists(db_session, transaction_id)


def test_delete_in_use_without_subcategory(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    add_transaction(db_session, auth_client.user_id, category_ids["Food"])

    response = delete(client, category_ids["Food"])
    assert response.status_code == 409
    assert response.json() == IN_USE

    assert delete(client, category_ids["Restaurants"]).status_code == 204
    remaining = ids(client)
    assert "Restaurants" not in remaining
    assert {"Food", "Groceries"} <= set(remaining)


def test_delete_income_in_use_and_unused(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    add_transaction(
        db_session, auth_client.user_id, category_ids["Salary"], kind=CategoryKind.INCOME
    )

    response = delete(client, category_ids["Salary"])
    assert response.status_code == 409
    assert response.json() == IN_USE
    assert delete(client, category_ids["Dividends"]).status_code == 204
    remaining = ids(client)
    assert "Salary" in remaining
    assert "Dividends" not in remaining


def test_delete_unused_family_while_another_is_in_use(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    add_transaction(
        db_session, auth_client.user_id, category_ids["Food"], category_ids["Groceries"]
    )

    assert delete(client, category_ids["Transport"]).status_code == 204
    transport_family = {"Transport", "Fuel", "Car payment", "Train", "Metro"}
    assert not transport_family & set(ids(client))
    assert not transport_family & db_names(db_session, auth_client.user_id)
    assert len(db_names(db_session, auth_client.user_id)) == 21 - 5


def test_delete_allowed_after_blocking_transaction_is_removed(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    transaction_id = add_transaction(
        db_session, auth_client.user_id, category_ids["Food"], category_ids["Groceries"]
    )
    assert delete(client, category_ids["Food"]).status_code == 409

    transaction = db_session.get(Transaction, transaction_id)
    assert transaction is not None
    db_session.delete(transaction)
    db_session.commit()

    assert delete(client, category_ids["Food"]).status_code == 204
    assert not {"Food", "Groceries", "Restaurants"} & set(ids(client))


def test_other_users_transactions_do_not_block_delete(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient], db_session: Session
) -> None:
    alice, bob = two_users
    alice_ids = ids(alice.client)
    bob_ids = ids(bob.client)
    bob_transaction = add_transaction(
        db_session, bob.user_id, bob_ids["Food"], bob_ids["Groceries"]
    )
    bob_tree_before = get_tree(bob.client)

    assert delete(alice.client, alice_ids["Groceries"]).status_code == 204
    assert delete(alice.client, alice_ids["Food"]).status_code == 204
    assert not {"Food", "Groceries", "Restaurants"} & set(ids(alice.client))

    assert get_tree(bob.client) == bob_tree_before
    assert transaction_exists(db_session, bob_transaction)
    transaction = db_session.get(Transaction, bob_transaction)
    assert transaction is not None
    assert transaction.user_id == bob.user_id
    assert transaction.category_id == bob_ids["Food"]
    assert transaction.subcategory_id == bob_ids["Groceries"]


def test_delete_fk_race_returns_409(
    auth_client: AuthenticatedClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    transaction_id = add_transaction(db_session, auth_client.user_id, category_ids["Food"])
    # Simulate a transaction created after the check: only the FK can stop the delete.
    monkeypatch.setattr(service, "category_ids_in_use", lambda *args, **kwargs: False)

    response = delete(client, category_ids["Food"])
    assert response.status_code == 409
    assert response.json() == IN_USE

    assert {"Food", "Groceries", "Restaurants"} <= db_names(db_session, auth_client.user_id)
    assert transaction_exists(db_session, transaction_id)
    assert client.get("/api/categories").status_code == 200
    assert {"Food", "Groceries", "Restaurants"} <= set(ids(client))


def test_category_ids_in_use(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient], db_session: Session
) -> None:
    alice, bob = two_users
    alice_ids = ids(alice.client)
    family = [alice_ids["Food"], alice_ids["Groceries"]]

    assert service.category_ids_in_use(db_session, alice.user_id, family) is False
    add_transaction(db_session, alice.user_id, alice_ids["Food"], alice_ids["Groceries"])
    assert service.category_ids_in_use(db_session, alice.user_id, family) is True
    assert service.category_ids_in_use(db_session, alice.user_id, [alice_ids["Groceries"]]) is True
    assert (
        service.category_ids_in_use(db_session, alice.user_id, [alice_ids["Restaurants"]]) is False
    )
    assert service.category_ids_in_use(db_session, bob.user_id, family) is False
    assert service.category_ids_in_use(db_session, alice.user_id, []) is False


# --- Auth and ownership -----------------------------------------------------------------------


def test_endpoints_require_auth(client: TestClient) -> None:
    assert client.get("/api/categories").status_code == 401
    assert post(client, name="X", kind="expense").status_code == 401
    assert patch(client, 1, {"name": "X"}).status_code == 401
    assert delete(client, 1).status_code == 401


def test_users_cannot_see_or_touch_each_other_categories(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient], db_session: Session
) -> None:
    alice, bob = two_users
    alice_ids = ids(alice.client)
    alice_only = post(alice.client, name="Alice secret", kind="expense").json()["id"]
    alice_before = get_tree(alice.client)

    bob_ids = {node["id"] for node in get_tree(bob.client)} | {
        sub["id"] for node in get_tree(bob.client) for sub in node["subcategories"]
    }
    assert alice_only not in bob_ids
    assert not set(alice_ids.values()) & bob_ids
    assert "Alice secret" not in ids(bob.client)

    for category_id in (alice_ids["Food"], alice_ids["Groceries"], alice_only):
        response = patch(bob.client, category_id, {"name": "Hacked"})
        assert response.status_code == 404
        assert response.json() == NOT_FOUND
        response = delete(bob.client, category_id)
        assert response.status_code == 404
        assert response.json() == NOT_FOUND

    bob_names_before = db_names(db_session, bob.user_id)
    response = post(bob.client, name="Sneaky", kind="expense", parent_id=alice_ids["Food"])
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert db_names(db_session, bob.user_id) == bob_names_before
    assert "Sneaky" not in db_names(db_session, alice.user_id)

    assert get_tree(alice.client) == alice_before


def test_unknown_and_invalid_ids(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    for response in (
        patch(client, 999999, {"name": "X"}),
        delete(client, 999999),
        post(client, name="X", kind="expense", parent_id=999999),
    ):
        assert response.status_code == 404
        assert response.json() == NOT_FOUND
    assert patch(client, "abc", {"name": "X"}).status_code == 422
    assert delete(client, "abc").status_code == 422


# --- Totals -----------------------------------------------------------------------------------


def add_tx(
    db: Session,
    user_id: int,
    category_id: int,
    subcategory_id: int | None,
    day: date,
    amount: str,
    kind: CategoryKind = CategoryKind.EXPENSE,
) -> None:
    db.add(
        Transaction(
            user_id=user_id,
            type=kind,
            date=day,
            amount=Decimal(amount),
            category_id=category_id,
            subcategory_id=subcategory_id,
        )
    )
    db.commit()


def get_totals(client: TestClient, date_from: str, date_to: str) -> Any:
    return client.get("/api/categories/totals", params={"from": date_from, "to": date_to})


def totals_by_id(body: list[dict[str, Any]]) -> dict[int, str]:
    result: dict[int, str] = {}
    for node in body:
        result[node["category_id"]] = node["total"]
        for sub in node["subcategories"]:
            result[sub["id"]] = sub["total"]
    return result


def test_totals_sums_period_boundaries_and_empty(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    c = ids(auth_client.client)
    uid = auth_client.user_id
    food, groceries, rest = c["Food"], c["Groceries"], c["Restaurants"]
    add_tx(db_session, uid, food, groceries, date(2026, 10, 1), "100.10")
    add_tx(db_session, uid, food, groceries, date(2026, 10, 31), "25.40")
    add_tx(db_session, uid, food, None, date(2026, 10, 15), "10.00")
    add_tx(db_session, uid, food, rest, date(2026, 9, 30), "999.00")
    add_tx(db_session, uid, food, rest, date(2026, 11, 1), "999.00")
    add_tx(db_session, uid, c["Salary"], None, date(2026, 10, 5), "3000.00", CategoryKind.INCOME)

    response = get_totals(auth_client.client, "2026-10-01", "2026-10-31")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 9
    totals = totals_by_id(body)
    assert totals[groceries] == "125.50"
    assert totals[rest] == "0.00"
    assert totals[food] == "135.50"
    assert totals[c["Salary"]] == "3000.00"
    assert totals[c["Housing"]] == "0.00"
    assert totals[c["Rent"]] == "0.00"
    assert totals[c["Dividends"]] == "0.00"


def test_totals_ignore_other_users(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient], db_session: Session
) -> None:
    alice, bob = two_users
    a, b = ids(alice.client), ids(bob.client)
    add_tx(db_session, alice.user_id, a["Food"], a["Groceries"], date(2026, 10, 2), "50.00")
    add_tx(db_session, bob.user_id, b["Food"], b["Groceries"], date(2026, 10, 2), "7.00")

    alice_body = get_totals(alice.client, "2026-10-01", "2026-10-31").json()
    bob_body = get_totals(bob.client, "2026-10-01", "2026-10-31").json()

    assert set(totals_by_id(alice_body)) == set(a.values())
    assert set(totals_by_id(bob_body)) == set(b.values())
    assert totals_by_id(alice_body)[a["Food"]] == "50.00"
    assert totals_by_id(bob_body)[b["Food"]] == "7.00"


def test_totals_requires_auth(client: TestClient) -> None:
    assert get_totals(client, "2026-10-01", "2026-10-31").status_code == 401


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"from": "2026-10-01"},
        {"to": "2026-10-31"},
        {"from": "nope", "to": "2026-10-31"},
        {"from": "2026-10-31", "to": "2026-10-01"},
    ],
)
def test_totals_rejects_bad_periods(
    auth_client: AuthenticatedClient, params: dict[str, str]
) -> None:
    assert auth_client.client.get("/api/categories/totals", params=params).status_code == 422
