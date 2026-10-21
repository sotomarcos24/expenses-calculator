# Testing

## Test types

| Type | Where | What it covers | Database |
| --- | --- | --- | --- |
| Backend unit | `backend/tests/unit/` | Pure logic and services: simulator, periods, security helpers, rate limiter, config, model defaults, URL normalisation | in-memory SQLite where a session is needed |
| Backend integration | `backend/tests/integration/` | HTTP endpoints through `TestClient` with the real app and a real database | in-memory SQLite per test, or Postgres when the process has `DATABASE_URL=postgresql+...` (each test in a rolled-back transaction) |
| Frontend | `frontend/src/**/*.test.ts(x)` | Components, pages, hooks and lib code with Vitest + Testing Library (API mocked) | none |

`backend/tests/conftest.py` marks every test by directory (`unit` / `integration`); both markers are registered in `backend/pyproject.toml` with `--strict-markers`, so a typo in a marker fails.

## Key integration flows

- Auth: register, login, logout, `me`, cookie handling, validation (`test_auth.py`).
- Account deletion: `DELETE /api/auth/me`, wrong password, cascade of all user data (`test_account_deletion.py`).
- Data isolation: every resource of another user answers 404, foreign keys in bodies are checked (in each resource file).
- Categories, category amounts and seed (`test_categories.py`, `test_category_amounts.py`, `test_category_seed.py`).
- Transactions: CRUD, filters, pagination, validation (`test_transactions.py`).
- Investments: CRUD and gain/loss (`test_investments.py`).
- Dashboard: summaries, periods, category breakdown (`test_dashboard.py`).
- Simulator: defaults and the accumulation, goal and withdrawal endpoints (`test_simulator.py`).
- Rate limit: login/register throttling, 429 and proxy headers (`test_rate_limit.py`).
- Health and content type (`test_health.py`, `test_content_type.py`).

## How to run

Single command from the repo root (any cwd for the script): all three blocks, one PASS/FAIL line each, non-zero exit if any block fails.

```bash
make test             # same as ./scripts/test.sh
./scripts/test.sh --postgres   # integration block against a temporary postgres:17 (needs Docker)
```

`--postgres` starts a throwaway container on `127.0.0.1:55432`, runs the migrations and the integration tests against it, and always removes the container (also on failure or Ctrl+C). Without it the integration block uses `DATABASE_URL` if set, else SQLite.

Each block separately:

```bash
cd backend && uv run pytest -m unit          # or: make test-unit
cd backend && uv run pytest -m integration   # or: make test-integration
cd backend && uv run pytest                  # both
cd frontend && npm test
```

## What CI runs

`.github/workflows/ci.yml`: `backend` (ruff format/check, mypy, full pytest with coverage, openapi check), `backend-postgres` (migrations, `alembic check`, `pytest -m integration` on Postgres 17), `frontend` (lint, format:check, typecheck, test, build), plus `docker`, `no-secrets`, `semgrep` and `deploy`. Lint and type checks are not part of `make test`; see `docs/backend.md` and `docs/frontend.md` for the full check sets.
