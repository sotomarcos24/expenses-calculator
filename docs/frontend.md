# Frontend guide

Read this before working on `frontend/` (React 19, Vite, TypeScript). General rules live in [`AGENTS.md`](../AGENTS.md).

## Layout

```text
frontend/src/{api,pages,components,hooks,lib}
```

## Commands

Run from `frontend/`:

```bash
npm install
npm run dev                           # :5173, proxies /api → :8000
npm run gen:api                       # regenerate src/api/schema.d.ts from ../openapi.json
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

The last line is the full check set: run it before saying a frontend task is done.

`npm run gen:api` reads the committed `../openapi.json` (the backend server is **not** needed) and writes `src/api/schema.d.ts`, formatted with Prettier. After any backend route or schema change, run `uv run python -m scripts.export_openapi` in `backend/`, then `npm run gen:api` here, and commit both files. CI runs `gen:api` and fails if `src/api/schema.d.ts` differs from the committed file (and the backend job fails if `openapi.json` is stale); to fix a failure, run those two commands and commit the result. Use the aliases in `src/api/types.ts` (e.g. `UserRead`, `LoginRequest`) instead of hand-written API types.

## Conventions

- Routes are declared in `src/routes.tsx`; pages in `src/pages/`, shared UI in `src/components/`.
- All HTTP calls go through `apiFetch` (`src/api/client.ts`); server state via TanStack Query hooks in `src/hooks/`.
- Colours: use only the theme tokens defined in `src/index.css` (`bg-primary`, `text-muted`, `border-border`, `text-gain`, …). Never hard-code hex values in components. Palette: white and blue (tech-spec §8.1).
- Format money and percentages with `formatCurrency` / `formatPercent` (`src/lib/format.ts`).
- Imports use explicit `.ts` / `.tsx` extensions. Prettier style: no semicolons, single quotes, width 100.
- Tests next to the code (`*.test.ts(x)`) with Vitest + Testing Library.

## Environment

- Local Node is 25, CI uses Node 24; avoid APIs only available in Node 25.

## Current state

- Real pages: Login and Register (M2), Categories (M3), Transactions (M4: list, create, edit and delete). Dashboard, Investments and Simulator are still placeholders (`<Placeholder milestone={N} />`); replace them when the corresponding milestone is built.
- Transactions page (M4): filters (`src/components/TransactionFilters.tsx`: Period preset with a Custom From / To range, Type, Category grouped by kind, Subcategory, Clear filters), a read-only table (`TransactionTable.tsx`: Date, Type, Category `Food › Groceries`, Note, signed Amount with income in `text-gain` and expenses in `text-foreground`, plus the salary line `Gross $3,000.00 · 20.0% deductions`) and `Pagination.tsx` (Previous / Next, shown only when `total > 50`). Filter state lives in the page (not the URL), defaults to _This month_ and any change resets the page to 1; an empty page past the end jumps to the last page. The pure filter logic (`TransactionFilterState`, `DEFAULT_FILTERS` / `CLEARED_FILTERS`, `hasActiveFilters`, `isRangeInvalid`, `filtersToParams`) is in `src/lib/transactionFilters.ts`; an invalid Custom range (From after To) sends no request.
- Transactions create / edit (M4, #22): an **Add transaction** button in the `PageHeader` actions (also in the `No transactions yet.` empty state) and an **Edit** button per row (last column `Actions`, accessible name like `Edit Food › Groceries, Oct 14, 2026, −$12.30`) open `TransactionFormDialog` (`src/components/`). The page holds the dialog state (`closed` / `create` / `edit` + row) and shows a `role="status"` `Transaction saved.` after a save (it matters when the saved row falls outside the filters). The form (React Hook Form + `zodResolver`, `mode: 'onSubmit'`, `reValidateMode: 'onChange'`) has Type radios, Date, Amount, Gross amount (income only, with the live `Deduction rate: 20.0%` in an `aria-live` region), Category (top-level categories of the type, link to `/categories` when there are none), Subcategory (`None` + children, disabled without children) and Note. Changing Type resets Category / Subcategory (and clears Gross for Expense), changing Category resets Subcategory; these resets only run on user changes, so Edit keeps the row's values (also when the categories load after the dialog opened). Edit is pre-filled from the row (no GET) and saves with `PATCH`; every field is sent on both POST and PATCH. API errors stay in the dialog with the typed values.
- Transactions delete (M4, #23): a **Delete** button per row (`ghost`, next to Edit, accessible name like `Delete Food › Groceries, Oct 14, 2026, −$12.30`) opens `TransactionDeleteDialog` (`src/components/`): an `alertdialog` titled `Delete transaction?` with the row summary (`Food › Groceries · Oct 14, 2026 · −$12.30` and the note), **Delete** (`danger`, disabled while pending) and **Cancel** (initial focus, so Enter does not delete by accident). On 204 the dialog closes after the refetch and the page shows `Transaction deleted.`; on 404 it closes and the page shows `Transaction not found` in a `role="alert"` above the list; both move focus to **Add transaction**. Other errors keep the dialog open with the generic message to retry. The page holds one message (`PageMessage`: a `role="status"` text or an alert); opening any dialog or changing a filter clears it, so `Transaction saved.` and the delete messages are never shown together. `formatCategoryLabel(row)` (`src/lib/format.ts`) builds `Food › Groceries` for the table and the dialog.
- `Dialog` (`src/components/Dialog.tsx`): a portal `div` overlay with `role="dialog"` (or `alertdialog`), `aria-modal`, `aria-labelledby` its title; focus moves inside on open (first tabbable element or `initialFocusRef`), Tab / Shift+Tab wrap inside (a radio group is one tab stop), Escape calls `onClose`, the backdrop does not close it, body scroll is locked, and on close focus returns to the opener or, if it is gone, to `fallbackFocusRef`. It fits the viewport at 375px and its content scrolls vertically. The caller unmounts it to close it.
- `src/lib/money.ts`: `parseMoney(input)` → integer cents as `bigint` or a typed error (`required` / `not-positive` / `too-many-decimals` / `too-large` / `format`), max `MAX_MONEY_CENTS` (9,999,999,999.99); `deductionRate(grossCents, netCents)` → the API's 4-decimal string (`"0.2000"`), ROUND_HALF_UP in `bigint`. Money is never converted with `Number` / `parseFloat`; only `formatCurrency` / `formatPercent` do, for display.
- `src/lib/transactionSchemas.ts`: `transactionFormSchema` (string inputs, exact messages such as `Amount must be greater than 0`, `Gross amount must be at least the amount`, `Select a category`, `Note must be at most 500 characters`) transforms the values into the request body (`TransactionPayload`: trimmed money strings, `gross_amount` `null` for an expense or empty, numeric ids, trimmed note or `null`); `emptyTransactionForm()` (expense dated `todayLocalIso()`) and `transactionToForm(row)`.
- `src/lib/transactionErrors.ts`: `transactionErrorMessage(error)` → the string `detail` of a 404 / 422 verbatim, `Some fields are invalid. Please check the form.` for a 422 validation list, `GENERIC_ERROR` otherwise.
- `TextField` takes an optional `hint` (help text linked through `aria-describedby`).
- `useCreateTransaction()` / `useUpdateTransaction()` / `useDeleteTransaction()` (`src/hooks/useTransactions.ts`): `POST /api/transactions`, `PATCH /api/transactions/{id}` and `DELETE /api/transactions/{id}` (204); they invalidate `TRANSACTIONS_QUERY_KEY` on success and on a 404 (row or category gone). No optimistic updates.
- `useTransactions(params)` (`src/hooks/useTransactions.ts`): one `GET /api/transactions` page, only set parameters in the query string, `page_size` always `TRANSACTIONS_PAGE_SIZE` (50), `placeholderData: keepPreviousData`, `params = null` disables it. `useTransactionsTotal(enabled)` asks `?page_size=1` with no filters to tell "No transactions yet." from "No transactions match these filters.". Every key starts with `TRANSACTIONS_QUERY_KEY` (`['transactions']`): invalidate it after any transaction change.
- `src/lib/periods.ts` (reusable by the Dashboard in M6): `PeriodPreset` (`this-month` / `this-year` / `all-time` / `custom`), `periodRange(preset, today)` (this month ends on the last day of the month, not today), `toLocalIso(date)` and `todayLocalIso()`, always from the **local** calendar date (never `toISOString()`).
- `src/lib/format.ts` also has `formatDate('2026-10-14')` → `Oct 14, 2026` (formatted in UTC, so the day never shifts) and `formatSignedAmount(type, amount)` → `+$2,400.00` / `−$12.30` (U+2212).
- Categories page (M3): Expenses / Income trees (`src/components/CategoryTree.tsx`), side by side from `md` up (plain `<section>`s labelled by their heading, no tab roles) and as WAI-ARIA tabs below it (switching to another tab closes the open inline editor; shrinking to mobile selects the tab of the open editor), collapsed by default, in API order (never re-sorted). Inline add (category / subcategory), rename and delete with an inline confirmation (`CategoryNameForm`, `DeleteConfirmation` in `src/components/`); only one inline editor is open at a time, modelled by `CategoryEditor` in `src/lib/categoryEditor.ts` and held by the page. Data comes from `useCategories()` in `src/hooks/useCategories.ts` (one `GET /api/categories`, split by `kind` on the client); the mutation hooks `useCreateCategory` / `useRenameCategory` / `useDeleteCategory` live in the same file and invalidate `CATEGORIES_QUERY_KEY` on success and on 404 (no optimistic updates). Names are validated with `categoryNameSchema` (`src/lib/categorySchemas.ts`: trimmed, 1–100 characters); API errors are turned into text by `categoryErrorMessage` (`src/lib/categoryErrors.ts`: string `detail` of a 404/409/422 verbatim, generic message otherwise).
- `useMediaQuery(query)` (`src/hooks/useMediaQuery.ts`, built on `window.matchMedia` + `useSyncExternalStore`) tracks a media query; `MD_MEDIA_QUERY` is Tailwind v4's default `md` breakpoint (`(min-width: 48rem)`). Use it only when behaviour (not just styling) depends on the breakpoint.
- Tests: jsdom has no `matchMedia`, so `src/test/matchMedia.ts` provides a controllable mock that `src/test/setup.ts` installs before every test at a mobile width (375px). Call `installMatchMedia(DESKTOP_WIDTH)` before rendering to start at desktop width, and `resizeTo(width)` to change it (fires `change`, wrapped in `act`); `matchMediaListenerCount(query)` checks listeners are removed.
- Shared `Button` (`src/components/Button.tsx`) has `variant` (`primary` default, `secondary`, `danger`, `ghost`), `size` (`md` default, `sm`, `icon`) and `fullWidth` (off by default; the auth forms pass it). Use it instead of hand-styled buttons.
- Forms use `react-hook-form` + `zod` (v4) via `@hookform/resolvers/zod`; schemas live in `src/lib/` (e.g. `authSchemas.ts`). Shared form UI: `TextField` (label + inline error with `aria-describedby` / `aria-invalid`), `Button`, `FormError` (`role="alert"`) in `src/components/`.
- Libraries named in the tech spec but **not installed yet** — add them when a milestone needs them (they are already approved):
  - `recharts` (charts, M6–M7).
  - shadcn/ui is not initialised. Either run its CLI (non-interactive flags) or write small components in `src/components/`; whichever is chosen, they must use the theme tokens.

## Known caveats

- On the Categories page the tablist still has a `md:hidden` class; it is redundant (the tablist is only rendered below `md`) but harmless.

- `openapi-typescript` (7.13.0) declares `typescript: ^5.x` as a peer dependency, while the frontend uses TypeScript 6. Decision: it is **not** a devDependency; `gen:api` runs the pinned exact version through `npx --yes openapi-typescript@7.13.0`. Do not install it, do not use `--force` / `--legacy-peer-deps` and do not downgrade TypeScript. Bump the pinned version deliberately.
