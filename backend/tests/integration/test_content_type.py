import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User

DETAIL = {"detail": "Content-Type must be application/json"}
LOGIN_BODY = '{"email": "a@example.com", "password": "secret123"}'


def test_login_as_form_urlencoded_returns_415(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "secret123"},
    )
    client.cookies.clear()

    response = client.post(
        "/api/auth/login", data={"email": "a@example.com", "password": "secret123"}
    )

    assert response.status_code == 415
    assert response.json() == DETAIL
    assert "set-cookie" not in response.headers


def test_register_as_text_plain_returns_415_and_creates_no_user(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/auth/register", content=LOGIN_BODY, headers={"Content-Type": "text/plain"}
    )

    assert response.status_code == 415
    assert response.json() == DETAIL
    assert "set-cookie" not in response.headers
    assert db_session.scalars(select(User)).all() == []


def test_register_as_multipart_returns_415(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/auth/register",
        data={"email": "a@example.com", "password": "secret123"},
        files={"file": ("x.txt", b"x")},
    )

    assert response.status_code == 415
    assert response.json() == DETAIL
    assert db_session.scalars(select(User)).all() == []


def test_logout_requires_json_content_type(client: TestClient) -> None:
    missing = client.post("/api/auth/logout")
    assert "content-type" not in {k.lower() for k in missing.request.headers}
    assert missing.status_code == 415
    assert missing.json() == DETAIL

    ok = client.post("/api/auth/logout", headers={"Content-Type": "application/json"})
    assert ok.status_code == 204


@pytest.mark.parametrize(
    "content_type",
    ["application/json", "application/json; charset=utf-8", "Application/JSON"],
)
def test_json_content_type_variants_are_accepted(client: TestClient, content_type: str) -> None:
    response = client.post(
        "/api/auth/register",
        content='{"email": "a@example.com", "password": "secret123"}',
        headers={"Content-Type": content_type},
    )

    assert response.status_code == 201


@pytest.mark.parametrize("content_type", ["application/jsonx", "text/json", "application/xml"])
def test_other_media_types_are_rejected(client: TestClient, content_type: str) -> None:
    response = client.post(
        "/api/auth/register", content=LOGIN_BODY, headers={"Content-Type": content_type}
    )

    assert response.status_code == 415


def test_safe_methods_need_no_content_type(client: TestClient) -> None:
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/auth/me").status_code == 401  # reached the route, not 415
    assert client.get("/api/openapi.json").status_code == 200
    assert client.head("/api/health").status_code != 415
    assert client.options("/api/health").status_code != 415


def test_guard_is_app_wide_for_routes_added_later(app: FastAPI) -> None:
    calls: list[str] = []

    @app.put("/api/things/{thing_id}")
    def put_thing(thing_id: int) -> dict[str, int]:
        calls.append("put")
        return {"id": thing_id}

    @app.patch("/api/things/{thing_id}")
    def patch_thing(thing_id: int) -> dict[str, int]:
        calls.append("patch")
        return {"id": thing_id}

    @app.delete("/api/things/{thing_id}", status_code=204)
    def delete_thing(thing_id: int) -> None:
        calls.append("delete")

    with TestClient(app) as client:
        for method in ("PUT", "PATCH", "DELETE"):
            missing = client.request(method, "/api/things/1")
            assert missing.status_code == 415, method
            assert missing.json() == DETAIL
            wrong = client.request(
                method, "/api/things/1", content="x", headers={"Content-Type": "text/plain"}
            )
            assert wrong.status_code == 415, method
        assert calls == []

        for method in ("PUT", "PATCH", "DELETE"):
            ok = client.request(
                method, "/api/things/1", headers={"Content-Type": "application/json"}
            )
            assert ok.status_code in (200, 204), method
        assert calls == ["put", "patch", "delete"]

        # Even paths with no route are rejected before routing.
        assert client.delete("/api/does-not-exist").status_code == 415


def test_guard_ignores_paths_outside_api(app: FastAPI) -> None:
    @app.post("/not-api")
    def not_api() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(app) as client:
        assert client.post("/not-api").status_code == 200
