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

- Real pages: Login and Register (M2), Categories (M3). Dashboard, Transactions, Investments and Simulator are still placeholders (`<Placeholder milestone={N} />`); replace them when the corresponding milestone is built.
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
