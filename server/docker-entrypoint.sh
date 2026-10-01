#!/bin/sh
set -eu

# server/.env is loaded for WorkOS keys. Inside Compose that file often still
# says localhost, which is this container, not Postgres. These two always win.
if [ "${CORRAL_IN_COMPOSE:-}" = "1" ]; then
  export DATABASE_URL="postgresql+asyncpg://corral:corral@172.31.210.10:5432/corral"
  export REDIS_URL="redis://172.31.210.11:6379/0"
fi

if [ "${1:-api}" = "api" ]; then
  echo "health check: GET /healthz    readiness: GET /readyz    (after migrations)"
  i=0
  until python -c 'import socket; s=socket.create_connection(("172.31.210.10", 5432), 2); s.close()'; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "database 172.31.210.10:5432 did not accept a connection; /readyz never starts until it does" >&2
      exit 1
    fi
    echo "waiting for database 172.31.210.10:5432 ($i)"
    sleep 1
  done
  alembic upgrade head
  exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}"
fi

exec "$@"
