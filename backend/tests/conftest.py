import os
from collections.abc import Callable, Iterator
from dataclasses import dataclass

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import get_db, make_engine
from app.main import create_app
from app.models import Base

# Mutating requests must send this header, or the Content-Type guard answers 415.
JSON_HEADERS = {"Content-Type": "application/json"}
DEFAULT_PASSWORD = "secret123"


@dataclass
class AuthenticatedClient:
    """A test client carrying the `access_token` cookie of a registered user."""

    client: TestClient
    email: str
    password: str
    user_id: int


@pytest.fixture(autouse=True)
def _rate_limits_off(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Suites register many users from one IP: disable the limits unless a test sets them."""
    monkeypatch.setenv("RATE_LIMIT_LOGIN_ATTEMPTS", "0")
    monkeypatch.setenv("RATE_LIMIT_REGISTER_ATTEMPTS", "0")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _postgres_url() -> str | None:
    """`DATABASE_URL` from the process environment when it points at Postgres (CI job)."""
    url = os.environ.get("DATABASE_URL", "")
    return url if url.startswith("postgresql") else None


@pytest.fixture(scope="session")
def postgres_engine() -> Iterator[Engine | None]:
    url = _postgres_url()
    if url is None:
        yield None
        return
    engine = make_engine(url)
    # No-op when `alembic upgrade head` already created the schema (as in CI).
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(postgres_engine: Engine | None) -> Iterator[Session]:
    if postgres_engine is not None:
        # Postgres: everything runs in one outer transaction that is rolled back after the
        # test; session commits/rollbacks only release savepoints, so tests stay isolated.
        with postgres_engine.connect() as connection:
            transaction = connection.begin()
            with Session(
                bind=connection,
                autoflush=False,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            ) as session:
                yield session
            transaction.rollback()
        return
    # SQLite: fresh in-memory database per test; StaticPool keeps a single shared connection.
    engine = make_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with session_factory() as session:
        yield session
    engine.dispose()


@pytest.fixture
def app(db_session: Session) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db_session
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def register_user(
    client: TestClient, email: str, password: str = DEFAULT_PASSWORD
) -> AuthenticatedClient:
    """Register `email` through the API; `client` keeps the returned cookie (logged in)."""
    response = client.post(
        "/api/auth/register", json={"email": email, "password": password}, headers=JSON_HEADERS
    )
    assert response.status_code == 201, response.text
    return AuthenticatedClient(
        client=client, email=email, password=password, user_id=response.json()["id"]
    )


@pytest.fixture
def make_auth_client(app: FastAPI) -> Iterator[Callable[[str], AuthenticatedClient]]:
    """Factory: `make_auth_client("x@example.com")` returns a new logged-in client.

    Every call creates an independent `TestClient` (own cookie jar) on the same app and
    database, so several users can be used in one test.
    """
    clients: list[TestClient] = []

    def factory(email: str) -> AuthenticatedClient:
        test_client = TestClient(app)
        test_client.__enter__()
        clients.append(test_client)
        return register_user(test_client, email)

    yield factory
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def auth_client(
    make_auth_client: Callable[[str], AuthenticatedClient],
) -> AuthenticatedClient:
    """A logged-in client for `user@example.com`."""
    return make_auth_client("user@example.com")


@pytest.fixture
def two_users(
    make_auth_client: Callable[[str], AuthenticatedClient],
) -> tuple[AuthenticatedClient, AuthenticatedClient]:
    """Two independent logged-in clients (user A, user B) for ownership (404) tests."""
    return make_auth_client("alice@example.com"), make_auth_client("bob@example.com")


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Mark every test by its directory: tests/unit -> unit, tests/integration -> integration."""
    for item in items:
        parts = item.path.parts
        if "unit" in parts:
            item.add_marker(pytest.mark.unit)
        elif "integration" in parts:
            item.add_marker(pytest.mark.integration)
