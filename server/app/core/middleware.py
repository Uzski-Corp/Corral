"""Pure-ASGI middleware: request context/logging, metrics, timeouts, security headers.

Pure ASGI (rather than ``BaseHTTPMiddleware``) keeps streaming and cancellation
semantics intact and adds no per-request task.
"""

import asyncio
import re
import time
import uuid
from typing import Any
from weakref import WeakKeyDictionary

import structlog
from fastapi.routing import iter_route_contexts
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.metrics import HttpMetrics

log = structlog.get_logger("app.http")

REQUEST_ID_HEADER = "x-request-id"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
UNMATCHED_ROUTE = "<unmatched>"


# Per-app map of route object -> full path template. FastAPI (>=0.137) nests included
# routers lazily, so ``scope["route"].path`` is relative to its router's prefix; the
# public ``iter_route_contexts`` yields each route with its effective (prefixed) path.
_TEMPLATES: WeakKeyDictionary[Any, dict[int, str]] = WeakKeyDictionary()


def _templates_for(app: Any) -> dict[int, str]:
    cached = _TEMPLATES.get(app)
    if cached is None:
        cached = {}
        for ctx in iter_route_contexts(getattr(app, "routes", [])):
            if isinstance(ctx.path, str):
                cached.setdefault(id(ctx.original_route), ctx.path)
        _TEMPLATES[app] = cached
    return cached


def route_template(scope: Scope) -> str:
    """Low-cardinality route label, e.g. ``/api/v1/leads/{lead_id}``."""
    route: Any = scope.get("route")
    if route is None:
        return UNMATCHED_ROUTE
    app = scope.get("app")
    if app is not None:
        full = _templates_for(app).get(id(route))
        if full is not None:
            return full
    path = getattr(route, "path", None)
    return path if isinstance(path, str) else UNMATCHED_ROUTE


class RequestContextMiddleware:
    """Assigns/propagates ``X-Request-ID``, binds it to logs, emits one access log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope["headers"]).get(REQUEST_ID_HEADER.encode(), b"").decode("latin-1")
        request_id = incoming if _VALID_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        status = 500
        started = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message).append(REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            log.info(
                "http_request",
                method=scope["method"],
                route=route_template(scope),
                status=status,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            structlog.contextvars.clear_contextvars()


class MetricsMiddleware:
    def __init__(self, app: ASGIApp, metrics: HttpMetrics) -> None:
        self.app = app
        self.metrics = metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        method = scope["method"]
        status = 500
        started = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        self.metrics.in_progress.labels(method).inc()
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = route_template(scope)
            self.metrics.in_progress.labels(method).dec()
            self.metrics.requests.labels(method, route, str(status)).inc()
            self.metrics.latency.labels(method, route).observe(time.perf_counter() - started)


class TimeoutMiddleware:
    """Cancels request handling after ``timeout_s`` and answers 504 if nothing was sent."""

    def __init__(self, app: ASGIApp, timeout_s: float, metrics: HttpMetrics | None = None) -> None:
        self.app = app
        self.timeout_s = timeout_s
        self.metrics = metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        deadline = asyncio.timeout(self.timeout_s)
        try:
            async with deadline:
                await self.app(scope, receive, send_wrapper)
        except TimeoutError:
            if not deadline.expired():
                raise  # a TimeoutError from the handler itself, not our deadline
            route = route_template(scope)
            log.warning("request_timeout", route=route, timeout_s=self.timeout_s)
            if self.metrics is not None:
                self.metrics.timeouts.labels(scope["method"], route).inc()
            if response_started:
                raise  # headers already sent; let the server abort the connection
            await JSONResponse({"detail": "Request timed out"}, status_code=504)(
                scope, receive, send
            )


class SecurityHeadersMiddleware:
    """Conservative defaults for a JSON API."""

    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        self.app = app
        self.headers = {
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "referrer-policy": "no-referrer",
            "cross-origin-opener-policy": "same-origin",
        }
        if hsts:
            self.headers["strict-transport-security"] = "max-age=63072000; includeSubDomains"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for key, value in self.headers.items():
                    headers.setdefault(key, value)
            await send(message)

        await self.app(scope, receive, send_wrapper)


class UploadLimitMiddleware:
    """Refuse oversized uploads from the headers, before any body byte is read or spooled.

    Applies to ``POST`` paths ending in ``path_suffix``. ``Content-Length`` is required
    (411 without it) and must be at most ``max_bytes`` (413). The ASGI server enforces the
    declared length, so the body can't be longer than the header says. Sits inside CORS so
    the browser can read the error.
    """

    def __init__(self, app: ASGIApp, *, path_suffix: str, max_bytes: int) -> None:
        self.app = app
        self.path_suffix = path_suffix
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or not scope["path"].endswith(self.path_suffix)
        ):
            await self.app(scope, receive, send)
            return
        raw = dict(scope["headers"]).get(b"content-length")
        problem: tuple[int, str, str] | None = None
        if raw is None or not raw.isdigit():
            problem = (411, "length_required", "Send the file with a Content-Length header.")
        elif int(raw) > self.max_bytes:
            problem = (413, "too_large", f"Uploads can be up to {self.max_bytes} bytes.")
        if problem is None:
            await self.app(scope, receive, send)
            return
        status, error, detail = problem
        log.info("upload_refused", status=status, path=scope["path"])
        response = JSONResponse({"error": error, "detail": detail}, status_code=status)
        await response(scope, receive, send)
