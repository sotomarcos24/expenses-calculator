from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services import investments as service
from tests.conftest import JSON_HEADERS, AuthenticatedClient

URL = "/api/investments"
NOT_FOUND = {"detail": "Investment not found"}
TODAY = date(2026, 3, 15)
EMPTY_TOTALS = {"total_invested": "0.00", "current_value": "0.00", "gain": "0.00", "gain_pct": None}
MONEY_FIELDS = ("amount_invested", "current_value", "gain")


# --- helpers ---------------------------------------------------------------------------------


def post(client: TestClient, body: dict[str, Any]) -> Any:
    return client.post(URL, json=body)


def patch(client: TestClient, investment_id: int | str, body: dict[str, Any]) -> Any:
    return client.patch(f"{URL}/{investment_id}", json=body)


def get(client: TestClient, investment_id: int | str) -> Any:
    return client.get(f"{URL}/{investment_id}")


def delete(client: TestClient, investment_id: int | str) -> Any:
    return client.delete(f"{URL}/{investment_id}", headers=JSON_HEADERS)


def etf(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "ETF World",
        "type": "etf",
        "platform": "Broker X",
        "amount_invested": "1000",
        "current_value": "1150",
    }
    body.update(overrides)
    return body


def create(client: TestClient, body: dict[str, Any]) -> dict[str, Any]:
    response = post(client, body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def list_all(client: TestClient) -> dict[str, Any]:
    response = client.get(URL)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch: pytest.MonkeyPatch) -> date:
    monkeypatch.setattr(service, "today", lambda: TODAY)
    return TODAY


@pytest.fixture
def client(auth_client: AuthenticatedClient) -> TestClient:
    """Overrides the conftest ``client``: in this module it is the logged-in user's client."""
    return auth_client.client


# --- Create and gain/loss --------------------------------------------------------------------


def test_create(client: TestClient) -> None:
    response = post(client, etf())

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "ETF World"
    assert body["type"] == "etf"
    assert body["platform"] == "Broker X"
    assert body["amount_invested"] == "1000.00"
    assert body["current_value"] == "1150.00"
    assert body["gain"] == "150.00"
    assert body["gain_pct"] == "0.1500"
    assert body["value_updated_at"] == "2026-03-15"
    assert isinstance(body["id"], int)
    assert body["created_at"] and body["updated_at"]
    for field in MONEY_FIELDS:
        assert isinstance(body[field], str)


@pytest.mark.parametrize(
    ("invested", "current", "gain", "pct"),
    [
        ("1000", "900", "-100.00", "-0.1000"),
        ("1000", "1000", "0.00", "0.0000"),
        ("0", "50", "50.00", None),
        ("0", "0", "0.00", None),
        ("3", "4", "1.00", "0.3333"),
    ],
)
def test_gain_and_pct(
    client: TestClient, invested: str, current: str, gain: str, pct: str | None
) -> None:
    body = create(client, etf(amount_invested=invested, current_value=current))

    assert body["gain"] == gain
    assert body["gain_pct"] == pct


@pytest.mark.parametrize("value_updated_at", ["2025-12-31", "2027-03-15"])
def test_create_with_value_updated_at(client: TestClient, value_updated_at: str) -> None:
    # A past date and a future one (a year after today) are both accepted.
    body = create(client, etf(value_updated_at=value_updated_at))

    assert body["value_updated_at"] == value_updated_at
    assert get(client, body["id"]).json()["value_updated_at"] == value_updated_at


@pytest.mark.parametrize("platform", [None, "", "   "])
def test_platform_empty_is_null(client: TestClient, platform: str | None) -> None:
    assert create(client, etf(platform=platform))["platform"] is None


def test_platform_omitted_is_null(client: TestClient) -> None:
    body = etf()
    del body["platform"]

    assert create(client, body)["platform"] is None


def test_platform_and_name_are_trimmed(client: TestClient) -> None:
    body = create(client, etf(name="  ETF World  ", platform="  Broker X  "))

    assert body["name"] == "ETF World"
    assert body["platform"] == "Broker X"


def test_platform_max_length(client: TestClient) -> None:
    assert create(client, etf(platform=" " + "p" * 100 + " "))["platform"] == "p" * 100
    assert post(client, etf(platform="p" * 101)).status_code == 422


def test_name_max_length(client: TestClient) -> None:
    assert create(client, etf(name=" " + "n" * 100 + " "))["name"] == "n" * 100
    assert post(client, etf(name="n" * 101)).status_code == 422


@pytest.mark.parametrize("value", ["0", "0.00"])
def test_zero_money_is_accepted(client: TestClient, value: str) -> None:
    body = create(client, etf(amount_invested=value, current_value=value))
    assert body["amount_invested"] == "0.00"
    assert body["current_value"] == "0.00"

    other = create(client, etf())
    response = patch(client, other["id"], {"amount_invested": value, "current_value": value})
    assert response.status_code == 200
    assert response.json()["amount_invested"] == "0.00"
    assert response.json()["current_value"] == "0.00"
    assert response.json()["gain_pct"] is None


# --- Validation ------------------------------------------------------------------------------

BAD_MONEY = ["-0.01", "10.123", "1000000000000.00", "NaN", "Infinity", "abc"]

BAD_FIELDS: list[dict[str, Any]] = [
    *({"amount_invested": value} for value in BAD_MONEY),
    *({"current_value": value} for value in BAD_MONEY),
    {"type": "bond"},
    {"name": ""},
    {"name": "   "},
    {"name": "n" * 101},
    {"platform": "p" * 101},
    {"value_updated_at": "2026-02-30"},
    {"foo": 1},
]


@pytest.mark.parametrize("change", BAD_FIELDS)
def test_create_rejects(client: TestClient, change: dict[str, Any]) -> None:
    response = post(client, etf(**change))

    assert response.status_code == 422, response.text
    assert list_all(client)["items"] == []


@pytest.mark.parametrize("missing", ["name", "type", "amount_invested", "current_value"])
def test_create_requires_fields(client: TestClient, missing: str) -> None:
    body = etf()
    del body[missing]

    assert post(client, body).status_code == 422


def test_create_rejects_null_value_updated_at(client: TestClient) -> None:
    assert post(client, etf(value_updated_at=None)).status_code == 422


NULL_ON_PATCH = ["name", "type", "amount_invested", "current_value", "value_updated_at"]


@pytest.mark.parametrize("change", [*BAD_FIELDS, *({field: None} for field in NULL_ON_PATCH)])
def test_patch_rejects_and_leaves_row_unchanged(client: TestClient, change: dict[str, Any]) -> None:
    created = create(client, etf())

    response = patch(client, created["id"], change)

    assert response.status_code == 422, response.text
    assert get(client, created["id"]).json() == created


# --- Read, update, delete --------------------------------------------------------------------


def test_get_returns_the_list_item(client: TestClient) -> None:
    created = create(client, etf())

    response = get(client, created["id"])

    assert response.status_code == 200
    assert response.json() == created
    assert list_all(client)["items"] == [created]


def test_patch_fields_recomputes_gain(client: TestClient) -> None:
    created = create(client, etf(value_updated_at="2025-12-31"))

    response = patch(
        client, created["id"], {"name": "Bonds", "type": "fund", "amount_invested": "1150"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Bonds"
    assert body["type"] == "fund"
    assert body["amount_invested"] == "1150.00"
    assert body["gain"] == "0.00"
    assert body["gain_pct"] == "0.0000"
    assert body["value_updated_at"] == "2025-12-31"
    assert body["platform"] == "Broker X"
    assert get(client, created["id"]).json() == body


def test_patch_clears_platform(client: TestClient) -> None:
    created = create(client, etf())

    response = patch(client, created["id"], {"platform": None})

    assert response.status_code == 200
    assert response.json()["platform"] is None
    assert get(client, created["id"]).json()["platform"] is None


def test_patch_empty_body_changes_nothing(client: TestClient) -> None:
    created = create(client, etf(value_updated_at="2025-12-31"))

    response = patch(client, created["id"], {})

    assert response.status_code == 200
    assert response.json() == created
    assert get(client, created["id"]).json() == created


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"current_value": "1200"}, "2026-03-15"),
        ({"current_value": "1150"}, "2026-03-15"),  # same value as stored: still confirmed today
        ({"current_value": "1200", "value_updated_at": "2026-01-10"}, "2026-01-10"),
        ({"value_updated_at": "2026-01-10"}, "2026-01-10"),
        ({"name": "New"}, "2025-12-31"),
        ({}, "2025-12-31"),
    ],
)
def test_patch_value_updated_at(client: TestClient, change: dict[str, Any], expected: str) -> None:
    created = create(client, etf(value_updated_at="2025-12-31"))

    response = patch(client, created["id"], change)

    assert response.status_code == 200, response.text
    assert response.json()["value_updated_at"] == expected
    assert get(client, created["id"]).json()["value_updated_at"] == expected


def test_delete(client: TestClient) -> None:
    kept = create(client, etf(name="Kept", amount_invested="10", current_value="20"))
    created = create(client, etf())

    response = delete(client, created["id"])

    assert response.status_code == 204
    assert response.content == b""
    assert get(client, created["id"]).status_code == 404
    listing = list_all(client)
    assert listing["items"] == [kept]
    assert listing["totals"] == {
        "total_invested": "10.00",
        "current_value": "20.00",
        "gain": "10.00",
        "gain_pct": "1.0000",
    }


def test_unknown_id_is_404(client: TestClient) -> None:
    for response in (get(client, 999999), patch(client, 999999, {}), delete(client, 999999)):
        assert response.status_code == 404
        assert response.json() == NOT_FOUND


def test_non_integer_id_is_422(client: TestClient) -> None:
    assert get(client, "abc").status_code == 422
    assert patch(client, "abc", {}).status_code == 422
    assert delete(client, "abc").status_code == 422


# --- List and totals -------------------------------------------------------------------------


def test_list_empty(client: TestClient) -> None:
    assert list_all(client) == {"items": [], "totals": EMPTY_TOTALS}


def test_list_totals(client: TestClient) -> None:
    create(client, etf(name="One", amount_invested="1000", current_value="1150"))
    create(client, etf(name="Two", amount_invested="500", current_value="400"))
    create(client, etf(name="Three", amount_invested="0", current_value="50"))

    listing = list_all(client)

    assert len(listing["items"]) == 3
    assert listing["totals"] == {
        "total_invested": "1500.00",
        "current_value": "1600.00",
        "gain": "100.00",
        "gain_pct": "0.0667",
    }


def test_list_totals_with_zero_invested(client: TestClient) -> None:
    create(client, etf(amount_invested="0", current_value="50"))
    create(client, etf(amount_invested="0", current_value="0"))

    totals = list_all(client)["totals"]

    assert totals["total_invested"] == "0.00"
    assert totals["gain"] == "50.00"
    assert totals["gain_pct"] is None


def test_list_totals_decimal_precision(client: TestClient) -> None:
    create(client, etf(amount_invested="0.10", current_value="0.10"))
    create(client, etf(amount_invested="0.20", current_value="0.20"))

    assert list_all(client)["totals"]["total_invested"] == "0.30"


def test_list_totals_above_numeric_limit(client: TestClient) -> None:
    big = "999999999999.99"
    create(client, etf(amount_invested=big, current_value=big))
    create(client, etf(amount_invested=big, current_value=big))

    totals = list_all(client)["totals"]

    assert totals["total_invested"] == "1999999999999.98"
    assert totals["current_value"] == "1999999999999.98"


def test_list_order(client: TestClient) -> None:
    b = create(client, etf(name="b"))
    upper_a = create(client, etf(name="A"))
    lower_a = create(client, etf(name="a"))

    items = list_all(client)["items"]

    assert [item["id"] for item in items] == [upper_a["id"], lower_a["id"], b["id"]]
    assert [item["name"] for item in items] == ["A", "a", "b"]


# --- Data isolation, auth and Content-Type ---------------------------------------------------


def test_data_isolation(two_users: tuple[AuthenticatedClient, AuthenticatedClient]) -> None:
    alice, bob = (user.client for user in two_users)
    alices = create(alice, etf(amount_invested="1000", current_value="1150"))
    create(bob, etf(name="Bob's", amount_invested="10", current_value="5"))

    for response in (
        get(bob, alices["id"]),
        patch(bob, alices["id"], {"name": "Hacked", "current_value": "0"}),
        delete(bob, alices["id"]),
    ):
        assert response.status_code == 404
        assert response.json() == NOT_FOUND

    assert get(alice, alices["id"]).json() == alices
    bobs_list = list_all(bob)
    assert [item["name"] for item in bobs_list["items"]] == ["Bob's"]
    assert alices["id"] not in [item["id"] for item in bobs_list["items"]]
    assert bobs_list["totals"] == {
        "total_invested": "10.00",
        "current_value": "5.00",
        "gain": "-5.00",
        "gain_pct": "-0.5000",
    }
    assert list_all(alice)["items"] == [alices]


def test_routes_require_authentication(client: TestClient, app: FastAPI) -> None:
    created = create(client, etf())
    with TestClient(app) as anonymous:
        for response in (
            anonymous.get(URL),
            anonymous.post(URL, json=etf()),
            anonymous.get(f"{URL}/{created['id']}"),
            anonymous.patch(f"{URL}/{created['id']}", json={"name": "x"}),
            anonymous.delete(f"{URL}/{created['id']}", headers=JSON_HEADERS),
        ):
            assert response.status_code == 401
            assert response.json() == {"detail": "Not authenticated"}


def test_mutations_require_json_content_type(client: TestClient) -> None:
    created = create(client, etf())
    headers = {"Content-Type": "text/plain"}

    for response in (
        client.post(URL, content="{}", headers=headers),
        client.patch(f"{URL}/{created['id']}", content="{}", headers=headers),
        client.delete(f"{URL}/{created['id']}", headers=headers),
    ):
        assert response.status_code == 415
    assert get(client, created["id"]).json() == created
