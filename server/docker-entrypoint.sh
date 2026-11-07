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
  python - <<'WAIT_DB'
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import get_settings

async def wait():
    engine = create_async_engine(get_settings().database_url)
    try:
        for attempt in range(30):
            try:
                async with engine.connect() as connection:
                    await connection.execute(text("SELECT 1"))
                return
            except Exception:
                if attempt == 29:
                    raise
                await asyncio.sleep(1)
    finally:
        await engine.dispose()

asyncio.run(wait())
WAIT_DB
  # Upgrades when this checkout knows the stamped revision. A local volume migrated
  # by another branch is left as it is, and the API still starts. See app/db/migrate.py.
  python -m app.db.migrate
  exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}"
fi

exec "$@"
