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
- `Category` (`app/models/category.py`, table `categories`: `user_id`, `name`, `kind` = `CategoryKind` `StrEnum` stored as `income`/`expense` (non-native enum + CHECK), `parent_id` nullable for top-level; relationships `parent` / `subcategories` ordered by id, ORM and DB `ON DELETE CASCADE`). Constraints: unique (`user_id`, `kind`, `parent_id`, `name`) and the partial case-insensitive index `uq_categories_top_level_name` on (`user_id`, `kind`, `lower(name)`) `WHERE parent_id IS NULL`. Migration `alembic/versions/4faf9e360c9e_create_categories.py` (the partial index is hand-written: autogenerate cannot render or compare it and warns about it on SQLite).
- `Transaction` (`app/models/transaction.py`, table `transactions`: `user_id` (`ON DELETE CASCADE`), `type` = `CategoryKind` stored as `income`/`expense` like `Category.kind` (CHECK `ck_transactions_type`), `date`, `amount` and nullable `gross_amount` as `Numeric(12, 2)` / `Decimal` (`amount` is the net amount for a salary), `category_id` and nullable `subcategory_id` FKs to `categories` with **no** `ondelete` (`NO ACTION`: a category in use cannot be deleted, a user delete still cascades), `note` up to 500 chars; many-to-one relationships `category` / `subcategory` with no back-reference on `Category`). CHECKs `ck_transactions_amount_positive`, `ck_transactions_gross_amount_gte_amount`, `ck_transactions_gross_amount_income_only`; indexes `ix_transactions_user_id_date`, `ix_transactions_category_id`, `ix_transactions_subcategory_id`. Migration `alembic/versions/6061000eeaed_create_transactions.py` (CHECKs written by hand).
- `Investment` (`app/models/investment.py`, table `investments`: `user_id` (`ON DELETE CASCADE`, index `ix_investments_user_id`), `name` up to 100 chars, `type` = `InvestmentType` `StrEnum` stored as `stock`/`fund`/`etf`/`crypto`/`deposit`/`real_estate`/`other` (non-native enum + CHECK `ck_investments_type`), nullable `platform` up to 100 chars (`NULL` = no platform), `amount_invested` and `current_value` as `Numeric(14, 2)` / `Decimal`, `value_updated_at` date; no relationship on `User`). CHECKs `ck_investments_amount_invested_non_negative`, `ck_investments_current_value_non_negative`. Migration `alembic/versions/2d10786f0a3e_create_investments.py` (CHECKs written by hand: autogenerate duplicates the enum CHECK).
- `app/services/categories.py`: `DEFAULT_CATEGORIES` (plan.md §4.2, in order) and `seed_default_categories(db, user)`, which flushes but never commits. `register_user` flushes the user, seeds the 21 default categories and commits once; if seeding fails the whole registration is rolled back (500, not 409).
- Categories router `app/routers/categories.py` (`GET /api/categories?kind=` tree, `POST` 201, `PATCH /{id}` rename, `DELETE /{id}` 204), schemas in `app/schemas/categories.py` (`CategoryRead`, `CategoryTreeNode`, `CategoryCreate`, `CategoryUpdate`; request bodies use `extra="forbid"`, names are trimmed and 1–100 chars), logic in `app/services/categories.py` (`list_category_tree`, `get_category`, `create_category`, `rename_category`, `delete_category`; domain exceptions mapped to 404/409/422 in the router). Duplicate names (409) are checked case-insensitively in the service and a commit `IntegrityError` is rolled back and reported as 409. `category_ids_in_use(db, user_id, category_ids)` is the delete guard (409): one `EXISTS` query for any of the user's transactions with `category_id` or `subcategory_id` in the given ids (the category plus its subcategories for a top-level delete). An `IntegrityError` on the delete commit (FK race) is rolled back and also reported as in use (409).
- Transactions router `app/routers/transactions.py` (`GET /api/transactions` paginated list with `from`/`to`/`type`/`category_id`/`subcategory_id` filters, `POST` 201, `GET`/`PATCH`/`DELETE /{id}`), schemas in `app/schemas/transactions.py` (`TransactionCreate`, partial `TransactionUpdate`, `TransactionRead` with category/subcategory names and `deduction_rate`, `TransactionPage {items, total}`; request money is `Decimal` `> 0` with ≤ 2 decimals and ≤ 12 digits, response money is serialized as strings with 2 decimals; `normalize_note` trims the note), logic in `app/services/transactions.py` (`compute_deduction_rate`, `get_transaction`, `create_transaction`, `update_transaction` (re-validates the merged row before changing it), `delete_transaction`, `list_transactions` with `TransactionFilters`; ownership is checked with `categories.get_category` (404) before the domain rules (`InvalidTransactionError` → 422)). Details in tech-spec §6.
- Investments router `app/routers/investments.py` (`GET /api/investments` → `InvestmentList {items, totals}` ordered by `lower(name)`, `id`; `POST` 201, `GET`/`PATCH`/`DELETE /{id}`, 404 `"Investment not found"`), schemas in `app/schemas/investments.py` (`InvestmentCreate`, partial `InvestmentUpdate`, `InvestmentRead` with computed `gain` / `gain_pct`, `PortfolioTotals`, `InvestmentList`; request money `InvestmentMoneyIn` is `Decimal` `≥ 0` with ≤ 2 decimals and ≤ 14 digits; `normalize_platform` trims the platform, empty → `null`), logic in `app/services/investments.py` (`today()` = the server's `date.today()`, monkeypatched in tests; `compute_gain`, `compute_gain_pct` (4 decimals half up, `None` with 0 invested), `compute_totals`, `get_investment`, `list_investments`, `create_investment`, `update_investment` (sets `value_updated_at` to today when `current_value` is sent without a date), `delete_investment`). Details in tech-spec §6.
- Dashboard router `app/routers/dashboard.py` (`GET /api/dashboard?from=&to=`, both required), schemas in `app/schemas/dashboard.py`, logic in `app/services/dashboard.py` (`build_dashboard`, SQL `GROUP BY` sums; the investments block reuses `compute_totals`). Details in tech-spec §6.
- Simulator `app/simulator/` (pure, `Decimal` at 50 digits, rounded to 2 decimals only in outputs): `models.py` (frozen dataclasses, `Frequency`, `Scenario`, `WithdrawalMode`) and `core.py` (`accumulate`, `required_contribution`, `withdraw`, each returning a 3-tuple pessimistic/base/optimistic). The Mode C timing convention is in the `core.py` docstring. Tests: `tests/unit/test_simulator_*.py`, 100% branch coverage (`pytest --cov=app/simulator --cov-branch`).
- Simulator router `app/routers/simulator.py` (`GET /api/simulator/defaults`, `POST /accumulation`, `/goal`, `/withdrawal`; all require auth, the POSTs are stateless and read no user data), schemas in `app/schemas/simulator.py` (requests: money `Decimal` in [0, 1e12] with ≤ 2 decimals, rates in [-0.5, 0.5], `horizon_years` / `years` 1–60, ages 0–120; Mode C validators report on the offending field: `retirement_age > current_age` and at most 60 years after it, `end_age > retirement_age` (≤ 120, default 100), `withdrawal_rate` required for `percent`, `monthly_withdrawal` for `fixed`; responses are `{pessimistic, base, optimistic}` objects with money as 2-decimal strings; `RateString` serializes rates as `"0.02"`), logic in `app/services/simulator.py` (`build_defaults(db, user_id, today)`, `average_monthly_expenses`: net expenses of the 12 full months before the current one ÷ months with an expense; the router passes `investments.today()`). Tests: `tests/api/test_simulator.py`, `tests/unit/test_simulator_service.py`.
- `app/schemas/money.py` holds the shared response types `MoneyOut` (string, 2 decimals) and `RateOut` (fraction string, 4 decimals) plus `CENT` / `RATE_STEP`, used by transactions and investments.
- `app/security.py` provides the auth building blocks: `hash_password` / `verify_password` (Argon2, `verify_password` never raises), `create_access_token` / `decode_access_token` (JWT HS256 signed with `JWT_SECRET`, `decode_access_token` returns the user id or `None`; it decodes with `JWT_LEEWAY` = 5 s of clock-skew tolerance on `iat` and `exp`, which fixed the flaky 401s on WSL2, #32), and `normalize_email`.
- The default `JWT_SECRET` (in `app/config.py` and `.env.example`) is a dev-only value of 52 bytes; PyJWT warns for HMAC keys under 32 bytes.
- Auth router `app/routers/auth.py` (`/api/auth/register` 201, `/login` 200, `/logout` 204, `/me`), logic in `app/services/auth.py`, schemas in `app/schemas/auth.py` (`RegisterRequest`, `LoginRequest`, `UserRead {id, email, created_at}`). Register/login set the `access_token` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/api`, `Max-Age` = `ACCESS_TOKEN_DAYS`, `Secure` when `COOKIE_SECURE`); the router reads settings through a `get_settings` dependency so tests can override it.
- Rate limiting: `app/ratelimit.py` (`RateLimiter`, `client_ip`, `rate_limit(scope)` dependency) guards login and register; the limiter lives in `app.state.rate_limiter` (created in `create_app()`). `tests/conftest.py` disables both limits for every test through an autouse fixture; `tests/api/test_rate_limit.py` re-enables them with explicit `Settings(...)` overrides and a fake clock. Details in tech-spec §5.
- `CurrentUser` (in `app/security.py`) is the `Annotated[User, Depends(get_current_user)]` dependency for protected routes: it reads the `access_token` cookie and returns the user, or 401 `{"detail": "Not authenticated"}`.
- `RequireJsonContentTypeMiddleware` (`app/middleware.py`, registered in `create_app()`) answers **415** `{"detail": "Content-Type must be application/json"}` to every `POST`/`PUT`/`PATCH`/`DELETE` under `/api` whose media type is not `application/json`, including body-less requests (CSRF defence, tech-spec §5). New routers are covered automatically.
- Auth test fixtures in `tests/conftest.py`: `app`, `client`, `auth_client` (logged-in `AuthenticatedClient` with `.client`, `.email`, `.password`, `.user_id`), `make_auth_client(email)` (factory, one independent client per call), `two_users` (user A and user B for ownership/404 tests), plus the `register_user()` helper and `JSON_HEADERS`.

## Known caveats

- An existing local `dev.db` may be behind the latest migration: run `uv run alembic upgrade head` after pulling. Accounts registered before M3 have **no** default categories (there is no data migration, by user decision); register a new user to get them.
- For manual checks that must not touch `dev.db`, point the app at a throwaway database, e.g. `DATABASE_URL=sqlite:///<scratchpad>/check.db uv run alembic upgrade head` and the same variable for `uv run fastapi dev app/main.py`.

- Tests use `httpx2` (the Starlette test client deprecates `httpx`).
