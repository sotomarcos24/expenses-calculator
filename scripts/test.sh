#!/usr/bin/env bash
# Run every test block: backend unit, backend integration, frontend.
# Usage: ./scripts/test.sh [--postgres]
#   --postgres  run the integration block against a temporary postgres:17 container (needs Docker).
# Without --postgres the integration block uses DATABASE_URL if set, else in-memory SQLite.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USE_POSTGRES=0
for arg in "$@"; do
  case "$arg" in
    --postgres) USE_POSTGRES=1 ;;
    -h|--help) sed -n 2,6p "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

CONTAINER=""
cleanup() {
  if [ -n "$CONTAINER" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    CONTAINER=""
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

SUMMARY=()
FAILED=0

run_block() { # name, dir, command...
  local name="$1" dir="$2"
  shift 2
  echo
  echo "=== $name ==="
  if (cd "$dir" && "$@"); then
    SUMMARY+=("PASS  $name")
  else
    SUMMARY+=("FAIL  $name")
    FAILED=1
  fi
}

run_block "backend unit" "$ROOT/backend" uv run pytest -m unit

INTEGRATION_NAME="backend integration (${DATABASE_URL:-SQLite})"
if [ "$USE_POSTGRES" = 1 ]; then
  PG_PORT=55432
  CONTAINER="personaldolar-test-pg-$$"
  echo
  echo "=== starting temporary postgres:17 ($CONTAINER) ==="
  if docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=personaldolar \
      -p "127.0.0.1:$PG_PORT:5432" postgres:17 >/dev/null; then
    ready=0
    for _ in $(seq 1 60); do
      if docker exec "$CONTAINER" pg_isready -U postgres -d personaldolar >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep 1
    done
    if [ "$ready" = 1 ]; then
      # pg_isready can answer during the init restart; wait until a real query works.
      for _ in $(seq 1 30); do
        docker exec "$CONTAINER" psql -U postgres -d personaldolar -tc 'select 1' >/dev/null 2>&1 && break
        sleep 1
      done
      export DATABASE_URL="postgresql+psycopg://postgres:postgres@127.0.0.1:$PG_PORT/personaldolar"
      INTEGRATION_NAME="backend integration (Postgres 17)"
      (cd "$ROOT/backend" && uv run alembic upgrade head && uv run alembic check) \
        || { echo "Postgres migrations failed" >&2; ready=0; }
    fi
    if [ "$ready" = 0 ]; then
      SUMMARY+=("FAIL  $INTEGRATION_NAME (Postgres not ready)")
      FAILED=1
    fi
  else
    echo "Could not start Docker container" >&2
    SUMMARY+=("FAIL  backend integration (Postgres container did not start)")
    FAILED=1
    ready=0
  fi
  if [ "$ready" = 1 ]; then
    run_block "$INTEGRATION_NAME" "$ROOT/backend" uv run pytest -m integration
  fi
  cleanup
else
  run_block "$INTEGRATION_NAME" "$ROOT/backend" uv run pytest -m integration
fi

run_block "frontend (vitest)" "$ROOT/frontend" npm test

echo
echo "=== Summary ==="
printf '%s\n' "${SUMMARY[@]}"
if [ "$FAILED" = 0 ]; then
  echo "All test blocks passed."
else
  echo "Some test blocks FAILED."
fi
exit "$FAILED"
