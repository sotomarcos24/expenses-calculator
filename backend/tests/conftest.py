from collections.abc import Callable, Iterator
from dataclasses import dataclass

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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


@pytest.fixture
def db_session() -> Iterator[Session]:
    # Fresh in-memory database per test; StaticPool keeps a single shared connection.
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
