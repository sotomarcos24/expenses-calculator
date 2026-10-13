import json

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from scripts.export_openapi import build_openapi, render_openapi


def test_exported_spec_matches_served_spec_with_default_settings(client: TestClient) -> None:
    served = client.get("/api/openapi.json").json()
    assert build_openapi() == served


def test_export_is_independent_of_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    baseline = render_openapi()
    monkeypatch.setenv("APP_NAME", "SomethingElse")
    monkeypatch.setenv("JWT_SECRET", "another-secret-that-is-long-enough-for-hs256-0123")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./not-used.db")
    get_settings.cache_clear()
    try:
        assert render_openapi() == baseline
    finally:
        get_settings.cache_clear()


def test_export_format_and_auth_contract() -> None:
    content = render_openapi()
    assert content.endswith("}\n")
    spec = json.loads(content)
    assert spec["info"]["title"] == "PersonalDolar API"
    for path in ("/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/me"):
        assert path in spec["paths"]
    user_read = spec["components"]["schemas"]["UserRead"]
    assert set(user_read["properties"]) == {"id", "email", "created_at"}
    assert "password_hash" not in content
