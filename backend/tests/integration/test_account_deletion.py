from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, CategoryAmount, Investment, Transaction, User
from app.security import ACCESS_TOKEN_COOKIE
from tests.conftest import DEFAULT_PASSWORD, AuthenticatedClient, register_user
from tests.integration.test_dashboard import add, top
from tests.integration.test_rate_limit import LIMIT_BODY, _configure

URL = "/api/auth/me"
MODELS: tuple[Any, ...] = (User, Category, Transaction, Investment, CategoryAmount)


def delete_me(client: TestClient, password: Any = DEFAULT_PASSWORD, **kwargs: Any) -> Any:
    return client.request("DELETE", URL, json={"password": password}, **kwargs)


def populate(client: TestClient) -> None:
    """Categories (seeded), transactions with subcategories, an investment and an amount."""
    food = top(client, "expense", "Food")
    sub = food["subcategories"][0]
    add(client, "expense", "2026-03-05", "20.00", food, sub)
    add(client, "expense", "2026-03-06", "5.00", food)
    salary = top(client, "income", "Salary")
    add(client, "income", "2026-03-01", "1000.00", salary)
    response = client.post(
        "/api/investments",
        json={"name": "ETF", "type": "etf", "amount_invested": "10", "current_value": "12"},
    )
    assert response.status_code == 201, response.text
    housing = top(client, "expense", "Housing")
    response = client.put(
        "/api/category-amounts", json={"category_id": housing["id"], "amount": "600"}
    )
    assert response.status_code in (200, 201), response.text


def counts(db: Session, user_id: int) -> dict[str, int]:
    result = {"users": db.scalar(select(func.count()).select_from(User).where(User.id == user_id))}
    for model in MODELS[1:]:
        result[model.__tablename__] = db.scalar(
            select(func.count()).select_from(model).where(model.user_id == user_id)
        )
    return {key: value or 0 for key, value in result.items()}


def test_delete_removes_all_data_and_keeps_other_users(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient], db_session: Session
) -> None:
    alice, bob = two_users
    populate(alice.client)
    populate(bob.client)
    bob_before = counts(db_session, bob.user_id)
    assert all(value > 0 for value in bob_before.values())
    assert counts(db_session, alice.user_id)["transactions"] == 3

    response = delete_me(alice.client)

    assert response.status_code == 204
    assert response.content == b""
    cookie = response.headers["set-cookie"]
    assert f"{ACCESS_TOKEN_COOKIE}=" in cookie
    assert "Max-Age=0" in cookie
    assert "Path=/api" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    db_session.expire_all()
    assert set(counts(db_session, alice.user_id).values()) == {0}
    assert counts(db_session, bob.user_id) == bob_before
    login = alice.client.post(
        "/api/auth/login", json={"email": alice.email, "password": alice.password}
    )
    assert login.status_code == 401
    assert bob.client.get(URL).status_code == 200
    assert bob.client.get("/api/transactions").json()["total"] == 3
    other = bob.client.post("/api/auth/login", json={"email": bob.email, "password": bob.password})
    assert other.status_code == 200


def test_wrong_password_deletes_nothing_and_keeps_session(
    auth_client: AuthenticatedClient, db_session: Session
) -> None:
    populate(auth_client.client)
    before = counts(db_session, auth_client.user_id)

    response = delete_me(auth_client.client, "wrong-password")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid password"}
    assert "set-cookie" not in response.headers
    assert counts(db_session, auth_client.user_id) == before
    assert auth_client.client.get(URL).status_code == 200


def test_requires_authentication(client: TestClient) -> None:
    response = delete_me(client)
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


@pytest.mark.parametrize(
    "body",
    [{}, {"password": ""}, {"password": "a" * 129}, {"other": "x"}],
)
def test_invalid_body_is_422_and_deletes_nothing(
    auth_client: AuthenticatedClient, db_session: Session, body: dict[str, Any]
) -> None:
    before = counts(db_session, auth_client.user_id)
    response = auth_client.client.request("DELETE", URL, json=body)
    assert response.status_code == 422
    assert counts(db_session, auth_client.user_id) == before


def test_non_json_content_type_is_415(auth_client: AuthenticatedClient) -> None:
    response = auth_client.client.request(
        "DELETE",
        URL,
        content=f'{{"password": "{DEFAULT_PASSWORD}"}}',
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 415
    assert auth_client.client.get(URL).status_code == 200


def test_old_token_gets_401_after_deletion(
    make_auth_client: Callable[[str], AuthenticatedClient],
) -> None:
    # Bob exists so the id of Alice is not the highest one: SQLite (no AUTOINCREMENT) can
    # reuse the highest rowid after a delete, Postgres sequences never do.
    alice = make_auth_client("alice@example.com")
    make_auth_client("bob@example.com")
    populate(alice.client)
    token = alice.client.cookies.get(ACCESS_TOKEN_COOKIE)
    assert token
    assert delete_me(alice.client).status_code == 204

    with TestClient(alice.client.app) as other:
        other.cookies.set(ACCESS_TOKEN_COOKIE, token, path="/api")
        for url in (URL, "/api/transactions", "/api/categories"):
            response = other.get(url)
            assert response.status_code == 401, url
            assert response.json() == {"detail": "Not authenticated"}


def test_deletion_is_atomic(
    auth_client: AuthenticatedClient,
    app: FastAPI,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    populate(auth_client.client)
    before = counts(db_session, auth_client.user_id)

    def boom(self: Session) -> None:
        raise RuntimeError("forced failure before commit")

    monkeypatch.setattr(Session, "commit", boom)
    with TestClient(app, raise_server_exceptions=False) as failing:
        failing.cookies.set(
            ACCESS_TOKEN_COOKIE,
            auth_client.client.cookies[ACCESS_TOKEN_COOKIE],
            path="/api",
        )
        response = delete_me(failing)
    assert response.status_code == 500
    monkeypatch.undo()

    db_session.expire_all()
    assert counts(db_session, auth_client.user_id) == before
    assert auth_client.client.get(URL).status_code == 200


def test_rate_limited_and_nothing_deleted(app: FastAPI, db_session: Session) -> None:
    _configure(app)
    with TestClient(app) as client:
        user = register_user(client, "u@example.com")
        populate(client)
        before = counts(db_session, user.user_id)
        for _ in range(3):
            assert delete_me(client, "wrong-password").status_code == 401

        response = delete_me(client)

        assert response.status_code == 429
        assert response.json() == LIMIT_BODY
        assert int(response.headers["Retry-After"]) >= 1
        assert counts(db_session, user.user_id) == before
