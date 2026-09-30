"""arq worker entrypoint: ``arq app.worker.main.WorkerSettings``.

Graceful shutdown: on SIGTERM/SIGINT arq stops polling, waits up to
``WORKER_SHUTDOWN_GRACE_S`` for running jobs, then cancels them (they are retried later
because ``retry_jobs`` is on), and finally runs ``on_shutdown`` to release the DB pool.
"""

import math
from typing import Any

import structlog
from arq import func
from arq.connections import RedisSettings

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import Database
from app.kb.embeddings import Embedder, build_embedder
from app.kb.ingest import ingest_source
from app.leads.importer import import_leads
from app.worker.jobs import count_org_leads
from app.worker.queue import QUEUE_NAME

log = structlog.get_logger(__name__)


def redis_settings(settings: Settings) -> RedisSettings:
    rs = RedisSettings.from_dsn(settings.redis_url)
    rs.conn_timeout = max(1, math.ceil(settings.redis_timeout_s))
    return rs


def build_worker_kwargs(settings: Settings) -> dict[str, Any]:
    """Keyword arguments for ``arq.Worker``; shared by the CLI settings and tests."""

    async def on_startup(ctx: dict[str, Any]) -> None:
        configure_logging(settings.app_env, settings.log_level)
        ctx["db"] = Database.from_settings(settings)
        ctx["settings"] = settings
        ctx["embedder"] = build_embedder(settings)
        log.info("worker_started", queue=QUEUE_NAME)

    async def on_shutdown(ctx: dict[str, Any]) -> None:
        db: Database | None = ctx.get("db")
        if db is not None:
            await db.dispose()
        embedder: Embedder | None = ctx.get("embedder")
        if embedder is not None:
            await embedder.aclose()
        log.info("worker_stopped")

    return {
        "functions": [
            func(
                count_org_leads,
                name="count_org_leads",
                timeout=settings.worker_job_timeout_s,
                max_tries=settings.worker_max_tries,
            ),
            func(
                ingest_source,
                name="ingest_source",
                timeout=settings.kb_ingest_timeout_s,
                max_tries=settings.worker_max_tries,
            ),
            func(
                import_leads,
                name="import_leads",
                timeout=settings.leads_import_timeout_s,
                max_tries=settings.worker_max_tries,
            ),
        ],
        "on_startup": on_startup,
        "on_shutdown": on_shutdown,
        "queue_name": QUEUE_NAME,
        "max_jobs": settings.worker_max_jobs,
        "job_timeout": settings.worker_job_timeout_s,
        "max_tries": settings.worker_max_tries,
        "job_completion_wait": settings.worker_shutdown_grace_s,
        "keep_result": 3600,
        "health_check_interval": 60,
        "retry_jobs": True,
    }


class WorkerSettings:
    """Read by the arq CLI. Built from the environment when the worker process starts."""

    _kwargs = build_worker_kwargs(get_settings())
    functions = _kwargs["functions"]
    on_startup = _kwargs["on_startup"]
    on_shutdown = _kwargs["on_shutdown"]
    queue_name = _kwargs["queue_name"]
    max_jobs = _kwargs["max_jobs"]
    job_timeout = _kwargs["job_timeout"]
    max_tries = _kwargs["max_tries"]
    job_completion_wait = _kwargs["job_completion_wait"]
    keep_result = _kwargs["keep_result"]
    health_check_interval = _kwargs["health_check_interval"]
    retry_jobs = _kwargs["retry_jobs"]
    redis_settings = redis_settings(get_settings())
