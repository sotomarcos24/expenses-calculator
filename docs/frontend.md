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
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

The last line is the full check set: run it before saying a frontend task is done.

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

- Pages are placeholders (`<Placeholder milestone={N} />`); replace them when the corresponding milestone is built.
- Libraries named in the tech spec but **not installed yet** — add them when a milestone needs them (they are already approved):
  - `recharts` (charts, M6–M7), `react-hook-form` + `zod` + `@hookform/resolvers` (forms, from M2), `openapi-typescript` (see caveats).
  - shadcn/ui is not initialised. Either run its CLI (non-interactive flags) or write small components in `src/components/`; whichever is chosen, they must use the theme tokens.

## Known caveats

- `openapi-typescript` does not yet support TypeScript 6 (it is planned for milestone 2); check compatibility before adding it.
