# Backend guide

Read this before working on `backend/` (FastAPI, Python 3.12, uv). General rules live in [`AGENTS.md`](../AGENTS.md).

## Layout

```text
backend/
  app/{models,schemas,routers,services,simulator}
  tests/{unit,api}
  alembic/
```

## Commands

Run from `backend/`:

```bash
uv sync                               # install deps
uv run fastapi dev app/main.py        # dev server on :8000 (API docs: /api/docs)
uv run alembic upgrade head           # apply migrations
uv run alembic revision --autogenerate -m "<message>"   # new migration
uv run python -m scripts.export_openapi   # write ../openapi.json (add --check to only verify)
uv run ruff format . && uv run ruff check . && uv run mypy app tests scripts && uv run pytest
```

The last line is the full check set: run it before saying a backend task is done.

`openapi.json` at the repo root is the committed OpenAPI document. `scripts/export_openapi.py` builds it from `create_app()` without a server or database, and the output does not depend on env vars or `.env` (the title is pinned to the default `APP_NAME`). Run the export after any change to routes or schemas, then `npm run gen:api` in `frontend/`, and commit both files. CI regenerates `openapi.json` and fails if it differs from the committed file; the fix is the same two commands.

## Conventions

- App factory in `app/main.py`; every router is mounted under `/api`. New routers are registered in `create_app()`.
- DB session via the `DbSession` dependency (`app/db.py`); use `Annotated[...]` dependencies, never `= Depends(...)` defaults (ruff B008).
- Models inherit from `Base` + `TimestampMixin` (`app/models/base.py`) and are exported from `app/models/__init__.py` so Alembic sees them.
- Every schema change ships as an Alembic migration. Migrations must work on SQLite (batch mode is enabled) and Postgres.
- Keep routers thin; business logic lives in `app/services/`. `app/simulator/` is pure: no DB, no I/O, no FastAPI imports.
- Simulator: write the pure module and its tests **first**, then endpoints, then UI.
- Pydantic v2 schemas live in `app/schemas/`, separate from ORM models.
- Typing: `mypy --strict` must pass. Lint/format: ruff (line length 100).

## Tests

- `tests/unit` for pure logic and services, `tests/api` for endpoints using the `client` / `db_session` fixtures in `tests/conftest.py` (in-memory SQLite per test).
- Authenticated tests use the shared fixtures in `tests/conftest.py` (`auth_client`, `make_auth_client`, `two_users`), so ownership (404) tests are one-liners. Reuse them instead of re-implementing login in each test.
- Mutating requests (`POST`/`PUT`/`PATCH`/`DELETE`) in tests must send `Content-Type: application/json` — `json=` sets it, body-less calls pass `headers=JSON_HEADERS` — otherwise the guard answers 415.

## Environment

- Python 3.12 managed by `uv`; never `pip install` into the system Python.
- Works without a `.env` (defaults in `app/config.py` use `sqlite:///./dev.db`); copy `.env.example` to change settings. `.env.example` lists every variable.

## Current state

- Models: `User` (`app/models/user.py`, table `users`: `email` unique and stored lowercase, `password_hash`). Migration `alembic/versions/555b346a3f7c_create_users.py` creates it.
- `app/security.py` provides the auth building blocks: `hash_password` / `verify_password` (Argon2, `verify_password` never raises), `create_access_token` / `decode_access_token` (JWT HS256 signed with `JWT_SECRET`, `decode_access_token` returns the user id or `None`), and `normalize_email`.
- The default `JWT_SECRET` (in `app/config.py` and `.env.example`) is a dev-only value of 52 bytes; PyJWT warns for HMAC keys under 32 bytes.
- Auth router `app/routers/auth.py` (`/api/auth/register` 201, `/login` 200, `/logout` 204, `/me`), logic in `app/services/auth.py`, schemas in `app/schemas/auth.py` (`RegisterRequest`, `LoginRequest`, `UserRead {id, email, created_at}`). Register/login set the `access_token` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/api`, `Max-Age` = `ACCESS_TOKEN_DAYS`, `Secure` when `COOKIE_SECURE`); the router reads settings through a `get_settings` dependency so tests can override it.
- `CurrentUser` (in `app/security.py`) is the `Annotated[User, Depends(get_current_user)]` dependency for protected routes: it reads the `access_token` cookie and returns the user, or 401 `{"detail": "Not authenticated"}`.
- `RequireJsonContentTypeMiddleware` (`app/middleware.py`, registered in `create_app()`) answers **415** `{"detail": "Content-Type must be application/json"}` to every `POST`/`PUT`/`PATCH`/`DELETE` under `/api` whose media type is not `application/json`, including body-less requests (CSRF defence, tech-spec §5). New routers are covered automatically.
- Auth test fixtures in `tests/conftest.py`: `app`, `client`, `auth_client` (logged-in `AuthenticatedClient` with `.client`, `.email`, `.password`, `.user_id`), `make_auth_client(email)` (factory, one independent client per call), `two_users` (user A and user B for ownership/404 tests), plus the `register_user()` helper and `JSON_HEADERS`.

## Known caveats

- Tests use `httpx2` (the Starlette test client deprecates `httpx`).
