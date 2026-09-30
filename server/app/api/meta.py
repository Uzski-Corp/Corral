"""Operational endpoints: liveness, readiness and Prometheus metrics (all public)."""

import asyncio
import secrets
from collections.abc import Awaitable, Callable

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

log = structlog.get_logger(__name__)

router = APIRouter(tags=["meta"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness: the process is up and the event loop is responsive. No dependencies."""
    return {"status": "ok"}


@router.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    """Deprecated alias of /healthz."""
    return {"status": "ok"}


async def _check(name: str, probe: Callable[[], Awaitable[None]], timeout_s: float) -> bool:
    try:
        await asyncio.wait_for(probe(), timeout=timeout_s)
    except Exception as exc:
        log.warning("readiness_check_failed", check=name, error_type=type(exc).__name__)
        return False
    return True


@router.get("/readyz")
async def readyz(request: Request) -> JSONResponse:
    """Readiness: database and Redis reachable, and the app is not draining."""
    state = request.app.state
    if getattr(state, "draining", False):
        return JSONResponse({"status": "draining", "checks": {}}, status_code=503)
    timeout_s = state.settings.readiness_timeout_s
    names = ("database", "redis")
    results = await asyncio.gather(
        _check("database", state.db.ping, timeout_s),
        _check("redis", state.queue.ping, timeout_s),
    )
    checks = {name: "ok" if ok else "unavailable" for name, ok in zip(names, results, strict=True)}
    ready = all(results)
    return JSONResponse(
        {"status": "ok" if ready else "unavailable", "checks": checks},
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@router.get("/metrics", include_in_schema=False)
async def metrics(request: Request) -> Response:
    state = request.app.state
    token = state.settings.metrics_token.get_secret_value()
    if token:
        supplied = request.headers.get("authorization", "")
        if not secrets.compare_digest(supplied.encode(), f"Bearer {token}".encode()):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid metrics token")
    return Response(generate_latest(state.metrics.registry), media_type=CONTENT_TYPE_LATEST)
