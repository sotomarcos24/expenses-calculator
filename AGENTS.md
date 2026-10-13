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
- For each open issue of the current milestone: **PM grooms → Engineer implements → QA verifies** → on FAIL back to the engineer with the QA comment, on PASS the orchestrator closes the issue. Repeat until the backlog is empty, then do the milestone wrap-up.
- Never skip grooming. The engineer never closes issues. QA never changes code. Only the orchestrator closes an issue, and only after `## QA: PASS`.
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

- Milestone 1 (scaffolding) is done; the next milestone is shown in `docs/milestones.md`.
- Git: `main` tracks `origin` (`github.com/sotomarcos24/expenses-calculator`).

## Non-negotiable rules

- **Money:** `Decimal` in Python, `NUMERIC` in the DB, decimal **strings** in JSON. Never use `float` for amounts.
- **Data isolation:** every query on user data filters by the current user. Accessing another user's resource returns **404**. Foreign keys received in a request body (e.g. `category_id`) must be checked to belong to the current user. Each new endpoint gets a test proving this.
- **Auth:** JWT only in the `access_token` httpOnly cookie (never in localStorage or response bodies). Passwords hashed with Argon2; hashes never returned.
- **Secrets:** never commit `.env`, databases or secrets. Configuration comes from environment variables.
- **Simulator:** results must be deterministic and covered by unit tests with known values; the UI always shows the "not financial advice" disclaimer.
- Do not add dependencies or external services that are not in the tech spec without asking the user.

## Environment

- Development happens on Linux (WSL2). Docker is **not** installed locally; the Dockerfile planned for milestone 8 can only be verified in CI or on the hosting provider.
- To check the app end to end, start the backend and the frontend dev servers and use `http://localhost:5173`; `/api/health` must answer through the proxy.
