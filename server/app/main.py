"""ASGI application factory.

Run with ``uvicorn app.main:create_app --factory``. All long-lived resources (DB engine,
WorkOS client) are created in the lifespan and released on shutdown.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.auth.session import SessionManager
from app.auth.workos_client import build_workos_client
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.db.session import Database

log = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.app_env, settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = Database.from_settings(settings)
        workos = build_workos_client(settings)
        app.state.db = db
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
        log.info("startup_complete", env=settings.app_env)
        try:
            yield
        finally:
            if workos is not None:
                await workos.close()
            await db.dispose()
            log.info("shutdown_complete")

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.state.settings = settings
    register_exception_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api_router)
    return app
