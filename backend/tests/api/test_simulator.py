from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services import investments as investments_service
from tests.conftest import AuthenticatedClient

BASE = "/api/simulator"
SCENARIOS = {"pessimistic": "0.05", "base": "0.05", "optimistic": "0.05"}
ZERO_SCENARIOS = {"pessimistic": "0", "base": "0", "optimistic": "0"}
NAMES = ("pessimistic", "base", "optimistic")


def accumulation(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "starting_amount": "10000",
        "contribution": "0",
        "frequency": "monthly",
        "horizon_years": 10,
        "scenarios": SCENARIOS,
        "inflation_rate": "0.02",
        "current_age": 30,
        "avg_monthly_expenses": "1000",
    }
    body.update(overrides)
    return body


def goal(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "starting_amount": "0",
        "target_amount": "100000",
        "years": 10,
        "frequency": "monthly",
        "scenarios": SCENARIOS,
        "inflation_rate": "0.02",
    }
    body.update(overrides)
    return body


def withdrawal(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "starting_amount": "100000",
        "contribution": "0",
        "frequency": "monthly",
        "scenarios": ZERO_SCENARIOS,
        "inflation_rate": "0",
        "current_age": 64,
        "avg_monthly_expenses": "1000",
        "retirement_age": 65,
        "end_age": 100,
        "withdrawal_mode": "fixed",
        "monthly_withdrawal": "1000",
    }
    body.update(overrides)
    return body


def assert_error_on(response: Any, field: str) -> None:
    assert response.status_code == 422, response.text
    assert any(field in error["loc"] for error in response.json()["detail"]), response.text


def assert_no_numbers(value: Any) -> None:
    """Amounts are strings: JSON numbers may only be integers (years, ages) or booleans."""
    if isinstance(value, dict):
        for item in value.values():
            assert_no_numbers(item)
    elif isinstance(value, list):
        for item in value:
            assert_no_numbers(item)
    else:
        assert not isinstance(value, float), value


# --- authentication --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/defaults", None),
        ("post", "/accumulation", accumulation()),
        ("post", "/goal", goal()),
        ("post", "/withdrawal", withdrawal()),
    ],
)
def test_requires_authentication(
    client: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = client.request(method, BASE + path, json=body)

    assert response.status_code == 401


# --- defaults --------------------------------------------------------------------------------


def add_investment(client: TestClient, value: str) -> None:
    response = client.post(
        "/api/investments",
        json={
            "name": "ETF",
            "type": "etf",
            "amount_invested": "100",
            "current_value": value,
        },
    )
    assert response.status_code == 201, response.text


def add_expense(client: TestClient, day: str, amount: str, kind: str = "expense") -> None:
    categories = client.get("/api/categories", params={"kind": kind}).json()
    response = client.post(
        "/api/transactions",
        json={
            "type": kind,
            "date": day,
            "amount": amount,
            "category_id": categories[0]["id"],
        },
    )
    assert response.status_code == 201, response.text


@pytest.fixture
def frozen_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(investments_service, "today", lambda: date(2026, 6, 15))


def test_defaults_without_data(auth_client: AuthenticatedClient) -> None:
    response = auth_client.client.get(f"{BASE}/defaults")

    assert response.status_code == 200
    assert response.json() == {
        "starting_amount": "0.00",
        "avg_monthly_expenses": "0.00",
        "inflation_rate": "0.02",
        "scenarios": {"pessimistic": "0.03", "base": "0.05", "optimistic": "0.07"},
    }


@pytest.mark.usefixtures("frozen_today")
def test_defaults_with_investments_and_expenses(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    add_investment(client, "1000")
    add_investment(client, "500")
    for day, amount in (("2026-01-10", "300"), ("2026-03-10", "600"), ("2026-05-31", "900")):
        add_expense(client, day, amount)
    add_expense(client, "2026-06-02", "5000")  # current month
    add_expense(client, "2025-05-31", "7000")  # older than 12 full months
    add_expense(client, "2026-02-01", "9000", kind="income")

    body = client.get(f"{BASE}/defaults").json()

    assert body["starting_amount"] == "1500.00"
    assert body["avg_monthly_expenses"] == "600.00"
    assert body["scenarios"] == {"pessimistic": "0.03", "base": "0.05", "optimistic": "0.07"}


@pytest.mark.usefixtures("frozen_today")
def test_defaults_ignore_other_users(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    alice, bob = two_users
    add_investment(alice.client, "1000")
    add_expense(alice.client, "2026-03-10", "600")

    body = bob.client.get(f"{BASE}/defaults").json()

    assert body["starting_amount"] == "0.00"
    assert body["avg_monthly_expenses"] == "0.00"


# --- Mode A ----------------------------------------------------------------------------------


def test_accumulation_returns_three_scenarios(auth_client: AuthenticatedClient) -> None:
    response = auth_client.client.post(
        f"{BASE}/accumulation",
        json=accumulation(
            scenarios={"pessimistic": "0.03", "base": "0.05", "optimistic": "0.07"},
            contribution="100",
        ),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == set(NAMES)
    for name in NAMES:
        assert len(body[name]["points"]) == 11
    assert float(body["pessimistic"]["points"][-1]["nominal"]) < float(
        body["base"]["points"][-1]["nominal"]
    )
    assert float(body["base"]["points"][-1]["nominal"]) < float(
        body["optimistic"]["points"][-1]["nominal"]
    )


def test_accumulation_known_value_with_nominal_and_real(auth_client: AuthenticatedClient) -> None:
    body = auth_client.client.post(f"{BASE}/accumulation", json=accumulation()).json()

    last = body["base"]["points"][-1]
    assert last["nominal"] == "16288.95"
    assert last["real"] == "13362.61"
    assert last["year"] == 10
    assert last["age"] == 40
    assert last["total_contributed"] == "0.00"
    assert body["base"]["years_of_expenses_covered"] == "1.11"
    assert_no_numbers(body)


def test_accumulation_without_expenses_has_null_coverage(
    auth_client: AuthenticatedClient,
) -> None:
    body = auth_client.client.post(
        f"{BASE}/accumulation", json=accumulation(avg_monthly_expenses="0")
    ).json()

    assert body["base"]["years_of_expenses_covered"] is None


def test_same_body_gives_identical_json(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    alice, bob = two_users
    add_investment(alice.client, "1000")
    for path, payload in (
        ("accumulation", accumulation(contribution="50")),
        ("goal", goal()),
        ("withdrawal", withdrawal()),
    ):
        first = alice.client.post(f"{BASE}/{path}", json=payload)
        again = alice.client.post(f"{BASE}/{path}", json=payload)
        other_user = bob.client.post(f"{BASE}/{path}", json=payload)

        assert first.status_code == 200
        assert first.content == again.content == other_user.content


# --- Mode B ----------------------------------------------------------------------------------


def test_goal_returns_required_contribution(auth_client: AuthenticatedClient) -> None:
    response = auth_client.client.post(
        f"{BASE}/goal", json=goal(scenarios=ZERO_SCENARIOS, inflation_rate="0")
    )

    assert response.status_code == 200, response.text
    body = response.json()
    for name in NAMES:
        assert body[name] == {
            "required_contribution": "833.33",
            "total_contributed": "100000.00",
            "already_reached": False,
            "nominal_target": "100000.00",
        }
    assert_no_numbers(body)


def test_goal_target_is_inflated_when_real(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    real = client.post(f"{BASE}/goal", json=goal()).json()["base"]
    nominal = client.post(f"{BASE}/goal", json=goal(target_is_real=False)).json()["base"]

    assert nominal["nominal_target"] == "100000.00"
    assert real["nominal_target"] == "121899.44"


def test_goal_already_reached(auth_client: AuthenticatedClient) -> None:
    body = auth_client.client.post(
        f"{BASE}/goal", json=goal(starting_amount="200000", target_amount="1000")
    ).json()

    for name in NAMES:
        assert body[name]["required_contribution"] == "0.00"
        assert body[name]["already_reached"] is True


# --- Mode C ----------------------------------------------------------------------------------


def test_withdrawal_runs_out_at_known_age(auth_client: AuthenticatedClient) -> None:
    response = auth_client.client.post(f"{BASE}/withdrawal", json=withdrawal())

    assert response.status_code == 200, response.text
    body = response.json()
    for name in NAMES:
        result = body[name]
        assert result["lasts_until_end"] is False
        assert result["depletion_age"] == 73
        assert result["balance_at_retirement_nominal"] == "100000.00"
        assert result["balance_at_retirement_real"] == "100000.00"
        assert result["monthly_income"] == "1000.00"
        assert result["expenses_coverage_pct"] == "1.0000"
        assert result["series"][-1]["age"] == 74
        assert result["series"][-1]["nominal"] == "0.00"
    assert_no_numbers(body)


def test_withdrawal_that_lasts(auth_client: AuthenticatedClient) -> None:
    body = auth_client.client.post(
        f"{BASE}/withdrawal", json=withdrawal(monthly_withdrawal="100")
    ).json()

    for name in NAMES:
        assert body[name]["lasts_until_end"] is True
        assert body[name]["depletion_age"] is None
        assert body[name]["series"][-1]["age"] == 100


def test_withdrawal_percent_mode(auth_client: AuthenticatedClient) -> None:
    body = auth_client.client.post(
        f"{BASE}/withdrawal",
        json=withdrawal(
            withdrawal_mode="percent",
            withdrawal_rate="0.12",
            monthly_withdrawal=None,
            avg_monthly_expenses="0",
        ),
    ).json()

    assert body["base"]["monthly_income"] == "1000.00"
    assert body["base"]["expenses_coverage_pct"] is None


def test_withdrawal_end_age_defaults_to_100(auth_client: AuthenticatedClient) -> None:
    payload = withdrawal(monthly_withdrawal="100")
    del payload["end_age"]

    body = auth_client.client.post(f"{BASE}/withdrawal", json=payload).json()

    assert body["base"]["series"][-1]["age"] == 100


# --- validation ------------------------------------------------------------------------------


def post(client: TestClient, path: str, body: dict[str, Any]) -> Any:
    return client.post(f"{BASE}/{path}", json=body)


@pytest.mark.parametrize("path", ["accumulation", "goal", "withdrawal"])
@pytest.mark.parametrize("rate", ["0.6", "-0.6"])
def test_scenario_rate_out_of_range(auth_client: AuthenticatedClient, path: str, rate: str) -> None:
    bodies = {"accumulation": accumulation, "goal": goal, "withdrawal": withdrawal}
    body = bodies[path](scenarios={**SCENARIOS, "optimistic": rate})

    assert_error_on(post(auth_client.client, path, body), "optimistic")


@pytest.mark.parametrize("path", ["accumulation", "goal", "withdrawal"])
def test_inflation_rate_out_of_range(auth_client: AuthenticatedClient, path: str) -> None:
    bodies = {"accumulation": accumulation, "goal": goal, "withdrawal": withdrawal}

    assert_error_on(
        post(auth_client.client, path, bodies[path](inflation_rate="0.6")), "inflation_rate"
    )


def test_accumulation_horizon_bounds(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client
    for horizon in (0, 61):
        assert_error_on(
            post(client, "accumulation", accumulation(horizon_years=horizon)), "horizon_years"
        )
    for horizon in (1, 60):
        assert post(client, "accumulation", accumulation(horizon_years=horizon)).status_code == 200


def test_goal_years_bounds(auth_client: AuthenticatedClient) -> None:
    for years in (0, 61):
        assert_error_on(post(auth_client.client, "goal", goal(years=years)), "years")


@pytest.mark.parametrize(
    ("path", "factory", "field"),
    [
        ("accumulation", accumulation, "starting_amount"),
        ("accumulation", accumulation, "contribution"),
        ("accumulation", accumulation, "avg_monthly_expenses"),
        ("goal", goal, "starting_amount"),
        ("goal", goal, "target_amount"),
        ("withdrawal", withdrawal, "monthly_withdrawal"),
    ],
)
@pytest.mark.parametrize("value", ["-1", "1000000000001"])
def test_money_bounds(
    auth_client: AuthenticatedClient, path: str, factory: Any, field: str, value: str
) -> None:
    assert_error_on(post(auth_client.client, path, factory(**{field: value})), field)


@pytest.mark.parametrize("value", ["-0.01", "0.6"])
def test_withdrawal_rate_bounds(auth_client: AuthenticatedClient, value: str) -> None:
    body = withdrawal(withdrawal_mode="percent", withdrawal_rate=value)

    assert_error_on(post(auth_client.client, "withdrawal", body), "withdrawal_rate")


@pytest.mark.parametrize("age", [-1, 121])
def test_current_age_bounds(auth_client: AuthenticatedClient, age: int) -> None:
    assert_error_on(
        post(auth_client.client, "accumulation", accumulation(current_age=age)), "current_age"
    )


def test_current_age_must_be_an_integer(auth_client: AuthenticatedClient) -> None:
    assert_error_on(
        post(auth_client.client, "accumulation", accumulation(current_age=30.5)), "current_age"
    )


@pytest.mark.parametrize("retirement_age", [64, 40])
def test_retirement_must_be_after_current_age(
    auth_client: AuthenticatedClient, retirement_age: int
) -> None:
    body = withdrawal(retirement_age=retirement_age)

    assert_error_on(post(auth_client.client, "withdrawal", body), "retirement_age")


def test_accumulation_phase_is_limited_to_60_years(auth_client: AuthenticatedClient) -> None:
    client = auth_client.client

    assert_error_on(
        post(client, "withdrawal", withdrawal(current_age=20, retirement_age=81, end_age=100)),
        "retirement_age",
    )
    ok = withdrawal(current_age=20, retirement_age=80, end_age=100)
    assert post(client, "withdrawal", ok).status_code == 200


@pytest.mark.parametrize("end_age", [65, 60, 121])
def test_end_age_bounds(auth_client: AuthenticatedClient, end_age: int) -> None:
    assert_error_on(post(auth_client.client, "withdrawal", withdrawal(end_age=end_age)), "end_age")


def test_percent_mode_requires_withdrawal_rate(auth_client: AuthenticatedClient) -> None:
    body = withdrawal(withdrawal_mode="percent", monthly_withdrawal=None)

    assert_error_on(post(auth_client.client, "withdrawal", body), "withdrawal_rate")


def test_fixed_mode_requires_monthly_withdrawal(auth_client: AuthenticatedClient) -> None:
    body = withdrawal(withdrawal_mode="fixed", monthly_withdrawal=None)

    assert_error_on(post(auth_client.client, "withdrawal", body), "monthly_withdrawal")


def test_invalid_withdrawal_mode(auth_client: AuthenticatedClient) -> None:
    assert_error_on(
        post(auth_client.client, "withdrawal", withdrawal(withdrawal_mode="weekly")),
        "withdrawal_mode",
    )


@pytest.mark.parametrize("path", ["accumulation", "goal", "withdrawal"])
def test_invalid_frequency(auth_client: AuthenticatedClient, path: str) -> None:
    bodies = {"accumulation": accumulation, "goal": goal, "withdrawal": withdrawal}

    assert_error_on(post(auth_client.client, path, bodies[path](frequency="daily")), "frequency")


def test_missing_field_is_reported(auth_client: AuthenticatedClient) -> None:
    body = accumulation()
    del body["scenarios"]

    assert_error_on(post(auth_client.client, "accumulation", body), "scenarios")


def test_invalid_current_age_does_not_hide_behind_retirement_checks(
    auth_client: AuthenticatedClient,
) -> None:
    response = post(auth_client.client, "withdrawal", withdrawal(current_age=130))

    assert_error_on(response, "current_age")
