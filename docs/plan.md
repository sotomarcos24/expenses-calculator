# Product Spec — PersonalDolar

> Personal finance tracker. Technical design in [`tech-spec.md`](tech-spec.md); delivery plan and status in [`milestones.md`](milestones.md).

## 1. Problem

Most people don't know where their money goes each month, how their investments are actually performing, or whether their savings plan will get them to a goal (a house deposit, early retirement) in time. Spreadsheets work but are tedious and give no forward-looking view.

## 2. Product summary

A web app where an individual user records their income, expenses and investments **manually**, sees a clear breakdown of their spending, tracks investment returns, and runs **simulations** of how their wealth could evolve — including savings goals and retirement/withdrawal scenarios, adjusted for inflation.

- Single-user: each person manages only their own data. No sharing, no collaboration.
- Fully manual: no bank connections, no market-data APIs, no paid external services.
- Language: **English**. Currency: **USD ($)**.
- Visual identity: white and blue palette (details in tech-spec §8.1).

## 3. Target user

Anyone who wants to organise their personal finances and plan ahead, without connecting their bank or paying for a subscription.

## 4. MVP features

### 4.1 Accounts

**User story:** As a user, I want to sign up and log in with email and password so that my financial data is private and available when I come back.

Acceptance criteria:
- A user can register with email + password, log in and log out.
- Passwords are stored hashed, never in plain text.
- A user can only see, create, edit or delete their own data.
- Unauthenticated requests to user data are rejected.
- No password recovery in the MVP (it would require sending emails).

### 4.2 Categories and subcategories

**User story:** As a user, I want my transactions organised into categories and subcategories so that I can see where my money goes in detail.

Acceptance criteria:
- Two levels: category → subcategory (e.g. Transport → Fuel).
- Every new user starts with a default set:
  - **Expenses:** Housing (Rent, Mortgage, Utilities), Food (Groceries, Restaurants), Transport (Fuel, Car payment, Train, Metro), Leisure (Nightlife, Travel, Weekends), Other.
  - **Income:** Salary, Rental income, Dividends, Other income.
- A user can add, rename and delete their own categories and subcategories.
- A category that has transactions cannot be deleted without reassigning or deleting them first.
- From the Categories page the user sets a **fixed monthly amount** (net, with an optional note) on a subcategory, or on a category that has no subcategories (e.g. Rent, Salary). It models a typical month, has no date and applies to every month; setting it again edits it. The dialog asks only for amount and note. Every row shows its monthly amount, and a category's amount is the sum of its subcategories plus its own. These amounts are not transactions and never appear in the Transactions list. *(Planned in M9; today the page records dated transactions.)*

### 4.3 Transactions (income and expenses)

**User story:** As a user, I want to record income and expenses manually so that I have a complete picture of my cash flow.

Acceptance criteria:
- Transactions are for **unplanned, one-off** income and expenses (e.g. a medical bill); recurring monthly figures such as rent or salary are the fixed monthly amounts of §4.2. Dashboard and simulator add both.
- A transaction has: type (income/expense), date, amount ($), category, subcategory, optional note.
- A user can create, edit, delete and list transactions, filtered by period and category.
- Amounts must be positive; the type determines the sign.

### 4.4 Salary: gross and net

**User story:** As a user, I want to record both my gross and net salary so that I know what percentage goes to taxes and deductions.

Acceptance criteria:
- A salary income entry stores gross amount and net amount (net ≤ gross).
- The app shows the effective deduction rate: `(gross − net) / gross`.
- All cash-flow totals and simulations use the **net** amount.

### 4.5 Investments

**User story:** As a user, I want to record my investments and their current value so that I can see my total invested wealth and how it is performing.

Acceptance criteria:
- An investment has: name, type (Stock, Fund, ETF, Crypto, Deposit, Real estate, Other), platform (broker/bank, free text), amount invested, current value, date of last update.
- The user updates the current value manually.
- The app computes per investment and for the whole portfolio: gain/loss in $ and in %.
- No live market prices.

### 4.6 Simulator

**User story:** As a user, I want to project how my investments could grow and test goals and retirement scenarios so that I can plan my savings.

Inputs (pre-filled from the user's data where possible, all editable):
- Starting amount (default: current portfolio value, or a single investment's value).
- Periodic contribution and frequency (weekly / monthly / yearly).
- Expected annual return as a range: pessimistic / base / optimistic (e.g. 3% / 5% / 7%).
- Inflation rate (default 2%).
- Current age.
- Average monthly expenses (default: computed from the user's recorded expenses).

**Mode A — Accumulation ("How much will I have?")**
- Given a horizon in years, show the projected value year by year for the three return scenarios.
- Show results in **today's dollars** (inflation-adjusted) and nominal values.
- Show "years of current expenses covered" by the projected value.

**Mode B — Goal ("How much do I need to save?")**
- Given a target amount and a target date (e.g. $60,000 house deposit in 10 years), compute the required periodic contribution for each return scenario.

**Mode C — Withdrawal / retirement ("Can I retire?")**
- Accumulate until a chosen age, then withdraw either a % per year (e.g. 3%) or a fixed amount per month.
- Show the resulting monthly income, what % of current expenses it covers, and whether the money lasts — and if not, at what age it runs out — for each scenario.

Acceptance criteria:
- Calculations are deterministic and covered by unit tests with known values.
- Charts show the three scenarios as separate lines.
- A clear disclaimer: projections are estimates, not financial advice.

### 4.7 Dashboard

**User story:** As a user, I want a single overview when I log in so that I understand my financial situation at a glance.

Acceptance criteria:
- Period selector: current month (default), year, custom range.
- For the selected period: total income, total expenses, savings, savings rate (`savings / income`).
- Pie chart of expenses by category; clicking a category shows its subcategories.
- Investments: total invested, current value, gain/loss, pie chart by type.
- Shortcut to the simulator.

## 5. Nice-to-have (only if time allows, in this order)

1. Recurring transactions (e.g. rent received every month is added automatically).
2. CSV export of transactions.
3. Spanish translation / configurable currency.

## 6. Non-goals

- Bank connections or importing bank statements.
- Live market prices or any external financial API.
- Tax calculation from gross salary.
- Multi-currency.
- Shared or family accounts.
- Financial advice or recommendations.
- Password recovery / reset by email.

## 7. Decisions (Module 2)

The open points of this spec are resolved; details in [`tech-spec.md`](tech-spec.md).

| Topic | Decision |
| --- | --- |
| App name | **PersonalDolar** |
| Stack | React + Vite + TypeScript frontend, FastAPI backend, SQLite in development → Postgres in production |
| Auth | Email + password (Argon2), JWT in an httpOnly cookie; no password recovery |
| Simulator | Runs in the backend as a pure, unit-tested module exposed in the OpenAPI contract |
| Look and feel | White and blue palette |

## 8. Delivery plan

The MVP is built in milestones, each with its own acceptance criteria — see [`milestones.md`](milestones.md).

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Scaffolding | ✅ Done |
| 2 | Authentication | ✅ Done |
| 3 | Categories | ✅ Done |
| 4 | Transactions | ✅ Done |
| 5 | Investments | ✅ Done |
| 6 | Dashboard | ✅ Done |
| 7 | Simulator | ✅ Done |
| 8 | Polish and deployment | ✅ Done |
| 9 | Refinement | ⬜ Planned |
| 10 | Nice-to-haves (§5) | ⬜ Optional |