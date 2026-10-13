from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import User
from app.security import JWT_ALGORITHM, create_access_token
from app.services import auth as auth_service
from tests.conftest import JSON_HEADERS, AuthenticatedClient

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"
LOGOUT = "/api/auth/logout"
ME = "/api/auth/me"


def post(client: TestClient, url: str, body: object = None) -> Response:
    if body is None:
        return client.post(url, headers=JSON_HEADERS)
    return client.post(url, json=body, headers=JSON_HEADERS)


def auth_cookie_header(response: Response) -> str:
    cookies = [c for c in response.headers.get_list("set-cookie") if "access_token=" in c]
    assert len(cookies) == 1, response.headers.get_list("set-cookie")
    return cookies[0]


def cookie_attributes(header: str) -> list[str]:
    return [part.strip().lower() for part in header.split(";")]


# --- register ---------------------------------------------------------------------------


def test_register_returns_user_and_sets_cookie(client: TestClient) -> None:
    response = post(client, REGISTER, {"email": "new@example.com", "password": "secret123"})

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "email", "created_at"}
    assert body["email"] == "new@example.com"
    attrs = cookie_attributes(auth_cookie_header(response))
    assert attrs[0].startswith("access_token=") and len(attrs[0]) > len("access_token=")
    assert "httponly" in attrs
    assert "samesite=lax" in attrs
    assert "path=/api" in attrs
    assert "max-age=604800" in attrs
    assert "secure" not in attrs


def test_register_cookie_is_secure_when_configured(app: FastAPI, client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(cookie_secure=True)

    response = post(client, REGISTER, {"email": "new@example.com", "password": "secret123"})

    assert response.status_code == 201
    assert "secure" in cookie_attributes(auth_cookie_header(response))


def test_register_me_logout_me(client: TestClient) -> None:
    assert (
        post(client, REGISTER, {"email": "a@example.com", "password": "secret123"}).status_code
        == 201
    )

    me = client.get(ME)
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"

    logout = post(client, LOGOUT)
    assert logout.status_code == 204
    attrs = cookie_attributes(auth_cookie_header(logout))
    assert "path=/api" in attrs
    assert "max-age=0" in attrs

    assert client.get(ME).status_code == 401


def test_register_duplicate_email_returns_409(client: TestClient) -> None:
    assert post(client, REGISTER, {"email": "a@b.com", "password": "secret123"}).status_code == 201

    for email in ("a@b.com", "A@B.com"):
        response = post(client, REGISTER, {"email": email, "password": "other-pass"})
        assert response.status_code == 409
        assert response.json() == {"detail": "An account with this email already exists"}
        assert "access_token" not in response.headers.get("set-cookie", "")


def test_register_duplicate_race_integrity_error_returns_409(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert post(client, REGISTER, {"email": "a@b.com", "password": "secret123"}).status_code == 201
    # Bypass the pre-check so the unique constraint fires on insert.
    monkeypatch.setattr(auth_service, "get_user_by_email", lambda _db, _email: None)

    response = post(client, REGISTER, {"email": "A@b.com", "password": "secret123"})

    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists"}
    # The session was rolled back and is still usable.
    other = post(client, REGISTER, {"email": "c@d.com", "password": "secret123"})
    assert other.status_code == 201
    assert len(db_session.scalars(select(User)).all()) == 2


def test_register_normalises_email(client: TestClient) -> None:
    response = post(client, REGISTER, {"email": "A@B.com", "password": "secret123"})

    assert response.status_code == 201
    assert response.json()["email"] == "a@b.com"
    for email in ("a@b.com", " A@B.COM "):
        login = post(client, LOGIN, {"email": email, "password": "secret123"})
        assert login.status_code == 200
        assert login.json()["email"] == "a@b.com"


@pytest.mark.parametrize(
    "body",
    [
        {"email": "not-an-email", "password": "secret123"},
        {"email": "a@example.com", "password": "x" * 7},
        {"email": "a@example.com", "password": "x" * 129},
        {"email": "a@example.com"},
        {"password": "secret123"},
        {},
    ],
)
def test_register_validation_errors(client: TestClient, db_session: Session, body: object) -> None:
    response = post(client, REGISTER, body)

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


@pytest.mark.parametrize("password", ["x" * 8, "y" * 128, "  spaces  "])
def test_register_accepts_password_length_bounds(client: TestClient, password: str) -> None:
    response = post(client, REGISTER, {"email": "a@example.com", "password": password})

    assert response.status_code == 201
    login = post(client, LOGIN, {"email": "a@example.com", "password": password})
    assert login.status_code == 200


def test_password_is_stored_as_argon2_hash_and_never_returned(
    client: TestClient, db_session: Session
) -> None:
    password = "secret123"
    responses = [post(client, REGISTER, {"email": "a@example.com", "password": password})]
    stored = db_session.scalars(select(User)).one()
    assert stored.password_hash.startswith("$argon2id$")
    assert password not in stored.password_hash

    responses.append(post(client, LOGIN, {"email": "a@example.com", "password": password}))
    responses.append(client.get(ME))
    responses.append(post(client, REGISTER, {"email": "a@example.com", "password": password}))
    responses.append(post(client, LOGIN, {"email": "a@example.com", "password": "wrong-pass"}))
    responses.append(post(client, REGISTER, {"email": "b@example.com", "password": "short"}))
    responses.append(post(client, LOGOUT))
    responses.append(client.get(ME))
    tokens = [
        auth_cookie_header(r).split(";")[0].removeprefix("access_token=") for r in responses[:2]
    ]

    for response in responses:
        text = response.text
        assert "password_hash" not in text
        assert stored.password_hash not in text
        for token in tokens:
            assert token not in text


# --- login ------------------------------------------------------------------------------


def test_login_sets_cookie_and_returns_user(client: TestClient) -> None:
    post(client, REGISTER, {"email": "a@example.com", "password": "secret123"})
    client.cookies.clear()

    response = post(client, LOGIN, {"email": "a@example.com", "password": "secret123"})

    assert response.status_code == 200
    assert set(response.json()) == {"id", "email", "created_at"}
    attrs = cookie_attributes(auth_cookie_header(response))
    assert {"httponly", "samesite=lax", "path=/api", "max-age=604800"} <= set(attrs)
    assert client.get(ME).json()["email"] == "a@example.com"


def test_login_wrong_password_and_unknown_email_are_identical(client: TestClient) -> None:
    post(client, REGISTER, {"email": "a@example.com", "password": "secret123"})
    client.cookies.clear()

    wrong = post(client, LOGIN, {"email": "a@example.com", "password": "wrong-pass"})
    unknown = post(client, LOGIN, {"email": "nobody@example.com", "password": "secret123"})

    for response in (wrong, unknown):
        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid email or password"}
        assert "set-cookie" not in response.headers
    assert wrong.content == unknown.content


@pytest.mark.parametrize(
    "body",
    [
        {"email": "not-an-email", "password": "secret123"},
        {"email": "a@example.com", "password": ""},
        {"email": "a@example.com", "password": "x" * 129},
        {"email": "a@example.com"},
    ],
)
def test_login_malformed_input_returns_422(client: TestClient, body: object) -> None:
    assert post(client, LOGIN, body).status_code == 422


# --- me / current user ------------------------------------------------------------------


def test_me_without_cookie_returns_401(client: TestClient) -> None:
    response = client.get(ME)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def _token(secret: str, user_id: int, expires_in: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + expires_in}
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


@pytest.mark.parametrize(
    "make_token",
    [
        pytest.param(
            lambda uid: _token(get_settings().jwt_secret, uid, timedelta(seconds=-10)),
            id="expired",
        ),
        pytest.param(
            lambda uid: _token(
                "another-secret-that-is-long-enough-for-hs256!!", uid, timedelta(days=1)
            ),
            id="other-secret",
        ),
        pytest.param(lambda uid: "not-a-jwt", id="garbage"),
        pytest.param(lambda uid: create_access_token(uid + 999), id="unknown-user"),
    ],
)
def test_me_rejects_invalid_tokens(client: TestClient, make_token: Callable[[int], str]) -> None:
    user_id = post(client, REGISTER, {"email": "a@example.com", "password": "secret123"}).json()[
        "id"
    ]
    client.cookies.clear()
    client.cookies.set("access_token", make_token(user_id))

    response = client.get(ME)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_me_rejects_token_of_deleted_user(client: TestClient, db_session: Session) -> None:
    post(client, REGISTER, {"email": "a@example.com", "password": "secret123"})
    db_session.delete(db_session.scalars(select(User)).one())
    db_session.commit()

    assert client.get(ME).status_code == 401


# --- logout -----------------------------------------------------------------------------


def test_logout_without_cookie_returns_204(client: TestClient) -> None:
    assert post(client, LOGOUT).status_code == 204


def test_logout_with_invalid_cookie_returns_204(client: TestClient) -> None:
    client.cookies.set("access_token", "garbage")

    assert post(client, LOGOUT).status_code == 204


# --- fixtures ---------------------------------------------------------------------------


def test_auth_client_fixture_is_logged_in(auth_client: AuthenticatedClient) -> None:
    response = auth_client.client.get(ME)

    assert response.status_code == 200
    assert response.json()["id"] == auth_client.user_id


def test_two_users_are_independent(
    two_users: tuple[AuthenticatedClient, AuthenticatedClient],
) -> None:
    user_a, user_b = two_users

    me_a = user_a.client.get(ME).json()
    me_b = user_b.client.get(ME).json()

    assert me_a["email"] == "alice@example.com"
    assert me_b["email"] == "bob@example.com"
    assert me_a["id"] != me_b["id"]


# --- OpenAPI ----------------------------------------------------------------------------


def test_openapi_lists_auth_endpoints(client: TestClient) -> None:
    spec = client.get("/api/openapi.json").json()
    paths = spec["paths"]

    def ref(schema: dict[str, str]) -> str:
        return schema["$ref"]

    register_op = paths[REGISTER]["post"]
    assert ref(register_op["requestBody"]["content"]["application/json"]["schema"]).endswith(
        "/RegisterRequest"
    )
    assert ref(register_op["responses"]["201"]["content"]["application/json"]["schema"]).endswith(
        "/UserRead"
    )
    login_op = paths[LOGIN]["post"]
    assert ref(login_op["requestBody"]["content"]["application/json"]["schema"]).endswith(
        "/LoginRequest"
    )
    assert ref(login_op["responses"]["200"]["content"]["application/json"]["schema"]).endswith(
        "/UserRead"
    )
    assert "204" in paths[LOGOUT]["post"]["responses"]
    assert ref(
        paths[ME]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    ).endswith("/UserRead")
    schemas = spec["components"]["schemas"]
    assert set(schemas["UserRead"]["properties"]) == {"id", "email", "created_at"}
