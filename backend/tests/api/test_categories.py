from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category
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


def test_delete_in_use_returns_409(
    auth_client: AuthenticatedClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = auth_client.client
    category_ids = ids(client)
    calls: list[list[int]] = []

    def in_use(db: Session, user_id: int, ids_: list[int]) -> bool:
        assert user_id == auth_client.user_id
        calls.append(sorted(ids_))
        return True

    monkeypatch.setattr(service, "category_ids_in_use", in_use)
    before = db_names(db_session, auth_client.user_id)

    for name in ("Transport", "Fuel"):
        response = delete(client, category_ids[name])
        assert response.status_code == 409
        assert response.json() == IN_USE

    transport_family = sorted(
        category_ids[n] for n in ("Transport", "Fuel", "Car payment", "Train", "Metro")
    )
    assert calls == [transport_family, [category_ids["Fuel"]]]
    assert db_names(db_session, auth_client.user_id) == before


def test_category_ids_in_use_is_false_in_m3(db_session: Session) -> None:
    assert service.category_ids_in_use(db_session, 1, [1, 2, 3]) is False


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
