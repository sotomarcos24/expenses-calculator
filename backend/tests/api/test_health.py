import pytest
from fastapi.testclient import TestClient

from app.config import get_settings


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["commit"]


def test_health_reports_commit_from_render(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("RENDER_GIT_COMMIT", "abc123")
    get_settings.cache_clear()

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "commit": "abc123"}


def test_health_commit_unknown_when_unset(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
    get_settings.cache_clear()

    assert client.get("/api/health").json()["commit"] == "unknown"


@pytest.mark.parametrize("value", ["", "   "])
def test_health_commit_unknown_when_blank(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("RENDER_GIT_COMMIT", value)
    get_settings.cache_clear()

    assert client.get("/api/health").json()["commit"] == "unknown"


def test_health_needs_no_cookie(client: TestClient) -> None:
    assert not client.cookies
    assert client.get("/api/health").status_code == 200


def test_openapi_is_served_under_api(client: TestClient) -> None:
    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "PersonalDolar API"
