# PersonalDolar

Personal finance tracker: record income, expenses and investments manually, see where your money goes, and simulate how your savings could grow.

- Product spec: [docs/plan.md](docs/plan.md)
- Technical spec: [docs/tech-spec.md](docs/tech-spec.md)
- Milestones and status: [docs/milestones.md](docs/milestones.md)

## Requirements

- Python 3.12 + [uv](https://docs.astral.sh/uv/)
- Node.js 24+

## Running locally

```bash
# Backend — http://localhost:8000 (API docs at /api/docs)
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run fastapi dev app/main.py

# Frontend — http://localhost:5173 (proxies /api to the backend)
cd frontend
npm install
npm run dev
```

## Checks

```bash
# Backend
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app tests scripts && uv run pytest

# Frontend
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

## API contract

`openapi.json` at the repo root is exported from the backend and the frontend API types (`frontend/src/api/schema.d.ts`) are generated from it. After changing a backend route or schema, regenerate both and commit them — CI fails if either is stale:

```bash
(cd backend && uv run python -m scripts.export_openapi)
(cd frontend && npm run gen:api)
```
