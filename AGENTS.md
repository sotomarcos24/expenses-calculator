# AGENTS.md — PersonalDolar

Instructions for AI coding agents working on this repository. Read this first in every new session.

## Project

PersonalDolar is a single-user personal finance web app: manual income/expense tracking, investments with gain/loss, a dashboard, and a savings/retirement simulator. No bank connections, no market-data APIs, no paid services.

## Documents

Always read:

| Document | What it defines |
| --- | --- |
| [`docs/milestones.md`](docs/milestones.md) | Delivery plan, per-milestone scope, acceptance criteria and **current status** |
| [`docs/process.md`](docs/process.md) | **How work is done**: orchestrator + PM / Engineer / QA subagents, issue lifecycle, rules |

Read **only when the task needs it**:

| Document | Read when |
| --- | --- |
| [`docs/backend.md`](docs/backend.md) | Touching `backend/`: commands, conventions, tests, current state, caveats |
| [`docs/frontend.md`](docs/frontend.md) | Touching `frontend/`: commands, conventions, tests, current state, caveats |
| [`docs/plan.md`](docs/plan.md) | Product questions: features, user stories, non-goals (§6) |
| [`docs/tech-spec.md`](docs/tech-spec.md) | Technical design: data model, auth, API, simulator formulas |
| [`docs/task-template.md`](docs/task-template.md), [`docs/team/`](docs/team/) | Grooming issues / acting as one of the subagent roles |

- Only work on the milestone in progress unless told otherwise.
- If the implementation must deviate from the specs, update the spec in the same change and mention it to the user.
- Do not add features listed as non-goals in `docs/plan.md` §6 (e.g. bank imports, live prices, multi-currency, password reset).

## Starting a session

1. Read `docs/milestones.md`: the status table says which milestone is in progress, and the milestone section may contain **Progress notes** left by the previous session.
2. Run `git status` and `git log --oneline -10` to see uncommitted or unpushed work, and check you are on the right branch.
3. Run the full checks of both projects (see `docs/backend.md` and `docs/frontend.md`) to confirm the baseline is green before changing anything.
4. If something in the docs contradicts the code, trust the code, tell the user, and fix the docs.
5. Check the backlog: `gh issue list --label m<N>` for the milestone in progress.

## How work is done — orchestrator loop

Every task follows [`docs/process.md`](docs/process.md). In short:

- The **main session is the orchestrator**. It launches the subagents in `.claude/agents/` — `project-manager`, `software-engineer`, `qa-engineer` — and does **not** groom, implement or test itself.
- At intake (`/plan-milestone`) the PM creates **and grooms** every issue of the milestone in one pass (2–3 issues, labels `m<N>` + `groomed`).
- For each open issue of the current milestone: **Engineer implements → QA verifies** (the issue already is the plan; the PM does not take part) → on FAIL back to the engineer with the QA comment, on PASS the orchestrator closes the issue. Repeat until the backlog is empty, then do the milestone wrap-up (`/close-milestone`).
- `/run-milestone` runs the whole backlog without asking between issues and closes each on QA PASS; `/next-issue` runs a single issue and asks before closing. Neither pushes nor opens PRs.
- The PM only acts at intake (`/plan-milestone`), or to fix one issue when the engineer reports an invalid acceptance criterion. An issue without the `groomed` label stops the loop and the user is asked; the loop never grooms.
- Never implement an ungroomed issue. The engineer never closes issues. QA never changes code. Only the orchestrator closes an issue, and only after `## QA: PASS`.
- QA (Sonnet) runs only the tests of the side(s) the issue changed, checks that every acceptance criterion is covered by a test, and opens the browser only for issues that change a page, at desktop width (375px is checked once in M8).
- Subagents end with a report of at most 5 lines; details live in the issue comments. The orchestrator reads full comments only when a step needs them (e.g. a QA FAIL for the engineer).
- After 3 consecutive QA FAILs on one issue, stop and ask the user.
- Subagents start without context: always pass them the issue number, the branch and relevant user instructions.

## Ending a session (handoff)

If a milestone is left unfinished, add a `#### Progress notes` subsection at the end of that milestone in `docs/milestones.md` with: what is done, what is next, and any decision or problem found. Tick the acceptance criteria already met (`- [x]`). Remove the notes when the milestone is completed.

Also keep the **Current state** sections accurate, here and in `docs/backend.md` / `docs/frontend.md` (e.g. remove the "no models yet" note once they exist, delete installed libraries from the pending list).

## Communication

- Talk to the user in **Spanish**.
- Code, comments, commit messages, docs and UI text are in **English** (the app's language is English, currency USD).

## Repository layout

```text
backend/    FastAPI API (Python 3.12, uv)        → docs/backend.md
frontend/   React 19 + Vite + TypeScript SPA     → docs/frontend.md
docs/       specs, milestones, process, team roles
.github/workflows/ci.yml   CI for both projects
```

## Workflow

- One milestone = one branch named `m<N>-<slug>` (e.g. `m2-auth`), created from an up-to-date `main` and merged into `main` via PR with green CI.
- Inside the orchestrator loop the software engineer commits on the milestone branch (never on `main`). Push and open PRs only when the user asks.
- Issues are managed with the `gh` CLI (must be installed and authenticated).
- Always run the full check set of the side you changed before saying a task is done, and report failures honestly.
- A milestone is finished only when its acceptance criteria and the **Definition of done** in `docs/milestones.md` are met; then update its status there and in the table in `docs/plan.md` §8.

## Current state

- Milestones 1 (scaffolding), 2 (authentication), 3 (categories), 4 (transactions), 5 (investments), 6 (dashboard) and 7 (simulator) are done. **M8 — Polish and deployment** is partially done: the polish part (#44 UX, #45 accessibility, #10 rate limiting, #9 post-login redirect, #48/#49 category totals, #33 dialog focus) is merged into `main`; the deployment part is **pending** and its acceptance criteria stay unticked in `docs/milestones.md` (see its *Progress notes*).
- Open issue: **#47** (Render deploy config, `DATABASE_URL` normalisation, `render.yaml`, README "Production", no-secrets check, production smoke test; labelled `m8` and `groomed`; the repo side - `normalize_database_url`, `render.yaml`, `no-secrets` CI job, README "Production" - is merged into `main`; the provider steps and production smoke test need the user). #46 (production serving, Dockerfile, production settings guard, `psycopg[binary]`, `backend-postgres` and `docker` CI jobs) passed QA, is closed and merged into `main`; its CI jobs run on GitHub from the `m8-deploy` PR. #47 stays open until the user finishes the Render steps (account, Blueprint, public URL, smoke test, free-tier limits check); when those are done, run `/close-milestone` to mark M8 ✅. M9 (refinement: pie colours, fixed monthly category amounts apart from transactions; planned, starts after the deployment) and M10 (nice-to-haves, optional) follow.
- The API contract is the committed `openapi.json` at the repo root; after any backend route or schema change, re-export it and regenerate the frontend types (see `docs/backend.md` → *Commands*). CI fails if either is stale.
- Git: `main` tracks `origin` (`github.com/sotomarcos24/expenses-calculator`).

## Non-negotiable rules

- **Money:** `Decimal` in Python, `NUMERIC` in the DB, decimal **strings** in JSON. Never use `float` for amounts.
- **Data isolation:** every query on user data filters by the current user. Accessing another user's resource returns **404**. Foreign keys received in a request body (e.g. `category_id`) must be checked to belong to the current user. Each new endpoint gets a test proving this.
- **Auth:** JWT only in the `access_token` httpOnly cookie (never in localStorage or response bodies). Passwords hashed with Argon2; hashes never returned.
- **Secrets:** never commit `.env`, databases or secrets. Configuration comes from environment variables.
- **Simulator:** results must be deterministic and covered by unit tests with known values; the UI always shows the "not financial advice" disclaimer.
- Do not add dependencies or external services that are not in the tech spec without asking the user.

## Environment

- Development happens on Linux (WSL2). Docker is available in WSL (Docker Desktop with WSL integration; check with `docker --version`): the root `Dockerfile` can be built and run locally (`docker build -t personaldolar .`; with a published port, e.g. `-p 8010:8000`, `localhost` works from WSL, `--network host` does not) as well as in CI. For Postgres checks run a throwaway `postgres:17` container and remove it afterwards. New settings: `ENVIRONMENT` (production guard), `FRONTEND_DIST_DIR`; CI has `backend-postgres` and `docker` jobs (see `docs/backend.md`).
- To check the app end to end, start the backend and the frontend dev servers and use `http://localhost:5173`; `/api/health` must answer through the proxy. Use a throwaway SQLite DB and register a **new** user (see `docs/backend.md` → *Known caveats*).
- There is no browser in WSL. For scripted browser checks QA installs Playwright + headless Chromium in the session scratchpad (Chromium is cached in `~/.cache/ms-playwright`); it is **not** a project dependency, never add it to `package.json` without asking. Stop any servers you start.
- QA never uses a dev server it did not start (port 8000 belongs to the user). It starts its own backend and frontend on free ports and stops them when done, pointing the Vite proxy at its backend with `API_PROXY_TARGET` (default `http://localhost:8000`, see `docs/frontend.md` → *Environment*):

  ```bash
  # backend/ (after `alembic upgrade head` with the same DATABASE_URL)
  DATABASE_URL=sqlite:///<scratchpad>/qa.db uv run fastapi dev app/main.py --port 8001
  # frontend/
  API_PROXY_TARGET=http://localhost:8001 npm run dev -- --port 5174 --strictPort
  ```
