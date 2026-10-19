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
| 8 | Polish and deployment | Production-ready MVP online | 1–7 | 🟡 Polish done; deployment pending (#46, #47) |
| 9 | Refinement | Pie colours, fixed monthly category amounts apart from transactions | 8 | ⬜ Planned (starts after the deployment) |
| 10 | Nice-to-haves | Recurring transactions, CSV export, i18n | 9 | ⬜ Optional |

---

## M1 — Scaffolding ✅

**Goal:** an empty but complete project skeleton where every later milestone only adds features.

#### Delivered

- `backend/`: FastAPI app factory, settings from `.env`, SQLAlchemy engine/session (`DbSession`), base model with timestamps and constraint naming convention, Alembic wired to the app settings (batch mode for SQLite), `GET /api/health`, OpenAPI at `/api/openapi.json` and docs at `/api/docs`.
- `frontend/`: React 19 + Vite + TypeScript strict, Tailwind 4 with the white/blue theme tokens (§8.1), React Router with all MVP routes as placeholders, layout with sidebar/top nav, `apiFetch` wrapper and `ApiError`, currency/percent formatters, Vite proxy `/api → :8000`.
- Tooling: ruff, mypy, pytest, oxlint, Prettier, Vitest + Testing Library.
- CI on GitHub Actions for backend and frontend, README with setup instructions.

#### Acceptance criteria

- [x] `GET /api/health` returns `{"status":"ok","database":"ok"}`, also through the Vite proxy.
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

## M8 — Polish and deployment 🟡

**Goal:** the MVP is usable, robust and online.

#### Scope

- UX pass: loading and error states everywhere, empty states, toasts on save/delete, mobile layout reviewed on every page.
- Accessibility pass: labels on all inputs, keyboard navigation, colour contrast of the blue palette (WCAG AA).
- Production serving: FastAPI serves `frontend/dist` plus `/api`; multi-stage Dockerfile.
- Postgres: run all migrations and the test suite against Postgres once (CI job with a Postgres service).
- Deploy to a free tier (Render or Fly.io) with managed Postgres; `COOKIE_SECURE=true`, strong `JWT_SECRET`, migrations on deploy.
- README: production configuration and deploy steps.
- Spec extension (#48, #49, outside the original scope): record transactions from the Categories page on subcategories, with period totals per subcategory and per category (see `docs/plan.md` §4.2). Backend `GET /categories/totals` (#48); frontend (#49): add-transaction buttons, period selector and totals on `/categories`.

#### Acceptance criteria

- [ ] The app is reachable at a public HTTPS URL. *(pending, #47)*
- [ ] Full flow works in production: sign up → categories → transactions → investments → dashboard → simulator. *(pending, #47)*
- [x] Tests pass against both SQLite and Postgres. *(#46; run by hand on SQLite and Postgres 17, the `backend-postgres` CI job still has to run on GitHub)*
- [ ] No secrets in the repo. *(pending, #47: no-secrets CI check and history review)*

#### Progress notes

- **Done (polish, merged to `main`):** UX pass (#44), accessibility pass (#45), login rate limiting (#10), return to the requested page after login (#9), `GET /categories/totals` (#48), add-transaction and period totals on `/categories` (#49), and the shared `Dialog` focus fix (#33, no milestone).
- **Done (#46, closed, merged into `main` via the `m8-deploy` PR):** FastAPI serves `frontend/dist` with SPA fallback, `ENVIRONMENT=production` settings guard, multi-stage non-root Dockerfile with entrypoint running `alembic upgrade head`, `psycopg[binary]`, `backend-postgres` and `docker` CI jobs.
- **Done (#47 repo side, merged into `main` via the `m8-deploy` PR):** `DATABASE_URL` normalisation in `app/db.py` with tests, `render.yaml` Blueprint, `backend/scripts/check_no_secrets.py` + `no-secrets` CI job (git history reviewed: clean; `.env` and `*.db` untracked), README "Production" section with the smoke-test checklist, tech-spec §11.
- **Pending (#47, needs the user):** create the Render account, apply the Blueprint, record the public URL, run the production smoke test, confirm the rate limit behind the proxy. Then tick the first two criteria above (and the no-secrets one once the `no-secrets` job is green on GitHub).
- **QA:** #47 repo side passed QA (one FAIL fixed: the no-secrets script flagged test URLs; commits `0370f60`, `d866e2b`). The issue stays open until the production criteria are met.
- **Next:** the `m8-deploy` PR is merged, so check that the `backend-postgres`, `docker` and `no-secrets` jobs are green on GitHub, then do the Render steps above. Milestone is complete (✅) only when all four acceptance criteria above are ticked; then remove these notes.
- Docker: it was available earlier, but in the last session `docker` was **not** found in this WSL distro (Docker Desktop integration off), so the image was not rebuilt against Postgres after #47; the CI `docker` job or a local run must cover it.
- The free-tier limits written in the README/tech-spec §11 (cold start, free Postgres expiry, no backups) are **unverified**; confirm them against Render's current terms.
- **Decisions (user):** `psycopg[binary]` is approved as the Postgres driver; the provider for #47 is Render (Neon as fallback if the free Postgres expiry is a problem).

---


## M9 — Refinement

**Goal:** fix the problems found while using the app: the pies render black, and category amounts are recorded as dated transactions when they should be a fixed monthly figure kept apart from one-off transactions (plan §4.2, §4.3).

> Order of work: pie colours (independent), then the backend for monthly amounts, then the Categories UI.

#### Scope

- **Pie colours (frontend):** the `--color-chart-1..7` tokens are declared in a Tailwind 4 `@theme` block and are not emitted in the built CSS because only JS references them, so `fill="var(--color-chart-N)"` resolves to nothing and slices are black. Make the tokens always available. The same component draws the investments-by-type pie.
- **Monthly amounts (backend):** new `category_amounts` table: one fixed amount (net, `> 0`) plus optional note per category or subcategory of the current user, valid for every month and with no date (adding again for the same row edits it). CRUD endpoints with ownership checks (another user's data is a 404). They count in the dashboard totals and pie (amount × months in the period, rule defined in tech-spec), in `/categories/totals`, in the category delete guard (409) and in the simulator's average monthly expenses. They never appear in `/transactions`.
- **Categories UI (frontend):** the add action on a category row opens a dialog with **Amount and Note only** (type and category come from the row). Rows show the monthly amount, with edit and delete; the period selector and the per-period transaction totals (#48/#49) leave this page. The Transactions page is unchanged and is for unplanned one-off income and expenses.
- No data migration: transactions already recorded stay as transactions. Default categories need no change (they are seeded at registration).

#### Acceptance criteria

- [ ] Every pie slice (dashboard expenses, investments by type) has a distinct colour and the legend swatches match, in the built app and in the dev server.
- [ ] A user can create, edit and delete one monthly amount per category or subcategory; a second create on the same row updates it.
- [ ] Amounts are `Decimal`/decimal strings and must be positive; a category or subcategory of another user is a 404 and every new endpoint has an isolation test.
- [ ] The dashboard income, expense, savings and pie include the monthly amounts × months in the period plus the transactions of the period; known-value tests cover month, year and custom periods.
- [ ] `/simulator/defaults` average monthly expenses include the monthly expense amounts.
- [ ] A category with monthly amounts cannot be deleted without removing them (409).
- [ ] The Categories dialog asks only Amount and Note, and monthly amounts never show up on the Transactions page.
- [ ] `openapi.json` and the frontend types are regenerated; specs (plan §4.2/§4.3, tech-spec data model, API, dashboard, simulator) are updated.

**Tests:** service tests with fixtures for the months-in-period rule; API tests for CRUD, validation and isolation; dashboard and simulator totals with known values; component tests for the dialog and the Categories rows; a pie test checking the slices get distinct fills.

---

## M10 — Nice-to-haves (optional, in this order, §5)

1. **Recurring transactions:** template with frequency and start/end dates; generated entries appear automatically (idempotent generation when the user opens the app or on a schedule).
2. **CSV export:** download transactions for the selected filters.
3. **Spanish translation / configurable currency:** UI strings moved to i18n files; currency becomes a user setting (still a single currency per user — multi-currency stays out of scope).

Each item gets its own acceptance criteria before it starts.
