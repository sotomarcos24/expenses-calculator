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
uv run ruff format . && uv run ruff check . && uv run mypy app tests && uv run pytest
```

The last line is the full check set: run it before saying a backend task is done.

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
- From milestone 2 on, add shared fixtures in `tests/conftest.py` for authenticated tests: a helper that registers + logs in a user and returns a client carrying the cookie, and a way to get **two** different users, so ownership (404) tests are one-liners. Reuse them in every later milestone instead of re-implementing login in each test.

## Environment

- Python 3.12 managed by `uv`; never `pip install` into the system Python.
- Works without a `.env` (defaults in `app/config.py` use `sqlite:///./dev.db`); copy `.env.example` to change settings. `.env.example` lists every variable.

## Current state

- There are **no models or migrations yet**: the first migration (users) is created in milestone 2. `alembic/versions/` only contains a `.gitkeep`.

## Known caveats

- Tests use `httpx2` (the Starlette test client deprecates `httpx`).
