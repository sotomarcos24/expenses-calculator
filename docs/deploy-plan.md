# Plan: M8 deployment (#46 then #47)

## Context
M8 polish is merged. Remaining: #46 (serving, Dockerfile, Postgres CI) and #47 (deploy to Render, README, no-secrets check). Docker is available locally (WSL integration), so the image is built and smoke-tested locally and in CI. User decisions: `psycopg[binary]` approved; provider = Render (Neon is the fallback if the free Postgres expiry is a problem).

## Steps
0. Resolve the uncommitted doc/command changes (AGENTS.md, docs/*, .claude/commands/*), then create branch `m8-deploy` from `main`.
1. #46 via `/next-issue` (engineer, then QA):
   - `backend/app/main.py`: serve `FRONTEND_DIST_DIR` with an SPA fallback and a JSON 404 for `/api/*`.
   - `backend/app/config.py`: `ENVIRONMENT` setting and production guard (JWT_SECRET, COOKIE_SECURE).
   - `Dockerfile`, `.dockerignore` and entrypoint (runs `alembic upgrade head`).
   - Add `psycopg[binary]` to `backend/pyproject.toml` and `uv.lock`.
   - `backend/tests/conftest.py`: run on SQLite or Postgres depending on `DATABASE_URL`.
   - `.github/workflows/ci.yml`: new jobs `backend-postgres` and `docker`.
2. #47 via `/next-issue`:
   - `render.yaml`, `DATABASE_URL` normalisation in `app/db.py`, README "Production", and a no-secrets CI check.
   - User does the Render account, repo connection and secrets; then the production smoke test.
3. `/close-milestone` to mark M8 done; update tech-spec §11 with the provider and free-tier limits.

## Verification
- Local: ruff, mypy and pytest (SQLite), frontend checks.
- CI: green `backend`, `frontend`, `backend-postgres` and `docker` jobs.
- Production: smoke-test checklist from #47 against the public HTTPS URL.
