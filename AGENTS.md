# AGENTS.md — PersonalDolar

Instructions for AI coding agents working on this repository. Read this first in every new session.

## Project

PersonalDolar is a single-user personal finance web app: manual income/expense tracking, investments with gain/loss, a dashboard, and a savings/retirement simulator. No bank connections, no market-data APIs, no paid services.

## Source of truth — read before working

| Document | What it defines |
| --- | --- |
| [`docs/plan.md`](docs/plan.md) | Product spec: features, user stories, acceptance criteria, non-goals |
| [`docs/tech-spec.md`](docs/tech-spec.md) | Technical design: stack, data model, auth, API, simulator formulas, frontend, testing |
| [`docs/milestones.md`](docs/milestones.md) | Delivery plan, per-milestone scope, acceptance criteria and **current status** |

- Check `docs/milestones.md` to know which milestone is in progress; only work on that milestone unless told otherwise.
- If the implementation must deviate from the specs, update the spec in the same change and mention it to the user.
- Do not add features listed as non-goals in `docs/plan.md` §6 (e.g. bank imports, live prices, multi-currency, password reset).

## Starting a session

1. Read `docs/milestones.md`: the status table says which milestone is in progress, and the milestone section may contain **Progress notes** left by the previous session.
2. Run `git status` and `git log --oneline -10` to see uncommitted or unpushed work, and check you are on the right branch.
3. Run the checks of both projects (see Commands) to confirm the baseline is green before changing anything.
4. If something in the docs contradicts the code, trust the code, tell the user, and fix the docs.

## Ending a session (handoff)

If a milestone is left unfinished, add a `#### Progress notes` subsection at the end of that milestone in `docs/milestones.md` with: what is done, what is next, and any decision or problem found. Tick the acceptance criteria already met (`- [x]`). Remove the notes when the milestone is completed.

Also keep the **Current state of the code** section below accurate (e.g. remove the "no models yet" note once they exist, delete installed libraries from the pending list).

## Communication

- Talk to the user in **Spanish**.
- Code, comments, commit messages, docs and UI text are in **English** (the app's language is English, currency USD).

## Repository layout

```text
backend/    FastAPI API (Python 3.12, uv)        → app/{models,schemas,routers,services,simulator}, tests/{unit,api}
frontend/   React 19 + Vite + TypeScript SPA     → src/{api,pages,components,hooks,lib}
docs/       product spec, tech spec, milestones
.github/workflows/ci.yml   CI for both projects
```

## Commands

Backend (run from `backend/`):

```bash
uv sync                               # install deps
uv run fastapi dev app/main.py        # dev server on :8000 (API docs: /api/docs)
uv run alembic upgrade head           # apply migrations
uv run alembic revision --autogenerate -m "<message>"   # new migration
uv run ruff format . && uv run ruff check . && uv run mypy app tests && uv run pytest
```

Frontend (run from `frontend/`):

```bash
npm install
npm run dev                           # :5173, proxies /api → :8000
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

Always run the full check set of the side you changed before saying a task is done, and report failures honestly.

## Workflow

- One milestone = one branch named `m<N>-<slug>` (e.g. `m2-auth`), merged into `main` via PR with green CI.
- Commit or push only when the user asks.
- A milestone is finished only when its acceptance criteria and the **Definition of done** in `docs/milestones.md` are met; then update its status there and in the table in `docs/plan.md` §8.
- For the simulator: write the pure module and its tests **first**, then endpoints, then UI.

## Current state of the code

- Milestone 1 (scaffolding) is done; the next milestone is shown in `docs/milestones.md`.
- There are **no models or migrations yet**: the first migration (users) is created in milestone 2. `backend/alembic/versions/` only contains a `.gitkeep`.
- The frontend pages are placeholders (`<Placeholder milestone={N} />`); replace them when the corresponding milestone is built.
- Libraries named in the tech spec but **not installed yet** — add them when a milestone needs them (they are already approved):
  - `recharts` (charts, M6–M7), `react-hook-form` + `zod` + `@hookform/resolvers` (forms, from M2), `openapi-typescript` (see caveats).
  - shadcn/ui is not initialised. Either run its CLI (non-interactive flags) or write small components in `src/components/`; whichever is chosen, they must use the theme tokens.
- Git: `main` tracks `origin` (`github.com/sotomarcos24/expenses-calculator`). Create milestone branches from an up-to-date `main`.

## Backend conventions

- App factory in `app/main.py`; every router is mounted under `/api`.
- DB session via the `DbSession` dependency (`app/db.py`); use `Annotated[...]` dependencies, never `= Depends(...)` defaults (ruff B008).
- Models inherit from `Base` + `TimestampMixin` (`app/models/base.py`) and are exported from `app/models/__init__.py` so Alembic sees them.
- Every schema change ships as an Alembic migration. Migrations must work on SQLite (batch mode is enabled) and Postgres.
- Keep routers thin; business logic lives in `app/services/`. `app/simulator/` is pure: no DB, no I/O, no FastAPI imports.
- Pydantic v2 schemas live in `app/schemas/`, separate from ORM models.
- Typing: `mypy --strict` must pass. Lint/format: ruff (line length 100).
- Tests: `tests/unit` for pure logic and services, `tests/api` for endpoints using the `client` / `db_session` fixtures in `tests/conftest.py` (in-memory SQLite per test).
- From milestone 2 on, add shared fixtures in `tests/conftest.py` for authenticated tests: a helper that registers + logs in a user and returns a client carrying the cookie, and a way to get **two** different users, so ownership (404) tests are one-liners. Reuse them in every later milestone instead of re-implementing login in each test.
- New routers are registered in `create_app()` in `app/main.py`.

## Frontend conventions

- Routes are declared in `src/routes.tsx`; pages in `src/pages/`, shared UI in `src/components/`.
- All HTTP calls go through `apiFetch` (`src/api/client.ts`); server state via TanStack Query hooks in `src/hooks/`.
- Colours: use only the theme tokens defined in `src/index.css` (`bg-primary`, `text-muted`, `border-border`, `text-gain`, …). Never hard-code hex values in components. Palette: white and blue (tech-spec §8.1).
- Format money and percentages with `formatCurrency` / `formatPercent` (`src/lib/format.ts`).
- Imports use explicit `.ts` / `.tsx` extensions. Prettier style: no semicolons, single quotes, width 100.
- Tests next to the code (`*.test.ts(x)`) with Vitest + Testing Library.

## Non-negotiable rules

- **Money:** `Decimal` in Python, `NUMERIC` in the DB, decimal **strings** in JSON. Never use `float` for amounts.
- **Data isolation:** every query on user data filters by the current user. Accessing another user's resource returns **404**. Foreign keys received in a request body (e.g. `category_id`) must be checked to belong to the current user. Each new endpoint gets a test proving this.
- **Auth:** JWT only in the `access_token` httpOnly cookie (never in localStorage or response bodies). Passwords hashed with Argon2; hashes never returned.
- **Secrets:** never commit `.env`, databases or secrets. Configuration comes from environment variables (`backend/.env.example` lists them).
- **Simulator:** results must be deterministic and covered by unit tests with known values; the UI always shows the "not financial advice" disclaimer.
- Do not add dependencies or external services that are not in the tech spec without asking the user.

## Environment

- Development happens on Linux (WSL2). Docker is **not** installed locally; the Dockerfile planned for milestone 8 can only be verified in CI or on the hosting provider.
- Local Node is 25, CI uses Node 24; avoid APIs only available in Node 25.
- Python 3.12 managed by `uv`; never `pip install` into the system Python.
- The backend works without a `.env` (defaults in `app/config.py` use `sqlite:///./dev.db`); copy `.env.example` to change settings.
- To check the app end to end, start the backend and the frontend dev servers and use `http://localhost:5173`; `/api/health` must answer through the proxy.

## Known caveats

- `openapi-typescript` does not yet support TypeScript 6 (it is planned for milestone 2); check compatibility before adding it.
- Backend tests use `httpx2` (the Starlette test client deprecates `httpx`).
