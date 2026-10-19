import pytest

from app.db import make_engine, normalize_database_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (
            "postgres://user:password@host:5432/db",
            "postgresql+psycopg://user:password@host:5432/db",
        ),
        (
            "postgresql://user:password@host/db?sslmode=require",
            "postgresql+psycopg://user:password@host/db?sslmode=require",
        ),
        (
            "postgresql+psycopg://user:password@host/db",
            "postgresql+psycopg://user:password@host/db",
        ),
        ("sqlite:///./dev.db", "sqlite:///./dev.db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_normalize_database_url(url: str, expected: str) -> None:
    assert normalize_database_url(url) == expected


def test_make_engine_uses_psycopg_for_provider_urls() -> None:
    engine = make_engine("postgres://user:password@localhost:5432/db")
    assert engine.dialect.driver == "psycopg"
    assert engine.url.drivername == "postgresql+psycopg"
