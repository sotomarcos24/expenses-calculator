from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.ratelimit import RateLimiter
from tests.conftest import DEFAULT_PASSWORD, JSON_HEADERS, register_user
from tests.unit.test_ratelimit import FakeClock

LIMIT_BODY = {"detail": "Too many attempts. Try again later."}


def _configure(app: FastAPI, trusted_proxy_count: int = 0) -> FakeClock:
    clock = FakeClock()
    app.state.rate_limiter = RateLimiter(clock)
    settings = Settings(
        rate_limit_login_attempts=3,
        rate_limit_register_attempts=2,
        trusted_proxy_count=trusted_proxy_count,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    return clock


@pytest.fixture
def limited_app(app: FastAPI) -> FastAPI:
    _configure(app)
    return app


@pytest.fixture
def limited_client(limited_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(limited_app) as c:
        yield c


def _login(client: TestClient, email: str, password: str, **kw: dict[str, str]) -> int:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers=JSON_HEADERS | kw.get("headers", {}),
    )
    return response.status_code


def test_login_limited_even_with_correct_credentials(limited_client: TestClient) -> None:
    # register_user consumes one register attempt only.
    user = register_user(limited_client, "u@example.com")
    assert _login(limited_client, user.email, "wrong-password") == 401
    assert _login(limited_client, user.email, DEFAULT_PASSWORD) == 200
    assert _login(limited_client, user.email, "wrong-password") == 401
    response = limited_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": DEFAULT_PASSWORD},
        headers=JSON_HEADERS,
    )
    assert response.status_code == 429
    assert response.json() == LIMIT_BODY
    assert int(response.headers["Retry-After"]) >= 1


def test_login_works_again_after_window(limited_app: FastAPI, limited_client: TestClient) -> None:
    clock = _configure(limited_app)
    user = register_user(limited_client, "u@example.com")
    for _ in range(3):
        _login(limited_client, user.email, "wrong-password")
    assert _login(limited_client, user.email, DEFAULT_PASSWORD) == 429
    clock.now += 60
    response = limited_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": DEFAULT_PASSWORD},
        headers=JSON_HEADERS,
    )
    assert response.status_code == 200
    assert "access_token" in response.cookies


def test_429_is_identical_for_known_and_unknown_email(limited_client: TestClient) -> None:
    register_user(limited_client, "known@example.com")
    for _ in range(3):
        _login(limited_client, "nobody@example.com", "x")
    known = limited_client.post(
        "/api/auth/login",
        json={"email": "known@example.com", "password": "x"},
        headers=JSON_HEADERS,
    )
    unknown = limited_client.post(
        "/api/auth/login",
        json={"email": "unknown@example.com", "password": "x"},
        headers=JSON_HEADERS,
    )
    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())
    assert known.status_code == 429


def test_register_has_its_own_counter(limited_client: TestClient) -> None:
    register_user(limited_client, "a@example.com")
    register_user(limited_client, "b@example.com")
    blocked = limited_client.post(
        "/api/auth/register",
        json={"email": "c@example.com", "password": DEFAULT_PASSWORD},
        headers=JSON_HEADERS,
    )
    assert blocked.status_code == 429
    assert blocked.json() == LIMIT_BODY
    assert int(blocked.headers["Retry-After"]) >= 1
    # Login is not affected by the register limit.
    assert _login(limited_client, "a@example.com", DEFAULT_PASSWORD) == 200
    # And the login limit does not block register once login is exhausted.


def test_login_limit_does_not_block_register(limited_client: TestClient) -> None:
    for _ in range(4):
        _login(limited_client, "x@example.com", "x")
    register_user(limited_client, "new@example.com")


def test_trusted_proxy_uses_right_most_forwarded_entries(limited_app: FastAPI) -> None:
    _configure(limited_app, trusted_proxy_count=1)
    with TestClient(limited_app) as c:
        for _ in range(3):
            assert (
                _login(c, "x@example.com", "x", headers={"X-Forwarded-For": "9.9.9.9, 1.1.1.1"})
                == 401
            )
        # Same trusted entry, different (forged) left side: still limited.
        assert (
            _login(c, "x@example.com", "x", headers={"X-Forwarded-For": "8.8.8.8, 1.1.1.1"}) == 429
        )
        # A different client IP has its own counter.
        assert (
            _login(c, "x@example.com", "x", headers={"X-Forwarded-For": "9.9.9.9, 2.2.2.2"}) == 401
        )


def test_forwarded_header_ignored_without_trusted_proxies(limited_app: FastAPI) -> None:
    with TestClient(limited_app) as c:
        for i in range(3):
            assert _login(c, "x@example.com", "x", headers={"X-Forwarded-For": f"7.7.7.{i}"}) == 401
        assert _login(c, "x@example.com", "x", headers={"X-Forwarded-For": "7.7.7.99"}) == 429


def test_missing_or_short_header_falls_back_to_socket_ip(limited_app: FastAPI) -> None:
    _configure(limited_app, trusted_proxy_count=2)
    with TestClient(limited_app) as c:
        assert _login(c, "x@example.com", "x") == 401
        assert _login(c, "x@example.com", "x", headers={"X-Forwarded-For": "1.1.1.1"}) == 401
        assert _login(c, "x@example.com", "x") == 401
        assert _login(c, "x@example.com", "x", headers={"X-Forwarded-For": "5.5.5.5"}) == 429


def test_other_endpoints_are_not_limited(limited_client: TestClient) -> None:
    user = register_user(limited_client, "u@example.com")
    for _ in range(6):
        assert limited_client.get("/api/auth/me").status_code == 200
        assert limited_client.get("/api/categories").status_code == 200
    for _ in range(6):
        assert limited_client.post("/api/auth/logout", headers=JSON_HEADERS).status_code == 204
    assert user.email
