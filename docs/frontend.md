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

- Pages are placeholders (`<Placeholder milestone={N} />`); replace them when the corresponding milestone is built. Login and register are real forms (M2).
- Categories page (M3) is real but read-only so far: Expenses / Income trees (`src/components/CategoryTree.tsx`), side by side from `md` up and as tabs below it, collapsed by default, in API order (never re-sorted). Add / rename / delete comes in #15. Data comes from `useCategories()` in `src/hooks/useCategories.ts` (one `GET /api/categories`, split by `kind` on the client); invalidate `CATEGORIES_QUERY_KEY` after any category change.
- Forms use `react-hook-form` + `zod` (v4) via `@hookform/resolvers/zod`; schemas live in `src/lib/` (e.g. `authSchemas.ts`). Shared form UI: `TextField` (label + inline error with `aria-describedby` / `aria-invalid`), `Button`, `FormError` (`role="alert"`) in `src/components/`.
- Libraries named in the tech spec but **not installed yet** — add them when a milestone needs them (they are already approved):
  - `recharts` (charts, M6–M7).
  - shadcn/ui is not initialised. Either run its CLI (non-interactive flags) or write small components in `src/components/`; whichever is chosen, they must use the theme tokens.

## Known caveats

- `openapi-typescript` (7.13.0) declares `typescript: ^5.x` as a peer dependency, while the frontend uses TypeScript 6. Decision: it is **not** a devDependency; `gen:api` runs the pinned exact version through `npx --yes openapi-typescript@7.13.0`. Do not install it, do not use `--force` / `--legacy-peer-deps` and do not downgrade TypeScript. Bump the pinned version deliberately.
