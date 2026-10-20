from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app

INDEX_HTML = "<!doctype html><title>PersonalDolar</title>"


@pytest.fixture
def dist_dir(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(INDEX_HTML)
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log('hi');")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    return tmp_path


def make_client(monkeypatch: pytest.MonkeyPatch, dist: Path) -> TestClient:
    monkeypatch.setenv("FRONTEND_DIST_DIR", str(dist))
    get_settings.cache_clear()
    return TestClient(create_app())


def test_root_serves_index_without_cache(monkeypatch: pytest.MonkeyPatch, dist_dir: Path) -> None:
    response = make_client(monkeypatch, dist_dir).get("/")
    assert response.status_code == 200
    assert response.text == INDEX_HTML
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("path", ["/investments", "/transactions", "/some/deep/route"])
def test_client_routes_fall_back_to_index(
    monkeypatch: pytest.MonkeyPatch, dist_dir: Path, path: str
) -> None:
    response = make_client(monkeypatch, dist_dir).get(path)
    assert response.status_code == 200
    assert response.text == INDEX_HTML


def test_hashed_asset_has_long_cache(monkeypatch: pytest.MonkeyPatch, dist_dir: Path) -> None:
    response = make_client(monkeypatch, dist_dir).get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.text == "console.log('hi');"
    assert "max-age=31536000" in response.headers["cache-control"]
    assert "immutable" in response.headers["cache-control"]


def test_root_file_is_served_not_cached_long(
    monkeypatch: pytest.MonkeyPatch, dist_dir: Path
) -> None:
    response = make_client(monkeypatch, dist_dir).get("/favicon.svg")
    assert response.text == "<svg/>"
    assert response.headers["cache-control"] == "no-cache"


def test_head_request_is_allowed(monkeypatch: pytest.MonkeyPatch, dist_dir: Path) -> None:
    response = make_client(monkeypatch, dist_dir).head("/assets/index-abc123.js")
    assert response.status_code == 200


def test_api_health_still_json(monkeypatch: pytest.MonkeyPatch, dist_dir: Path) -> None:
    response = make_client(monkeypatch, dist_dir).get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"


@pytest.mark.parametrize("path", ["/api/does-not-exist", "/api", "/api/"])
def test_unknown_api_path_is_json_404(
    monkeypatch: pytest.MonkeyPatch, dist_dir: Path, path: str
) -> None:
    response = make_client(monkeypatch, dist_dir).get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_path_traversal_is_not_served(
    monkeypatch: pytest.MonkeyPatch, dist_dir: Path, tmp_path_factory: pytest.TempPathFactory
) -> None:
    secret = tmp_path_factory.mktemp("outside") / "secret.txt"
    secret.write_text("TOP SECRET")
    client = make_client(monkeypatch, dist_dir)
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", f"/..%2f{secret.parent.name}/secret.txt"):
        assert "TOP SECRET" not in client.get(path).text


def test_no_dist_directory_changes_nothing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    response = make_client(monkeypatch, tmp_path / "missing").get("/investments")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
