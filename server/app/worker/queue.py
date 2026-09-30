"""Producer side of the job queue (used by the API)."""

import uuid

from arq.connections import ArqRedis
from arq.jobs import Job
from redis.asyncio import ConnectionPool

from app.core.config import Settings

QUEUE_NAME = "corral:queue"
INGEST_DEFER_S = 1.0


class JobQueue:
    """Thin typed wrapper around an arq Redis pool. Connections are opened lazily."""

    def __init__(self, redis: ArqRedis) -> None:
        self.redis = redis

    @classmethod
    def from_settings(cls, settings: Settings) -> "JobQueue":
        pool = ConnectionPool.from_url(
            settings.redis_url,
            socket_connect_timeout=settings.redis_timeout_s,
            socket_timeout=settings.redis_timeout_s,
        )
        return cls(ArqRedis(connection_pool=pool, default_queue_name=QUEUE_NAME))

    async def ping(self) -> None:
        await self.redis.ping()

    async def enqueue_count_org_leads(self, org_id: uuid.UUID) -> Job | None:
        """Returns ``None`` if an identical job (same id) is already queued."""
        return await self.redis.enqueue_job(
            "count_org_leads", str(org_id), _job_id=f"count_org_leads:{org_id}"
        )

    async def enqueue_ingest_source(
        self, org_id: uuid.UUID, source_id: uuid.UUID, generation: int
    ) -> Job | None:
        """Read a knowledge-base source. One job per (source, generation).

        Called *inside* the request transaction, so a Redis failure rolls the new source
        back. The short defer gives that transaction time to commit; the job also retries
        briefly if the row isn't visible yet.
        """
        return await self.redis.enqueue_job(
            "ingest_source",
            str(org_id),
            str(source_id),
            generation,
            _job_id=f"ingest_source:{source_id}:{generation}",
            _defer_by=INGEST_DEFER_S,
        )

    async def enqueue_import_leads(self, org_id: uuid.UUID, import_id: uuid.UUID) -> Job | None:
        """Apply a stored CSV import. Enqueued inside the request transaction, like ingest."""
        return await self.redis.enqueue_job(
            "import_leads",
            str(org_id),
            str(import_id),
            _job_id=f"import_leads:{import_id}",
            _defer_by=INGEST_DEFER_S,
        )

    async def close(self) -> None:
        await self.redis.aclose(close_connection_pool=True)
