#!/bin/sh
# Container entrypoint: apply migrations, then serve the API and the built frontend.
set -eu

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
