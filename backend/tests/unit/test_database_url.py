import pytest

from app.db import make_engine, normalize_database_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("postgres://u:p@host:5432/db", "postgresql+psycopg://u:p@host:5432/db"),
        (
            "postgresql://u:p@host/db?sslmode=require",
            "postgresql+psycopg://u:p@host/db?sslmode=require",
        ),
        ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("sqlite:///./dev.db", "sqlite:///./dev.db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_normalize_database_url(url: str, expected: str) -> None:
    assert normalize_database_url(url) == expected


def test_make_engine_uses_psycopg_for_provider_urls() -> None:
    engine = make_engine("postgres://u:p@localhost:5432/db")
    assert engine.dialect.driver == "psycopg"
    assert engine.url.drivername == "postgresql+psycopg"
