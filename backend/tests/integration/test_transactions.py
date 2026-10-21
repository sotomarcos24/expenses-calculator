from collections.abc import Iterator
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import JSON_HEADERS, AuthenticatedClient
from tests.integration.test_categories import ids

URL = "/api/transactions"
TX_NOT_FOUND = {"detail": "Transaction not found"}
CAT_NOT_FOUND = {"detail": "Category not found"}
EMPTY_PAGE = {"items": [], "total": 0}
MONEY_FIELDS = ("amount", "gross_amount", "deduction_rate")


# --- helpers ---------------------------------------------------------------------------------


def post(client: TestClient, body: dict[str, Any]) -> Any:
    return client.post(URL, json=body)


def patch(client: TestClient, transaction_id: int | str, body: dict[str, Any]) -> Any:
    return client.patch(f"{URL}/{transaction_id}", json=body)


def get(client: TestClient, transaction_id: int | str) -> Any:
    return client.get(f"{URL}/{transaction_id}")


def delete(client: TestClient, transaction_id: int | str) -> Any:
    return client.delete(f"{URL}/{transaction_id}", headers=JSON_HEADERS)


def expense(cats: dict[str, int], **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": "expense",
        "date": "2026-10-01",
        "amount": "12.30",
        "category_id": cats["Food"],
        "subcategory_id": cats["Groceries"],
    }
    body.update(overrides)
    return body


def salary(cats: dict[str, int], **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": "income",
        "date": "2026-10-01",
        "amount": "2400.00",
        "gross_amount": "3000.00",
        "category_id": cats["Salary"],
    }
    body.update(overrides)
    return body


def create(client: TestClient, body: dict[str, Any]) -> dict[str, Any]:
    response = post(client, body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def list_page(client: TestClient, **params: Any) -> dict[str, Any]:
    response = client.get(URL, params=params)
    assert response.status_code == 200, response.text
    page: dict[str, Any] = response.json()
    return page


def list_ids(client: TestClient, **params: Any) -> list[int]:
    return [item["id"] for item in list_page(client, **params)["items"]]


def total(client: TestClient) -> int:
    count: int = list_page(client)["total"]
    return count


def assert_money_strings(transaction: dict[str, Any]) -> None:
    for field in MONEY_FIELDS:
        value = transaction[field]
        assert value is None or isinstance(value, str), (field, value)
    assert isinstance(transaction["amount"], str)


@pytest.fixture
def cats(auth_client: AuthenticatedClient) -> dict[str, int]:
    return ids(auth_client.client)


@pytest.fixture
def client(auth_client: AuthenticatedClient) -> TestClient:
    """Overrides the conftest ``client``: in this module it is the logged-in user's client."""
    return auth_client.client


# --- CRUD ------------------------------------------------------------------------------------


def test_create_expense(client: TestClient, cats: dict[str, int]) -> None:
    response = post(client, expense(cats, note="  weekly shop  "))

    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "expense"
    assert body["date"] == "2026-10-01"
    assert body["amount"] == "12.30"
    assert body["gross_amount"] is None
    assert body["deduction_rate"] is None
    assert body["category_id"] == cats["Food"]
    assert body["category_name"] == "Food"
    assert body["subcategory_id"] == cats["Groceries"]
    assert body["subcategory_name"] == "Groceries"
    assert body["note"] == "weekly shop"
    assert isinstance(body["id"], int)
    assert body["created_at"] and body["updated_at"]
    assert_money_strings(body)


def test_create_income_without_subcategory(client: TestClient, cats: dict[str, int]) -> None:
    body = create(client, salary(cats, gross_amount=None))

    assert body["subcategory_id"] is None
    assert body["subcategory_name"] is None
    assert body["category_name"] == "Salary"
    assert body["deduction_rate"] is None


def test_get_returns_the_post_body(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats, note="x"))

    response = get(client, created["id"])

    assert response.status_code == 200
    assert response.json() == created
    assert_money_strings(response.json())


def test_patch_amount_and_clear_note(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats, note="weekly shop"))

    response = patch(client, created["id"], {"amount": "15.00", "note": None})

    assert response.status_code == 200
    body = response.json()
    assert body["amount"] == "15.00"
    assert body["note"] is None
    unchanged = {k: v for k, v in created.items() if k not in ("amount", "note", "updated_at")}
    assert {k: body[k] for k in unchanged} == unchanged
    assert body["updated_at"] >= body["created_at"]
    assert_money_strings(body)
    assert get(client, created["id"]).json() == body


def test_patch_empty_body_changes_nothing(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, salary(cats, note="october"))

    response = patch(client, created["id"], {})

    assert response.status_code == 200
    assert response.json() == created
    assert get(client, created["id"]).json() == created


def test_delete_then_everything_is_404(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats))

    response = delete(client, created["id"])

    assert response.status_code == 204
    assert response.content == b""
    for response in (
        get(client, created["id"]),
        patch(client, created["id"], {"amount": "1.00"}),
        delete(client, created["id"]),
    ):
        assert response.status_code == 404
        assert response.json() == TX_NOT_FOUND


def test_unknown_id_is_404(client: TestClient) -> None:
    for response in (get(client, 999999), patch(client, 999999, {}), delete(client, 999999)):
        assert response.status_code == 404
        assert response.json() == TX_NOT_FOUND


def test_non_integer_id_is_422(client: TestClient) -> None:
    assert get(client, "abc").status_code == 422


# --- Money and validation --------------------------------------------------------------------

BAD_MONEY = ["0", "-5.00", "10.123", "10000000000.00", "NaN", "abc"]


@pytest.mark.parametrize("amount", BAD_MONEY)
def test_bad_amount_is_422(client: TestClient, cats: dict[str, int], amount: str) -> None:
    response = post(client, expense(cats, amount=amount))

    assert response.status_code == 422
    assert total(client) == 0


@pytest.mark.parametrize("gross", BAD_MONEY)
def test_bad_gross_amount_is_422(client: TestClient, cats: dict[str, int], gross: str) -> None:
    response = post(client, salary(cats, amount="0.01", gross_amount=gross))

    assert response.status_code == 422
    assert total(client) == 0


@pytest.mark.parametrize(
    ("sent", "returned"),
    [("10.5", "10.50"), ("10", "10.00"), ("9999999999.99", "9999999999.99")],
)
def test_amount_is_returned_with_two_decimals(
    client: TestClient, cats: dict[str, int], sent: str, returned: str
) -> None:
    created = create(client, expense(cats, amount=sent))

    assert created["amount"] == returned
    assert get(client, created["id"]).json()["amount"] == returned


def test_money_fields_are_strings_everywhere(client: TestClient, cats: dict[str, int]) -> None:
    created = [create(client, salary(cats)), create(client, expense(cats))]
    updated = patch(client, created[0]["id"], {"amount": "2500.00"}).json()

    for body in [*created, updated, get(client, created[1]["id"]).json()]:
        assert_money_strings(body)
    items = list_page(client)["items"]
    assert len(items) == 2
    for item in items:
        assert_money_strings(item)
    assert isinstance(updated["gross_amount"], str)
    assert isinstance(updated["deduction_rate"], str)


def test_amounts_sum_exactly(client: TestClient, cats: dict[str, int]) -> None:
    create(client, expense(cats, amount="0.10"))
    create(client, expense(cats, amount="0.20"))

    items = list_page(client)["items"]

    assert sum((Decimal(item["amount"]) for item in items), Decimal(0)) == Decimal("0.30")


@pytest.mark.parametrize("field", ["type", "date", "amount", "category_id"])
def test_missing_required_field_is_422(
    client: TestClient, cats: dict[str, int], field: str
) -> None:
    body = expense(cats)
    del body[field]

    assert post(client, body).status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [{"user_id": 2}, {"date": "2026-02-30"}, {"type": "transfer"}, {"date": "not-a-date"}],
)
def test_invalid_create_body_is_422(
    client: TestClient, cats: dict[str, int], overrides: dict[str, Any]
) -> None:
    assert post(client, expense(cats, **overrides)).status_code == 422
    assert total(client) == 0


@pytest.mark.parametrize(
    "body",
    [
        {"user_id": 2},
        {"id": 5},
        {"type": "transfer"},
        {"date": "2026-02-30"},
        {"amount": "10.123"},
        {"note": "x" * 501},
    ],
)
def test_invalid_patch_body_is_422(
    client: TestClient, cats: dict[str, int], body: dict[str, Any]
) -> None:
    created = create(client, expense(cats))

    assert patch(client, created["id"], body).status_code == 422
    assert get(client, created["id"]).json() == created


def test_note_length_and_whitespace(client: TestClient, cats: dict[str, int]) -> None:
    assert post(client, expense(cats, note="x" * 501)).status_code == 422
    assert create(client, expense(cats, note="x" * 500))["note"] == "x" * 500
    assert create(client, expense(cats, note=" " + "y" * 500 + " "))["note"] == "y" * 500
    assert create(client, expense(cats, note="   \t "))["note"] is None
    assert create(client, expense(cats, note="a  b"))["note"] == "a  b"


def test_future_date_is_allowed(client: TestClient, cats: dict[str, int]) -> None:
    future = (date.today() + timedelta(days=366)).isoformat()

    assert create(client, expense(cats, date=future))["date"] == future


# --- Salary and deduction rate ---------------------------------------------------------------


def test_salary_with_gross_amount(client: TestClient, cats: dict[str, int]) -> None:
    body = create(client, salary(cats))

    assert body["amount"] == "2400.00"
    assert body["gross_amount"] == "3000.00"
    assert body["deduction_rate"] == "0.2000"


def test_gross_equal_to_amount_gives_zero_rate(client: TestClient, cats: dict[str, int]) -> None:
    body = create(client, salary(cats, gross_amount="2400.00"))

    assert body["deduction_rate"] == "0.0000"


def test_gross_below_amount_is_422(client: TestClient, cats: dict[str, int]) -> None:
    response = post(client, salary(cats, gross_amount="2000.00"))

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert total(client) == 0


def test_gross_on_expense_is_422(client: TestClient, cats: dict[str, int]) -> None:
    response = post(client, expense(cats, gross_amount="20.00"))

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert total(client) == 0


# --- Category rules --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "case",
    ["expense_on_salary", "income_on_food", "subcategory_as_category", "foreign_child", "self"],
)
def test_category_rules_are_422(client: TestClient, cats: dict[str, int], case: str) -> None:
    body = {
        "expense_on_salary": expense(cats, category_id=cats["Salary"], subcategory_id=None),
        "income_on_food": salary(cats, category_id=cats["Food"], gross_amount=None),
        "subcategory_as_category": expense(cats, category_id=cats["Groceries"]),
        "foreign_child": expense(cats, subcategory_id=cats["Fuel"]),
        "self": expense(cats, subcategory_id=cats["Food"]),
    }[case]

    response = post(client, body)

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert total(client) == 0


def test_subcategory_is_optional(client: TestClient, cats: dict[str, int]) -> None:
    body = create(client, expense(cats, subcategory_id=None))

    assert body["category_name"] == "Food"
    assert body["subcategory_id"] is None


@pytest.mark.parametrize("field", ["category_id", "subcategory_id"])
def test_missing_category_is_404(client: TestClient, cats: dict[str, int], field: str) -> None:
    response = post(client, expense(cats, **{field: 999999}))

    assert response.status_code == 404
    assert response.json() == CAT_NOT_FOUND
    assert total(client) == 0


def test_patch_type_to_expense_with_gross_is_422(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, salary(cats))

    assert patch(client, created["id"], {"type": "expense"}).status_code == 422
    assert get(client, created["id"]).json() == created


def test_patch_salary_to_expense(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, salary(cats))

    response = patch(
        client,
        created["id"],
        {"type": "expense", "gross_amount": None, "category_id": cats["Food"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "expense"
    assert body["gross_amount"] is None
    assert body["deduction_rate"] is None
    assert body["category_name"] == "Food"


def test_patch_category_with_stale_subcategory_is_422(
    client: TestClient, cats: dict[str, int]
) -> None:
    created = create(client, expense(cats))

    assert patch(client, created["id"], {"category_id": cats["Transport"]}).status_code == 422
    assert get(client, created["id"]).json() == created


def test_patch_category_and_clear_subcategory(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats))

    response = patch(
        client, created["id"], {"category_id": cats["Transport"], "subcategory_id": None}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["category_id"] == cats["Transport"]
    assert body["category_name"] == "Transport"
    assert body["subcategory_id"] is None
    assert body["subcategory_name"] is None


def test_patch_category_and_new_subcategory(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats))

    body = patch(
        client, created["id"], {"category_id": cats["Transport"], "subcategory_id": cats["Fuel"]}
    ).json()

    assert (body["category_name"], body["subcategory_name"]) == ("Transport", "Fuel")
    assert get(client, created["id"]).json() == body


def test_patch_amount_above_gross_is_422(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, salary(cats))

    assert patch(client, created["id"], {"amount": "5000.00"}).status_code == 422
    assert get(client, created["id"]).json() == created


@pytest.mark.parametrize("field", ["type", "date", "amount", "category_id"])
def test_patch_null_required_field_is_422(
    client: TestClient, cats: dict[str, int], field: str
) -> None:
    created = create(client, expense(cats))

    assert patch(client, created["id"], {field: None}).status_code == 422
    assert get(client, created["id"]).json() == created


def test_patch_missing_category_is_404(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats))

    for body in ({"category_id": 999999}, {"subcategory_id": 999999}):
        response = patch(client, created["id"], body)
        assert response.status_code == 404
        assert response.json() == CAT_NOT_FOUND
    assert get(client, created["id"]).json() == created


# --- List, filters and pagination ------------------------------------------------------------


@pytest.fixture
def dataset(client: TestClient, cats: dict[str, int]) -> dict[str, int]:
    """Named transactions on several dates; two share 2026-03-10."""
    specs = {
        "jan_food": expense(cats, date="2026-01-05"),
        "feb_salary": salary(cats, date="2026-02-01"),
        "mar_fuel": expense(
            cats, date="2026-03-10", category_id=cats["Transport"], subcategory_id=cats["Fuel"]
        ),
        "mar_food": expense(cats, date="2026-03-10", subcategory_id=None),
        "apr_restaurant": expense(cats, date="2026-04-20", subcategory_id=cats["Restaurants"]),
        "apr_salary": salary(cats, date="2026-04-30"),
    }
    return {name: create(client, body)["id"] for name, body in specs.items()}


def test_list_order_is_date_then_id_desc(client: TestClient, dataset: dict[str, int]) -> None:
    page = list_page(client)

    assert [item["id"] for item in page["items"]] == [
        dataset["apr_salary"],
        dataset["apr_restaurant"],
        dataset["mar_food"],
        dataset["mar_fuel"],
        dataset["feb_salary"],
        dataset["jan_food"],
    ]
    assert dataset["mar_food"] > dataset["mar_fuel"]
    assert page["total"] == 6


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"from": "2026-03-10"}, ["apr_salary", "apr_restaurant", "mar_food", "mar_fuel"]),
        ({"to": "2026-02-01"}, ["feb_salary", "jan_food"]),
        ({"from": "2026-03-10", "to": "2026-03-10"}, ["mar_food", "mar_fuel"]),
        ({"type": "income"}, ["apr_salary", "feb_salary"]),
        ({"type": "expense"}, ["apr_restaurant", "mar_food", "mar_fuel", "jan_food"]),
        ("category:Food", ["apr_restaurant", "mar_food", "jan_food"]),
        ("subcategory:Groceries", ["jan_food"]),
        ("subcategory:Fuel", ["mar_fuel"]),
        (
            "combined",
            ["apr_restaurant", "mar_food"],
        ),
    ],
)
def test_filters(
    client: TestClient,
    cats: dict[str, int],
    dataset: dict[str, int],
    params: dict[str, str] | str,
    expected: list[str],
) -> None:
    if params == "combined":
        query: dict[str, Any] = {
            "from": "2026-01-06",
            "to": "2026-04-20",
            "type": "expense",
            "category_id": cats["Food"],
        }
    elif isinstance(params, str):
        key, name = params.split(":")
        query = {f"{key}_id": cats[name]}
    else:
        query = dict(params)

    page = list_page(client, **query)

    assert [item["id"] for item in page["items"]] == [dataset[name] for name in expected]
    assert page["total"] == len(expected)


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-02-02", "to": "2026-02-01"},
        {"type": "transfer"},
        {"page": 0},
        {"page_size": 0},
        {"page_size": 101},
        {"from": "2026-02-30"},
        {"category_id": "abc"},
    ],
)
def test_invalid_list_params_are_422(client: TestClient, params: dict[str, Any]) -> None:
    assert client.get(URL, params=params).status_code == 422


def test_from_after_to_detail(client: TestClient) -> None:
    response = client.get(URL, params={"from": "2026-02-02", "to": "2026-02-01"})

    assert response.json() == {"detail": "'from' must be on or before 'to'"}


def test_page_size_100_is_allowed(client: TestClient, dataset: dict[str, int]) -> None:
    assert len(list_ids(client, page_size=100)) == 6


def test_default_page_size_is_50(client: TestClient, cats: dict[str, int]) -> None:
    for day in range(55):
        create(client, expense(cats, date=(date(2026, 1, 1) + timedelta(days=day)).isoformat()))

    first = list_page(client)
    second = list_page(client, page=2)

    assert (len(first["items"]), first["total"]) == (50, 55)
    assert (len(second["items"]), second["total"]) == (5, 55)


def test_pagination_covers_every_row_once(client: TestClient, dataset: dict[str, int]) -> None:
    delete(client, dataset["jan_food"])
    full = list_ids(client)
    assert len(full) == 5

    pages = [list_page(client, page=number, page_size=2) for number in (1, 2, 3)]

    assert [len(page["items"]) for page in pages] == [2, 2, 1]
    assert [item["id"] for page in pages for item in page["items"]] == full
    assert all(page["total"] == 5 for page in pages)
    assert list_page(client, page=4, page_size=2) == {"items": [], "total": 5}


@pytest.mark.parametrize("field", ["category_id", "subcategory_id"])
def test_filter_by_missing_category_is_empty(
    client: TestClient, dataset: dict[str, int], field: str
) -> None:
    assert list_page(client, **{field: 999999}) == EMPTY_PAGE


def test_filter_by_subcategory_as_category_is_empty(
    client: TestClient, cats: dict[str, int], dataset: dict[str, int]
) -> None:
    assert list_page(client, category_id=cats["Groceries"]) == EMPTY_PAGE


# --- Ownership and auth ----------------------------------------------------------------------


def test_lists_are_per_user(two_users: tuple[AuthenticatedClient, AuthenticatedClient]) -> None:
    a, b = two_users
    a_cats, b_cats = ids(a.client), ids(b.client)
    a_ids = {create(a.client, expense(a_cats))["id"], create(a.client, salary(a_cats))["id"]}
    b_id = create(b.client, expense(b_cats))["id"]

    b_page = list_page(b.client)

    assert [item["id"] for item in b_page["items"]] == [b_id]
    assert b_page["total"] == 1
    assert set(list_ids(a.client)) == a_ids


def test_other_users_transaction_is_404(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    a, b = two_users
    a_tx = create(a.client, salary(ids(a.client)))

    for response in (
        get(b.client, a_tx["id"]),
        patch(b.client, a_tx["id"], {"amount": "1.00"}),
        delete(b.client, a_tx["id"]),
    ):
        assert response.status_code == 404
        assert response.json() == TX_NOT_FOUND
    assert get(a.client, a_tx["id"]).json() == a_tx


def test_other_users_categories_in_body_are_404(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    a, b = two_users
    a_cats, b_cats = ids(a.client), ids(b.client)

    for body in (
        expense(b_cats, category_id=a_cats["Food"], subcategory_id=None),
        expense(b_cats, subcategory_id=a_cats["Groceries"]),
    ):
        response = post(b.client, body)
        assert response.status_code == 404
        assert response.json() == CAT_NOT_FOUND
    assert total(b.client) == 0

    b_tx = create(b.client, expense(b_cats))
    for patch_body in (
        {"category_id": a_cats["Food"], "subcategory_id": None},
        {"subcategory_id": a_cats["Groceries"]},
    ):
        response = patch(b.client, b_tx["id"], patch_body)
        assert response.status_code == 404
        assert response.json() == CAT_NOT_FOUND
    assert get(b.client, b_tx["id"]).json() == b_tx


def test_filter_by_other_users_category_is_empty(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    a, b = two_users
    a_cats, b_cats = ids(a.client), ids(b.client)
    create(a.client, expense(a_cats))
    create(b.client, expense(b_cats))

    assert list_page(b.client, category_id=a_cats["Food"]) == EMPTY_PAGE
    assert list_page(b.client, subcategory_id=a_cats["Groceries"]) == EMPTY_PAGE
    assert list_page(a.client, category_id=a_cats["Food"])["total"] == 1


def test_endpoints_require_auth(unauthenticated: TestClient) -> None:
    responses = [
        unauthenticated.get(URL),
        unauthenticated.post(URL, json={}),
        unauthenticated.get(f"{URL}/1"),
        unauthenticated.patch(f"{URL}/1", json={}),
        unauthenticated.delete(f"{URL}/1", headers=JSON_HEADERS),
    ]

    for response in responses:
        assert response.status_code == 401
        assert response.json() == {"detail": "Not authenticated"}


@pytest.fixture
def unauthenticated(app: FastAPI) -> Iterator[TestClient]:
    """A client without the cookie (this module's ``client`` fixture is the logged-in one)."""
    with TestClient(app) as test_client:
        yield test_client


def test_mutations_require_json_content_type(client: TestClient, cats: dict[str, int]) -> None:
    created = create(client, expense(cats))
    text = {"Content-Type": "text/plain"}

    responses = [
        client.post(URL, content="{}", headers=text),
        client.patch(f"{URL}/{created['id']}", content="{}", headers=text),
        client.delete(f"{URL}/{created['id']}", headers=text),
    ]

    for response in responses:
        assert response.status_code == 415
    assert get(client, created["id"]).json() == created
