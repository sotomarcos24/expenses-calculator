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
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app tests && uv run pytest

# Frontend
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test
```
