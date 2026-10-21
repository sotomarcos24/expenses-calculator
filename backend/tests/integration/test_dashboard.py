from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import AuthenticatedClient

URL = "/api/dashboard"
PERIOD = {"from": "2026-03-01", "to": "2026-03-31"}
EMPTY_INVESTMENTS: dict[str, Any] = {
    "total_invested": "0.00",
    "current_value": "0.00",
    "gain": "0.00",
    "gain_pct": None,
    "by_type": [],
}


def dashboard(client: TestClient, **params: str) -> Any:
    return client.get(URL, params=params or PERIOD)


def tree(client: TestClient, kind: str) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = client.get("/api/categories", params={"kind": kind}).json()
    return nodes


def top(client: TestClient, kind: str, name: str) -> dict[str, Any]:
    return next(n for n in tree(client, kind) if n["name"] == name)


def add(
    client: TestClient,
    kind: str,
    day: str,
    amount: str,
    category: dict[str, Any],
    sub: dict[str, Any] | None = None,
) -> None:
    body: dict[str, Any] = {
        "type": kind,
        "date": day,
        "amount": amount,
        "category_id": category["id"],
        "subcategory_id": sub["id"] if sub else None,
    }
    response = client.post("/api/transactions", json=body)
    assert response.status_code == 201, response.text


def invest(client: TestClient, kind: str, invested: str, current: str) -> None:
    response = client.post(
        "/api/investments",
        json={"name": kind, "type": kind, "amount_invested": invested, "current_value": current},
    )
    assert response.status_code == 201, response.text


def seed(client: TestClient) -> None:
    food = top(client, "expense", "Food")
    sub = food["subcategories"][0]
    other = next(n for n in tree(client, "expense") if n["id"] != food["id"])
    salary = tree(client, "income")[0]
    add(client, "income", "2026-03-01", "1000.00", salary)  # on from
    add(client, "income", "2026-03-31", "1000.00", salary)  # on to
    add(client, "income", "2026-02-28", "999.00", salary)  # day before from
    add(client, "income", "2026-04-01", "999.00", salary)  # day after to
    add(client, "expense", "2026-03-01", "100.10", food, sub)
    add(client, "expense", "2026-03-15", "200.20", food, sub)
    add(client, "expense", "2026-03-20", "50.00", food)
    add(client, "expense", "2026-03-31", "800.00", other)
    add(client, "expense", "2026-02-28", "77.00", food, sub)
    add(client, "expense", "2026-04-01", "77.00", other)


def test_totals_boundaries_and_categories(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    seed(client)
    body = dashboard(client).json()

    assert body["income_total"] == "2000.00"
    assert body["expense_total"] == "1150.30"
    assert body["savings"] == "849.70"
    assert body["savings_rate"] == "0.4249"
    cats = body["expenses_by_category"]
    assert sum(float(c["total"]) for c in cats) == float(body["expense_total"])
    assert [c["total"] for c in cats] == ["800.00", "350.30"]
    food = cats[1]
    assert food["name"] == "Food"
    assert [(s["name"] != "(none)", s["total"]) for s in food["subcategories"]] == [
        (True, "300.30"),
        (False, "50.00"),
    ]
    assert food["subcategories"][1]["id"] is None
    assert sum(float(s["total"]) for s in food["subcategories"]) == float(food["total"])
    assert cats[0]["subcategories"][0]["id"] is None


def test_single_day_period(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    seed(client)
    body = dashboard(client, **{"from": "2026-03-15", "to": "2026-03-15"}).json()

    assert body["income_total"] == "0.00"
    assert body["expense_total"] == "200.20"
    assert body["savings"] == "-200.20"
    assert body["savings_rate"] is None


def test_only_expenses_rate_null_and_negative_rate(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    food = top(client, "expense", "Food")
    salary = tree(client, "income")[0]
    add(client, "expense", "2026-03-02", "10.00", food)
    body = dashboard(client).json()
    assert body["savings"] == "-10.00"
    assert body["savings_rate"] is None

    add(client, "income", "2026-03-03", "8.00", salary)
    assert dashboard(client).json()["savings_rate"] == "-0.2500"


def test_savings_rate_quarter(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    add(client, "income", "2026-03-03", "400.00", tree(client, "income")[0])
    add(client, "expense", "2026-03-03", "300.00", top(client, "expense", "Food"))
    assert dashboard(client).json()["savings_rate"] == "0.2500"


def test_investments_match_list_and_ignore_period(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    invest(client, "etf", "1000", "1150")
    invest(client, "stock", "500", "400")
    invest(client, "fund", "100", "100.50")
    invest(client, "etf", "10", "20")
    block = dashboard(client).json()["investments"]
    other = dashboard(client, **{"from": "1999-01-01", "to": "1999-01-02"}).json()["investments"]
    totals = client.get("/api/investments").json()["totals"]

    assert block == other
    assert {k: v for k, v in block.items() if k != "by_type"} == totals
    assert block["by_type"] == [
        {"type": "etf", "current_value": "1170.00"},
        {"type": "stock", "current_value": "400.00"},
        {"type": "fund", "current_value": "100.50"},
    ]


def test_empty_user(auth_client: AuthenticatedClient) -> None:
    response = dashboard(auth_client.client)
    assert response.status_code == 200
    assert response.json() == {
        "income_total": "0.00",
        "expense_total": "0.00",
        "savings": "0.00",
        "savings_rate": None,
        "expenses_by_category": [],
        "investments": EMPTY_INVESTMENTS,
    }


def test_other_user_data_is_ignored(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    a, b = two_users[0].client, two_users[1].client
    before = dashboard(a).json()
    seed(b)
    invest(b, "etf", "1000", "1150")

    assert dashboard(a).json() == before
    assert dashboard(b).json()["income_total"] == "2000.00"


def test_requires_auth(client: TestClient) -> None:
    response = client.get(URL, params=PERIOD)
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_invalid_params(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    assert client.get(URL).status_code == 422
    assert client.get(URL, params={"from": "2026-03-01"}).status_code == 422
    assert client.get(URL, params={"to": "2026-03-01"}).status_code == 422
    assert client.get(URL, params={"from": "nope", "to": "2026-03-01"}).status_code == 422
    response = dashboard(client, **{"from": "2026-03-02", "to": "2026-03-01"})
    assert response.status_code == 422
    assert response.json() == {"detail": "'from' must be on or before 'to'"}
