# Milestones — PersonalDolar

> Delivery plan for the MVP. The **what** comes from [`plan.md`](plan.md) (product spec), the **how** from [`tech-spec.md`](tech-spec.md). Section references (§) point to those documents.

## How milestones work

- Milestones are done **in order**; each one builds on the previous.
- Each milestone ends with a **working app**: it can be run locally and all checks pass. No half-built features are left on `main`.
- One milestone = one branch (`m<N>-<slug>`, e.g. `m2-auth`) merged into `main` through a PR, with green CI.

### Definition of done (applies to every milestone)

- [ ] Every acceptance criterion of the milestone is met.
- [ ] Backend: `ruff format --check`, `ruff check`, `mypy` and `pytest` pass.
- [ ] Frontend: `npm run lint`, `format:check`, `typecheck`, `test` and `build` pass.
- [ ] New DB changes ship as an Alembic migration (`alembic upgrade head` runs on a clean DB).
- [ ] Every new endpoint requires authentication (except `/auth/*` and `/health`) and is covered by a test proving users cannot access each other's data.
- [ ] Money is handled as `Decimal` / decimal strings, never `float`.
- [ ] Docs updated if the implementation deviated from `tech-spec.md`.
- [ ] The milestone status in this file is updated.

## Overview

| # | Milestone | Main outcome | Depends on | Status |
| --- | --- | --- | --- | --- |
| 1 | Scaffolding | Repo, tooling, CI, app shell | — | ✅ Done |
| 2 | Authentication | Sign up, log in, log out, protected routes | 1 | ✅ Done |
| 3 | Categories | Default categories + management UI | 2 | ✅ Done |
| 4 | Transactions | Income/expense CRUD, filters, gross/net salary | 3 | ✅ Done |
| 5 | Investments | Portfolio CRUD and gain/loss | 2 | ✅ Done |
| 6 | Dashboard | Period summary and charts | 4, 5 | ✅ Done |
| 7 | Simulator | Modes A/B/C with three scenarios | 4, 5 | ✅ Done |
| 8 | Polish and deployment | Production-ready MVP online | 1–7 | ✅ Done |
| 9 | Security | Semgrep scan, PR audit, agent security notes, AI/data policy, audit fixes | 8 | ✅ Done (human decisions pending in #69) |
| 10 | Refinement | Pie colours, fixed monthly category amounts apart from transactions | 9 | ✅ Done |
| 11 | DevOps and observability | Dev/prod environments, versioned images, manual promotion, OpenTelemetry, metrics, alert, on-call agent drill | 10 | ⬜ Draft (no issues yet) |
| 12 | Nice-to-haves | Recurring transactions, CSV export, i18n | 10 | ⬜ Optional |

---

## M1 — Scaffolding ✅

**Goal:** an empty but complete project skeleton where every later milestone only adds features.

#### Delivered

- `backend/`: FastAPI app factory, settings from `.env`, SQLAlchemy engine/session (`DbSession`), base model with timestamps and constraint naming convention, Alembic wired to the app settings (batch mode for SQLite), `GET /api/health`, OpenAPI at `/api/openapi.json` and docs at `/api/docs`.
- `frontend/`: React 19 + Vite + TypeScript strict, Tailwind 4 with the white/blue theme tokens (§8.1), React Router with all MVP routes as placeholders, layout with sidebar/top nav, `apiFetch` wrapper and `ApiError`, currency/percent formatters, Vite proxy `/api → :8000`.
- Tooling: ruff, mypy, pytest, oxlint, Prettier, Vitest + Testing Library.
- CI on GitHub Actions for backend and frontend, README with setup instructions.

#### Acceptance criteria

- [x] `GET /api/health` returns `{"status":"ok","database":"ok"}` (since #57 also `"commit"`), also through the Vite proxy.
- [x] All routes render inside the layout; the active section is highlighted.
- [x] All checks pass locally.

---

## M2 — Authentication ✅

**Goal:** a user can create an account and only reach the app when logged in (§4.1, tech-spec §5).

#### Backend

- `User` model + migration (`email` unique and lowercase, `password_hash`).
- `security.py`: Argon2 hashing, JWT creation/validation, `CurrentUser` dependency (reads the `access_token` cookie).
- Router `/api/auth`: `register`, `login`, `logout`, `me`.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Secure` controlled by `COOKIE_SECURE`.
- Mutating endpoints only accept `Content-Type: application/json`.

#### Frontend

- Add `openapi-typescript` and the `gen:api` script (check TypeScript 6 support; otherwise generate with a pinned version through `npx`).
- Commit `openapi.json` at the repo root (exported by `backend/scripts/export_openapi.py`); `gen:api` generates the types from it, and CI fails if `openapi.json` or `src/api/schema.d.ts` is stale.
- Login and register forms (React Hook Form + Zod) with inline validation errors.
- `useMe` hook + `RequireAuth` guard around the app layout; logged-in users visiting `/login` are sent to `/`.
- Global 401 handling: clear the cached user and redirect to `/login`.
- Log out button in the layout, showing the user's email.

#### Acceptance criteria

- [x] Registering with a valid email and a password of 8+ characters creates the account and logs the user in.
- [x] A duplicate email returns 409 with a clear message.
- [x] Wrong credentials return 401 with the generic "Invalid email or password".
- [x] The password is stored hashed; the hash never appears in any response.
- [x] Without the cookie, `GET /api/auth/me` returns 401 and the frontend redirects to `/login`.
- [x] Logging out clears the cookie, after which protected routes are not accessible.
- [x] The token is not readable from JavaScript (`document.cookie` does not show it).

**Tests:** hashing round-trip; register → me → logout → me (401); duplicate email; wrong password; expired/forged token → 401; email normalisation (`A@B.com` = `a@b.com`); guard redirect in the frontend.

---

## M3 — Categories ✅

**Goal:** two-level categories, a default set for every new user, and a management screen (§4.2, tech-spec §4 `categories`).

#### Backend

- `Category` model + migration (`kind`, `parent_id`, unique per user/kind/parent/name).
- `services/categories.py`: default seed (expense and income lists from §4.2), called inside the register transaction.
- Router `/api/categories`: tree `GET` (optional `?kind=`), `POST`, `PATCH` (rename), `DELETE`.
- Rules: max two levels; a subcategory has the same `kind` as its parent; delete returns **409** if the category or any of its subcategories has transactions (the check is wired now and gets real data in M4).

#### Frontend

- Categories page with two columns/tabs (Expenses / Income), expandable tree.
- Inline add, rename and delete; confirmation before delete; 409 shown as a readable message.

#### Acceptance criteria

- [x] A new user sees exactly the default categories and subcategories from §4.2.
- [x] Categories and subcategories can be added, renamed and deleted.
- [x] Duplicate names at the same level are rejected (409).
- [x] A third level cannot be created (422).
- [x] User A cannot see, rename or delete user B's categories (404).

**Tests:** seed contents; level and kind validation; duplicates; ownership; delete cascade of subcategories when unused.

---

## M4 — Transactions ✅

**Goal:** record and list income and expenses, including gross/net salary (§4.3, §4.4).

#### Backend

- `Transaction` model + migration (`amount`, `gross_amount`, `date`, category/subcategory, note).
- Router `/api/transactions` with filters `from`, `to`, `type`, `category_id`, `subcategory_id`, pagination, ordered by date desc.
- Validation: `amount > 0`; `category.kind == type`; subcategory belongs to the category; `gross_amount` only for income and `≥ amount`; category IDs must belong to the user.
- Response includes the computed `deduction_rate` when `gross_amount` is present.
- Enables the category delete 409 from M3: replace the stub `category_ids_in_use()` in `app/services/categories.py` (always `False` today) with a real query. Already filed as issue **#16** (label `m4`); the frontend already shows the API's 409 message, so no UI work is needed for it.

#### Frontend

- Transactions page: table (date, type, category › subcategory, note, amount coloured as income/expense), filters (period, type, category), pagination.
- Create/edit dialog: subcategory list depends on the chosen category (reuse `useCategories()` from `src/hooks/useCategories.ts`, which already returns both trees in API order); "Gross amount" field shown only for income; the deduction rate is shown live.
- Delete with confirmation.

#### Acceptance criteria

- [x] Income and expenses can be created, edited, deleted and listed.
- [x] Filters by period and category work and can be combined.
- [x] Zero or negative amounts are rejected.
- [x] A salary with gross 3,000 and net 2,400 shows a 20.0% deduction rate.
- [x] Net > gross is rejected.
- [x] A category with transactions cannot be deleted (409).
- [x] Users cannot read or modify each other's transactions, nor use each other's categories.

**Tests:** validations above; filter combinations; pagination; `Decimal` precision (e.g. `0.10 + 0.20 = 0.30`); ownership.

---

## M5 — Investments ✅

**Goal:** manual portfolio tracking with gain/loss (§4.5).

#### Backend

- `Investment` model + migration.
- Router `/api/investments`: list (with per-investment `gain`, `gain_pct` and a `totals` block), `POST`, `GET/PATCH/DELETE /{id}`.
- Updating `current_value` sets `value_updated_at` (today by default).

#### Frontend

- Investments page: table with name, type, platform, invested, current value, gain/loss in $ and % (green/red), last update.
- Portfolio totals card.
- Create/edit dialog and a quick "Update value" action.

#### Acceptance criteria

- [x] Investments can be created, edited, deleted and listed.
- [x] Invested 1,000 and current value 1,150 shows +$150.00 / +15.0%.
- [x] Portfolio totals add up all investments correctly.
- [x] An investment with 0 invested shows "—" as its percentage, without errors.
- [x] Ownership enforced (404 for other users' investments).

**Tests:** gain/loss calculations (positive, negative, zero invested); totals; `value_updated_at` behaviour; ownership.

---

## M6 — Dashboard ✅

**Goal:** a one-screen overview of the selected period (§4.7, tech-spec §6 Dashboard).

#### Backend

- `services/dashboard.py`: income/expense totals, savings, savings rate, expenses by category with subcategories (including `"(none)"`), investments summary by type.
- `GET /api/dashboard?from=&to=`.

#### Frontend

- Period selector: current month (default), current year, custom range.
- Four KPI cards: income, expenses, savings, savings rate.
- Expense pie chart (Recharts, blue shades); clicking a slice shows that category's subcategories, with a way back.
- Investments block: invested, current value, gain/loss, pie by type.
- Simulator shortcut button. Empty states when there is no data.

#### Acceptance criteria

- [x] Totals match the transactions recorded in the period (boundaries inclusive).
- [x] Savings rate = savings / income; "—" when there is no income.
- [x] Drill-down shows subcategory totals that add up to the category total.
- [x] The investment figures match the Investments page.
- [x] A new user with no data sees a meaningful empty state, not errors.

**Tests:** aggregation with known fixtures (several months, categories, a period edge); savings rate with zero income; ownership (another user's data never counted); drill-down component.

---

## M7 — Simulator ✅

**Goal:** deterministic projections in three modes, with three scenarios and inflation (§4.6, tech-spec §7).

> Order of work: pure module and its tests first, then endpoints, then UI.

#### Backend

- `app/simulator/`: pure `Decimal` functions for accumulation (Mode A), required contribution (Mode B) and withdrawal (Mode C), following the conventions in tech-spec §7.2.
- `GET /api/simulator/defaults` (current portfolio value, average monthly expenses over the last 12 full months, inflation 2%, scenarios 3/5/7%).
- `POST /api/simulator/accumulation | goal | withdrawal`, with the validation ranges from tech-spec §7.6.

#### Frontend

- Simulator page with tabs A / B / C, form pre-filled from `/defaults`, every field editable.
- Line chart with the three scenarios (pessimistic/base/optimistic colours from §8.1) and a nominal ↔ today's-dollars toggle.
- Results table/cards per scenario: Mode A final value + years of expenses covered; Mode B required contribution; Mode C monthly income, % of expenses covered, and "lasts until N" / "runs out at age N".
- Permanent disclaimer: "Projections are estimates, not financial advice."

#### Acceptance criteria

- [x] Every mode returns results for the three scenarios.
- [x] Results are identical for identical inputs (deterministic).
- [x] Nominal and inflation-adjusted values are both available.
- [x] Mode B returns 0 and "already reached" when the starting amount covers the goal.
- [x] Mode C reports the depletion age correctly when the money runs out.
- [x] Out-of-range inputs return 422 and are shown next to the field.
- [x] Defaults are pre-filled from the user's real data.

**Tests (100% coverage of `simulator/`):** values checked by hand or in a spreadsheet for: 0% return, 0 contribution, monthly vs weekly vs yearly frequency, a known compound case (e.g. $10,000 at 5% for 10 years, no contributions = $16,288.95), goal already reached, withdrawal that lasts, withdrawal that runs out at a known age, real vs nominal conversion.

---

## M8 — Polish and deployment ✅

**Goal:** the MVP is usable, robust and online.

#### Scope

- UX pass: loading and error states everywhere, empty states, toasts on save/delete, mobile layout reviewed on every page.
- Accessibility pass: labels on all inputs, keyboard navigation, colour contrast of the blue palette (WCAG AA).
- Production serving: FastAPI serves `frontend/dist` plus `/api`; multi-stage Dockerfile.
- Postgres: run all migrations and the test suite against Postgres once (CI job with a Postgres service).
- Deploy to a free tier (Render or Fly.io) with managed Postgres; `COOKIE_SECURE=true`, strong `JWT_SECRET`, migrations on deploy.
- README: production configuration and deploy steps.
- Continuous deployment (#55, label `human`): a `deploy` job in `ci.yml` runs only on pushes to `main` after every test job passes, calls the Render deploy hook (GitHub secret `RENDER_DEPLOY_HOOK`) and polls `/api/health` until it answers 200 with the pushed commit (#57; `/api/health` reports `RENDER_GIT_COMMIT`).
- Local stack (#56): `docker-compose.yml` with the app and Postgres 17, started with `docker compose up --build`.
- Spec extension (#48, #49, outside the original scope): record transactions from the Categories page on subcategories, with period totals per subcategory and per category (see `docs/plan.md` §4.2). Backend `GET /categories/totals` (#48); frontend (#49): add-transaction buttons, period selector and totals on `/categories`.

#### Acceptance criteria

- [x] The app is reachable at a public HTTPS URL. *(https://personaldolar.onrender.com, #47)*
- [x] Full flow works in production: sign up → categories → transactions → investments → dashboard → simulator. *(#47, smoke test done by hand)*
- [x] Tests pass against both SQLite and Postgres. *(#46; `backend-postgres` CI job green on `main`)*
- [x] No secrets in the repo. *(#47: `no-secrets` CI job green on `main`, history review clean)*
- [x] A push to `main` deploys to Render automatically only after all tests pass, and the `deploy` job has been green at least once. *(#55; `deploy` green on `main`, `/api/health` reports the pushed commit)*
- [x] `docker compose up --build` starts the app and Postgres 17 locally. *(#56)*

---


## M9 — Security and DevOps hardening ✅

**Goal:** make the project's security posture reviewable: a static-analysis scan in CI, an audit of a merged PR, notes on what the AI agents and plugins can do, an AI/data policy, and the fixes the audit found. Everything lives in `security-audit/` and `docs/security.md` (index).

> Order of work: Semgrep (#64), PR audit (#65), agent notes and policy (#66), then the audit fixes (#67, #68).

#### Scope

- **Semgrep OSS in CI** with a findings report (`security-audit/semgrep-findings.md`).
- **PR audit** with a reusable brief (`security-audit/audit-brief.md`, `security-audit/runs/`).
- **Agent security notes, AI/data policy and index** (`security-audit/capability-table.md`, `docs/ai-data-policy.md`, `docs/security.md`).
- **Audit fixes:** least-privilege `permissions` in `ci.yml` (#67) and loopback binding of the `docker-compose` port (#68). Each finding in `security-audit/` links to the issue and the commit that fixes it.

#### Acceptance criteria

- [x] Semgrep runs in CI and its findings are reported (#64).
- [x] A PR audit with a reusable brief is stored (#65).
- [x] Capability table, AI/data policy and security index exist and their links resolve (#66).
- [x] #67 and #68 are fixed, and every audit finding links to its issue and fixing commit. *(F1 → #67 `b3b771a`, F2 → #68 `28d7c19`; F2a and F3 are accepted without a fix)*
- [ ] The user has filled the **Human decision** column of the Semgrep findings and of the PR audit.

> **Note:** M9 was closed with this last criterion open by the user's decision. Filling the **Human decision** column is a human-only task, tracked in issue **#69** (labels `human`, `documentation`); it does not block M10. Tick it when #69 is closed.

---

## M10 — Refinement ✅

**Goal:** fix the problems found while using the app: the pies render black, and category amounts are recorded as dated transactions when they should be a fixed monthly figure kept apart from one-off transactions (plan §4.2, §4.3).

> Order of work: pie colours (independent), then the backend for monthly amounts, then the Categories UI.

#### Scope

- **Pie colours (frontend):** the `--color-chart-1..7` tokens are declared in a Tailwind 4 `@theme` block and are not emitted in the built CSS because only JS references them, so `fill="var(--color-chart-N)"` resolves to nothing and slices are black. Make the tokens always available. The same component draws the investments-by-type pie.
- **Monthly amounts (backend):** new `category_amounts` table: one fixed amount (net, `> 0`) plus optional note per category or subcategory of the current user, valid for every month and with no date (adding again for the same row edits it). CRUD endpoints with ownership checks (another user's data is a 404). They count in the dashboard totals and pie (amount × months in the period, rule defined in tech-spec), in `/categories/totals`, in the category delete guard (409) and in the simulator's average monthly expenses. They never appear in `/transactions`.
- **Categories UI (frontend):** the add action on a category row opens a dialog with **Amount and Note only** (type and category come from the row). Rows show the monthly amount, with edit and delete; the period selector and the per-period transaction totals (#48/#49) leave this page. The Transactions page is unchanged and is for unplanned one-off income and expenses.
- No data migration: transactions already recorded stay as transactions. Default categories need no change (they are seeded at registration).

#### Acceptance criteria

- [x] Every pie slice (dashboard expenses, investments by type) has a distinct colour and the legend swatches match, in the built app and in the dev server. *(#51: `@theme static` in `src/index.css`, `ExpensePie.colors.test.tsx`)*
- [x] A user can create, edit and delete one monthly amount per category or subcategory; a second create on the same row updates it. *(#52 API, #53 UI: `test_put_creates_then_updates_and_delete`, `CategoriesPage.amounts.test.tsx`)*
- [x] Amounts are `Decimal`/decimal strings and must be positive; a category or subcategory of another user is a 404 and every new endpoint has an isolation test. *(#52: `test_invalid_amount_is_422`, `test_ownership`, `test_requires_auth`)*
- [x] The dashboard income, expense, savings and pie include the monthly amounts × months in the period plus the transactions of the period; known-value tests cover month, year and custom periods. *(#52: `test_dashboard_month_year_and_custom`, `tests/unit/test_periods.py`)*
- [x] `/simulator/defaults` average monthly expenses include the monthly expense amounts. *(#52: `test_defaults_add_monthly_expense_amounts`)*
- [x] A category with monthly amounts cannot be deleted without removing them (409). *(#52: `test_delete_guard_and_user_cascade`; #53 shows the 409 on the row)*
- [x] The Categories dialog asks only Amount and Note, and monthly amounts never show up on the Transactions page. *(#53: `CategoryAmountDialog`, `CategoriesPage.amounts.test.tsx`; #52: `test_amounts_never_appear_in_transactions`)*
- [x] `openapi.json` and the frontend types are regenerated; specs (plan §4.2/§4.3, tech-spec data model, API, dashboard, simulator) are updated. *(#52, #53; plan §4.2/§4.3 and tech-spec §4 data model, §6 API and dashboard, §7 simulator updated)*

**Tests:** service tests with fixtures for the months-in-period rule; API tests for CRUD, validation and isolation; dashboard and simulator totals with known values; component tests for the dialog and the Categories rows; a pie test checking the slices get distinct fills.

---

## M11 — DevOps and observability

**Goal:** separate dev and prod environments, deploy from immutable versioned images with a manual promotion, and add observability (OpenTelemetry, business metrics, dashboard, alert) plus an on-call agent drill. Everything uses free tiers.

> Status: **draft**, no GitHub issues yet. Run `/plan-milestone` after the user approves the scope. Decisions to confirm first are listed below.

#### Decisions to confirm before grooming

- **Registry:** GHCR (GitHub Container Registry), not ECR.
- **Dev database:** Neon free Postgres (Render allows only one free Postgres per workspace).
- **Cloud observability backend:** Grafana Cloud free over OTLP. The self-hosted stack (Collector, Prometheus, Loki, Tempo, Grafana) runs only locally in `observability/`.
- **New dependencies:** `opentelemetry-*` packages in the backend; needs explicit user approval and a `docs/tech-spec.md` update.
- **Privacy:** telemetry never carries amounts, descriptions, emails or user ids; record it in `docs/security.md` / `docs/ai-data-policy.md`.
- **Size:** more than the usual 2–3 issues; may be split into M11 (issues 1–2) and a follow-up milestone (issues 3–7).

#### Scope

1. **Versioned image, build/deploy split:** CI `build` job builds the root `Dockerfile` and pushes it to GHCR tagged `YYYYMMDD-HHMMSS-shortsha`; the `deploy` job pulls an existing tag and does not build. The deployed version is exposed at runtime (`APP_VERSION`, `/api/health`).
2. **Dev environment and manual promotion:** second independent copy of the app (Render web service + Neon Postgres, `ENVIRONMENT=development`) as **dev**; the existing app stays as **prod**. A push to `main` deploys to dev only. A `workflow_dispatch` workflow promotes the image currently running in dev to prod without rebuilding. Separate secrets per environment (GitHub Environments).
3. **OpenTelemetry instrumentation:** traces, metrics and logs over OTLP from the FastAPI backend, with `service.name`, `deployment.environment` and `service.version` on every signal. Telemetry is off when no OTLP endpoint is configured.
4. **Business metrics:** `transactions_created_total`, `users_registered_total`, `investments_created_total`, `active_sessions` (gauge) and `transaction_creation_failures_total` (by error type), all with environment and version, low cardinality.
5. **Local observability stack:** `observability/` with its own Docker Compose project (OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana), separate from the app stack, plus a provisioned Grafana dashboard with `environment` and `version` filters.
6. **Cloud observability and alert:** dev and prod send telemetry to Grafana Cloud free. A versioned alert on repeated transaction-creation failures (threshold and duration justified by user impact) that includes service, environment, version, owner and dashboard URL.
7. **On-call agent and bug drill:** `on-call-engineer/` with a script that polls the Grafana alert API every minute and passes alert details to a headless agent (`claude -p`) with an on-call prompt (find the root cause, reproduce, smallest fix, run backend tests, commit; change nothing on a false positive). Safeguards: works on a new branch, never on `main`, never pushes, alert text is untrusted input, restricted tool permissions. Drill: a deterministic, realistic bug in transaction creation introduced in a throwaway branch, with existing tests still passing.

#### Acceptance criteria

- [ ] The `build` job pushes a tagged image to GHCR only after all test jobs pass, and `deploy` never builds.
- [ ] `/api/health` shows the deployed version (the image tag) and rollback to a previous tag is documented in `docs/operations/`.
- [ ] A push to `main` updates only dev; the manual workflow promotes the exact dev image to prod and both show the same version afterwards.
- [ ] Dev and prod use separate secrets and databases.
- [ ] Every telemetry signal carries service name, environment and version; a test shows no amounts, descriptions, emails or user ids are exported.
- [ ] Each business metric is emitted at the right place and covered by a unit test; the failure counter ignores 4xx validation errors.
- [ ] `observability/` starts with `docker compose up` independently of the app stack and its dashboard filters by environment and version.
- [ ] Both environments appear in Grafana Cloud, and the alert definition lives in the repo with its five required fields and a documented threshold.
- [ ] The on-call script does not process the same alert twice, receives only alert fields (no secrets), and never pushes or touches `main`.
- [ ] The drill shows bug → alert → agent investigation → fix committed on a branch; a false-positive case leaves the code unchanged; the bug never reaches `main`.
- [ ] New dependencies and services are reflected in `docs/tech-spec.md`, `docs/backend.md` and `docs/security.md`; no credentials in the repo.

---

## M12 — Nice-to-haves (optional, in this order, §5)

1. **Recurring transactions:** template with frequency and start/end dates; generated entries appear automatically (idempotent generation when the user opens the app or on a schedule).
2. **CSV export:** download transactions for the selected filters.
3. **Spanish translation / configurable currency:** UI strings moved to i18n files; currency becomes a user setting (still a single currency per user — multi-currency stays out of scope).

Each item gets its own acceptance criteria before it starts.
