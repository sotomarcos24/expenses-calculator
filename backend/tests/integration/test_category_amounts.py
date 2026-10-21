from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CategoryAmount, User
from tests.conftest import JSON_HEADERS, AuthenticatedClient
from tests.integration.test_dashboard import add, dashboard, top

URL = "/api/category-amounts"


def sub_of(
    client: TestClient, kind: str, name: str, sub: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    category = top(client, kind, name)
    return category, next(s for s in category["subcategories"] if s["name"] == sub)


def put(client: TestClient, category_id: int, amount: str = "100", **extra: Any) -> Any:
    return client.put(URL, json={"category_id": category_id, "amount": amount, **extra})


def test_put_creates_then_updates_and_delete(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    housing, rent = sub_of(client, "expense", "Housing", "Rent")

    created = put(client, housing["id"], "600", subcategory_id=rent["id"], note="  lease ")
    assert created.status_code == 201
    body = created.json()
    assert body["amount"] == "600.00"
    assert body["note"] == "lease"
    assert body["subcategory_id"] == rent["id"]

    updated = put(client, housing["id"], "650.5", subcategory_id=rent["id"], note="")
    assert updated.status_code == 200
    assert updated.json()["id"] == body["id"]
    assert updated.json()["amount"] == "650.50"
    assert updated.json()["note"] is None

    # Category-level row is a different row from the subcategory one.
    own = put(client, housing["id"], "50")
    assert own.status_code == 201
    assert put(client, housing["id"], "60").status_code == 200
    rows = client.get(URL).json()
    assert [r["id"] for r in rows] == [body["id"], own.json()["id"]]

    assert client.delete(f"{URL}/{body['id']}", headers=JSON_HEADERS).status_code == 204
    assert [r["id"] for r in client.get(URL).json()] == [own.json()["id"]]
    assert client.delete(f"{URL}/{body['id']}", headers=JSON_HEADERS).status_code == 404


@pytest.mark.parametrize("amount", ["0", "-5", "abc", "1.234", None])
def test_invalid_amount_is_422(auth_client: AuthenticatedClient, amount: Any) -> None:
    client = auth_client.client
    housing = top(client, "expense", "Housing")
    assert put(client, housing["id"], amount).status_code == 422


def test_subcategory_rules(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    housing, rent = sub_of(client, "expense", "Housing", "Rent")
    _, fuel = sub_of(client, "expense", "Transport", "Fuel")
    food = top(client, "expense", "Food")

    # Not a child of category_id, or a top-level category as subcategory: 422.
    assert put(client, housing["id"], subcategory_id=fuel["id"]).status_code == 422
    assert put(client, housing["id"], subcategory_id=food["id"]).status_code == 422
    # A subcategory as category_id is rejected as not found (404).
    assert put(client, rent["id"]).status_code == 404
    assert put(client, 999999).status_code == 404
    assert client.get(URL).json() == []


def test_ownership(two_users: tuple[AuthenticatedClient, AuthenticatedClient]) -> None:
    alice, bob = two_users
    housing, rent = sub_of(alice.client, "expense", "Housing", "Rent")
    row = put(alice.client, housing["id"], subcategory_id=rent["id"]).json()

    bob_housing = top(bob.client, "expense", "Housing")
    assert put(bob.client, housing["id"]).status_code == 404
    assert put(bob.client, bob_housing["id"], subcategory_id=rent["id"]).status_code == 404
    assert bob.client.delete(f"{URL}/{row['id']}", headers=JSON_HEADERS).status_code == 404
    assert bob.client.get(URL).json() == []
    assert [r["id"] for r in alice.client.get(URL).json()] == [row["id"]]


def test_requires_auth(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.put(URL, json={"category_id": 1, "amount": "1"}).status_code == 401
    assert client.delete(f"{URL}/1", headers=JSON_HEADERS).status_code == 401


def test_amounts_never_appear_in_transactions(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    housing = top(client, "expense", "Housing")
    put(client, housing["id"], "600")

    assert client.get("/api/transactions").json() == {"items": [], "total": 0}


def test_dashboard_month_year_and_custom(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    housing, rent = sub_of(client, "expense", "Housing", "Rent")
    food = top(client, "expense", "Food")
    salary = top(client, "income", "Salary")
    put(client, salary["id"], "1000")
    put(client, housing["id"], "600", subcategory_id=rent["id"])
    put(client, food["id"], "100")
    add(client, "expense", "2026-03-10", "50", housing, rent)
    add(client, "expense", "2026-03-11", "25", housing)
    add(client, "income", "2026-03-05", "500", salary)

    month = dashboard(client, **{"from": "2026-03-01", "to": "2026-03-31"}).json()
    assert month["income_total"] == "1500.00"
    assert month["expense_total"] == "775.00"
    assert month["savings"] == "725.00"
    assert month["savings_rate"] == "0.4833"
    pie = month["expenses_by_category"]
    assert [c["name"] for c in pie] == ["Housing", "Food"]
    assert pie[0]["total"] == "675.00"
    assert [(s["name"], s["total"]) for s in pie[0]["subcategories"]] == [
        ("Rent", "650.00"),
        ("(none)", "25.00"),
    ]
    assert pie[1]["total"] == "100.00"
    assert pie[1]["subcategories"] == [{"id": None, "name": "(none)", "total": "100.00"}]
    assert sum(float(c["total"]) for c in pie) == float(month["expense_total"])

    year = dashboard(client, **{"from": "2026-01-01", "to": "2026-03-15"}).json()
    assert year["income_total"] == "3500.00"
    assert year["expense_total"] == "2175.00"
    assert year["savings"] == "1325.00"

    custom = dashboard(client, **{"from": "2025-11-15", "to": "2026-02-10"}).json()
    assert custom["income_total"] == "4000.00"
    assert custom["expense_total"] == "2800.00"
    assert custom["expenses_by_category"][0]["total"] == "2400.00"


def test_dashboard_ignores_other_users(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    alice, bob = two_users
    put(alice.client, top(alice.client, "expense", "Food")["id"], "100")

    body = dashboard(bob.client).json()
    assert body["expense_total"] == "0.00"
    assert body["expenses_by_category"] == []


def test_category_totals_include_amounts_times_months(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    housing, rent = sub_of(client, "expense", "Housing", "Rent")
    _, utilities = sub_of(client, "expense", "Housing", "Utilities")
    put(client, housing["id"], "600", subcategory_id=rent["id"])
    put(client, housing["id"], "10")
    add(client, "expense", "2026-02-10", "5", housing, utilities)

    body = client.get(
        "/api/categories/totals", params={"from": "2026-01-15", "to": "2026-03-02"}
    ).json()
    node = next(n for n in body if n["category_id"] == housing["id"])
    subs = {s["id"]: s["total"] for s in node["subcategories"]}
    assert subs[rent["id"]] == "1800.00"
    assert subs[utilities["id"]] == "5.00"
    assert node["total"] == "1835.00"


def test_delete_guard_and_user_cascade(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    client = auth_client.client
    housing, rent = sub_of(client, "expense", "Housing", "Rent")
    row = put(client, housing["id"], "600", subcategory_id=rent["id"]).json()

    for target in (rent["id"], housing["id"]):
        response = client.delete(f"/api/categories/{target}", headers=JSON_HEADERS)
        assert response.status_code == 409
        assert "monthly amounts" in response.json()["detail"]

    assert client.delete(f"{URL}/{row['id']}", headers=JSON_HEADERS).status_code == 204
    assert client.delete(f"/api/categories/{rent['id']}", headers=JSON_HEADERS).status_code == 204

    food = top(client, "expense", "Food")
    put(client, food["id"], "10")
    user = db_session.get(User, auth_client.user_id)
    assert user is not None
    db_session.delete(user)
    db_session.commit()
    assert db_session.scalars(select(CategoryAmount)).all() == []
