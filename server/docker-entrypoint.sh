#!/bin/sh
set -eu

# server/.env is loaded for WorkOS keys. Inside Compose that file often still
# says localhost, which is this container, not Postgres. These two always win.
if [ "${CORRAL_IN_COMPOSE:-}" = "1" ]; then
  export DATABASE_URL="postgresql+asyncpg://corral:corral@postgres:5432/corral"
  export REDIS_URL="redis://redis:6379/0"
fi

if [ "${1:-api}" = "api" ]; then
  echo "health check: GET /healthz    readiness: GET /readyz    (after migrations)"
  i=0
  until python -c 'import socket; socket.getaddrinfo("postgres", 5432)' >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "database host 'postgres' did not resolve; /readyz never starts until it does" >&2
      exit 1
    fi
    echo "waiting for database host postgres ($i)"
    sleep 1
  done
  alembic upgrade head
  exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}"
fi

exec "$@"
