"""ASGI application factory.

Run with ``uvicorn app.main:create_app --factory``. All long-lived resources (DB engine,
Redis pool, WorkOS client, tracer provider) are created in the lifespan and released on
shutdown, in reverse order. On shutdown the app first flips ``/readyz`` to 503 so load
balancers stop routing to it while uvicorn drains in-flight requests
(``--timeout-graceful-shutdown``).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.sdk.trace.export import SpanExporter

from app.api import meta
from app.api.v1.router import api_router
from app.api.v1.routes.kb import UPLOAD_PATH_SUFFIX
from app.api.v1.routes.lead_imports import UPLOAD_PATH_SUFFIX as LEAD_IMPORT_PATH_SUFFIX
from app.api.v1.routes.workspace import LOGO_PATH_SUFFIX, PICTURE_PATH_SUFFIX
from app.auth.session import SessionManager
from app.auth.workos_client import build_workos_client
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.metrics import HttpMetrics
from app.core.middleware import (
    MetricsMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    TimeoutMiddleware,
    UploadLimitMiddleware,
)
from app.core.telemetry import build_telemetry
from app.db.session import Database
from app.kb.embeddings import build_embedder
from app.worker.queue import JobQueue

log = structlog.get_logger(__name__)

MULTIPART_OVERHEAD_BYTES = 64 * 1024


def create_app(
    settings: Settings | None = None, *, span_exporter: SpanExporter | None = None
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.app_env, settings.log_level)
    telemetry = build_telemetry(settings, exporter=span_exporter)
    http_metrics = HttpMetrics()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = Database.from_settings(settings)
        telemetry.instrument_engine(db.engine)
        queue = JobQueue.from_settings(settings)
        workos = build_workos_client(settings)
        embedder = build_embedder(settings)
        app.state.db = db
        app.state.queue = queue
        app.state.embedder = embedder
        app.state.draining = False
        app.state.session_manager = (
            SessionManager(
                workos,
                cookie_password=settings.workos_cookie_password.get_secret_value(),
                timeout_s=settings.workos_request_timeout_s,
            )
            if workos is not None
            else None
        )
        if workos is None:
            log.warning("workos_not_configured", detail="auth endpoints will return 503")
        log.info("startup_complete", env=settings.app_env, tracing=telemetry.enabled)
        try:
            yield
        finally:
            app.state.draining = True
            log.info("shutdown_started")
            if workos is not None:
                await workos.close()
            await embedder.aclose()
            await queue.close()
            await db.dispose()
            telemetry.shutdown()
            log.info("shutdown_complete")

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.state.settings = settings
    app.state.metrics = http_metrics
    register_exception_handlers(app)

    # Starlette wraps middleware in reverse order of registration: the last one added is
    # outermost. Effective order: RequestContext > SecurityHeaders > Metrics > Timeout >
    # CORS > UploadLimit > routes.
    app.add_middleware(
        UploadLimitMiddleware,
        path_suffix=UPLOAD_PATH_SUFFIX,
        # The multipart envelope (boundary, part headers, form fields) on top of the file.
        max_bytes=settings.kb_max_file_bytes + MULTIPART_OVERHEAD_BYTES,
    )
    app.add_middleware(
        UploadLimitMiddleware,
        path_suffix=LEAD_IMPORT_PATH_SUFFIX,
        max_bytes=settings.leads_import_max_bytes + MULTIPART_OVERHEAD_BYTES,
    )
    app.add_middleware(
        UploadLimitMiddleware,
        path_suffix=LOGO_PATH_SUFFIX,
        max_bytes=settings.logo_max_bytes + MULTIPART_OVERHEAD_BYTES,
    )
    app.add_middleware(
        UploadLimitMiddleware,
        path_suffix=PICTURE_PATH_SUFFIX,
        max_bytes=settings.logo_max_bytes + MULTIPART_OVERHEAD_BYTES,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
        # The email-code screen reads Retry-After on a 429 for its countdown.
        expose_headers=["Retry-After", "X-Request-ID"],
    )
    app.add_middleware(
        TimeoutMiddleware, timeout_s=settings.request_timeout_s, metrics=http_metrics
    )
    if settings.metrics_enabled:
        app.add_middleware(MetricsMiddleware, metrics=http_metrics)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.cookie_secure)
    app.add_middleware(RequestContextMiddleware)

    app.include_router(meta.router)
    app.include_router(api_router)
    telemetry.instrument_app(app)
    return app
