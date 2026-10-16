# syntax=docker/dockerfile:1

# Stage 1: build the frontend (output in /build/frontend/dist).
FROM node:24-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend runtime; FastAPI serves the API plus the built frontend.
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/backend/.venv/bin:$PATH" \
    FRONTEND_DIST_DIR=/app/frontend/dist \
    PORT=8000

RUN useradd --system --create-home --uid 10001 app
WORKDIR /app/backend

# Dependencies first so this layer is cached while only the code changes.
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/ ./
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist
RUN chmod +x docker-entrypoint.sh && chown -R app:app /app

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/health', timeout=4)"]

ENTRYPOINT ["./docker-entrypoint.sh"]
