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
| 6 | Dashboard | Period summary and charts | 4, 5 | ⬜ Pending |
| 7 | Simulator | Modes A/B/C with three scenarios | 4, 5 | ⬜ Pending |
| 8 | Polish and deployment | Production-ready MVP online | 1–7 | ⬜ Pending |
| 9 | Nice-to-haves | Recurring transactions, CSV export, i18n | 8 | ⬜ Optional |

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

## M6 — Dashboard

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

- [ ] Totals match the transactions recorded in the period (boundaries inclusive).
- [ ] Savings rate = savings / income; "—" when there is no income.
- [ ] Drill-down shows subcategory totals that add up to the category total.
- [ ] The investment figures match the Investments page.
- [ ] A new user with no data sees a meaningful empty state, not errors.

**Tests:** aggregation with known fixtures (several months, categories, a period edge); savings rate with zero income; ownership (another user's data never counted); drill-down component.

---

## M7 — Simulator

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

- [ ] Every mode returns results for the three scenarios.
- [ ] Results are identical for identical inputs (deterministic).
- [ ] Nominal and inflation-adjusted values are both available.
- [ ] Mode B returns 0 and "already reached" when the starting amount covers the goal.
- [ ] Mode C reports the depletion age correctly when the money runs out.
- [ ] Out-of-range inputs return 422 and are shown next to the field.
- [ ] Defaults are pre-filled from the user's real data.

**Tests (100% coverage of `simulator/`):** values checked by hand or in a spreadsheet for: 0% return, 0 contribution, monthly vs weekly vs yearly frequency, a known compound case (e.g. $10,000 at 5% for 10 years, no contributions = $16,288.95), goal already reached, withdrawal that lasts, withdrawal that runs out at a known age, real vs nominal conversion.

---

## M8 — Polish and deployment

**Goal:** the MVP is usable, robust and online.

#### Scope

- UX pass: loading and error states everywhere, empty states, toasts on save/delete, mobile layout reviewed on every page.
- Accessibility pass: labels on all inputs, keyboard navigation, colour contrast of the blue palette (WCAG AA).
- Production serving: FastAPI serves `frontend/dist` plus `/api`; multi-stage Dockerfile.
- Postgres: run all migrations and the test suite against Postgres once (CI job with a Postgres service).
- Deploy to a free tier (Render or Fly.io) with managed Postgres; `COOKIE_SECURE=true`, strong `JWT_SECRET`, migrations on deploy.
- README: production configuration and deploy steps.

#### Acceptance criteria

- [ ] The app is reachable at a public HTTPS URL.
- [ ] Full flow works in production: sign up → categories → transactions → investments → dashboard → simulator.
- [ ] Tests pass against both SQLite and Postgres.
- [ ] No secrets in the repo.

---

## M9 — Nice-to-haves (optional, in this order, §5)

1. **Recurring transactions:** template with frequency and start/end dates; generated entries appear automatically (idempotent generation when the user opens the app or on a schedule).
2. **CSV export:** download transactions for the selected filters.
3. **Spanish translation / configurable currency:** UI strings moved to i18n files; currency becomes a user setting (still a single currency per user — multi-currency stays out of scope).

Each item gets its own acceptance criteria before it starts.
