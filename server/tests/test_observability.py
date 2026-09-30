import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
import structlog
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from httpx import ASGITransport, AsyncClient
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy.ext.asyncio import AsyncEngine
from starlette.types import Message, Receive, Scope, Send

from app.core.metrics import HttpMetrics
from app.core.middleware import (
    MetricsMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    TimeoutMiddleware,
    route_template,
)
from app.core.telemetry import Telemetry, build_telemetry
from app.main import create_app
from tests.conftest import make_settings
from tests.test_auth_routes import sign_in
from tests.workos_fakes import WorkOSHarness


async def started(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://api.test") as c:
            yield c


# --- liveness / readiness ----------------------------------------------------------------


async def test_healthz_and_legacy_health(client: AsyncClient) -> None:
    for path in ("/healthz", "/health"):
        res = await client.get(path)
        assert (res.status_code, res.json()) == (200, {"status": "ok"})


@pytest.fixture
async def probe_app() -> AsyncIterator[tuple[FastAPI, AsyncClient]]:
    app = create_app(make_settings(readiness_timeout_s=0.1))
    async for c in started(app):
        app.state.db.ping = AsyncMock()
        app.state.queue.ping = AsyncMock()
        yield app, c


async def test_readyz_all_ok(probe_app: tuple[FastAPI, AsyncClient]) -> None:
    _, c = probe_app
    res = await c.get("/readyz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}


async def test_readyz_database_down(probe_app: tuple[FastAPI, AsyncClient]) -> None:
    app, c = probe_app
    app.state.db.ping.side_effect = OSError("connection refused")
    res = await c.get("/readyz")
    assert res.status_code == 503
    assert res.json()["checks"] == {"database": "unavailable", "redis": "ok"}
    assert "refused" not in res.text  # no internals leaked


async def test_readyz_redis_hangs(probe_app: tuple[FastAPI, AsyncClient]) -> None:
    app, c = probe_app

    async def hang() -> None:
        await asyncio.sleep(5)

    app.state.queue.ping.side_effect = hang
    res = await c.get("/readyz")
    assert res.status_code == 503
    assert res.json()["checks"]["redis"] == "unavailable"


async def test_readyz_draining(probe_app: tuple[FastAPI, AsyncClient]) -> None:
    app, c = probe_app
    app.state.draining = True
    res = await c.get("/readyz")
    assert (res.status_code, res.json()["status"]) == (503, "draining")


async def test_readyz_against_real_dependencies(
    migrated_database: str, clean_redis: str, db_engine: AsyncEngine
) -> None:
    app = create_app(make_settings(database_url=migrated_database, redis_url=clean_redis))
    async for c in started(app):
        res = await c.get("/readyz")
    assert res.status_code == 200, res.text


async def test_readyz_real_dependencies_unreachable() -> None:
    app = create_app(
        make_settings(redis_url="redis://127.0.0.1:1/0", readiness_timeout_s=1, redis_timeout_s=0.5)
    )
    async for c in started(app):
        res = await c.get("/readyz")
    assert res.status_code == 503
    assert res.json()["checks"] == {"database": "unavailable", "redis": "unavailable"}


# --- metrics -----------------------------------------------------------------------------


async def test_metrics_record_route_templates(client: AsyncClient) -> None:
    await client.get("/api/v1/leads")
    await client.get("/api/v1/leads/00000000-0000-0000-0000-000000000000")
    await client.get("/definitely/not/a/route")
    body = (await client.get("/metrics")).text
    assert 'http_requests_total{method="GET",route="/api/v1/leads",status="401"} 1.0' in body
    assert 'route="/api/v1/leads/{lead_id}",status="401"' in body
    assert 'route="<unmatched>",status="404"' in body
    assert 'http_requests_in_progress{method="GET"} 1.0' in body  # only the scrape itself
    assert "http_request_duration_seconds_bucket" in body


async def test_metrics_token() -> None:
    app = create_app(make_settings(metrics_token="s3cret"))
    async for c in started(app):
        assert (await c.get("/metrics")).status_code == 401
        bad = await c.get("/metrics", headers={"Authorization": "Bearer nope"})
        assert bad.status_code == 401
        ok = await c.get("/metrics", headers={"Authorization": "Bearer s3cret"})
        assert ok.status_code == 200


async def test_metrics_can_be_disabled() -> None:
    app = create_app(make_settings(metrics_enabled=False))
    async for c in started(app):
        await c.get("/healthz")
        body = (await c.get("/metrics")).text
    assert "http_requests_total{" not in body


def test_route_template_fallback() -> None:
    assert route_template({"type": "http"}) == "<unmatched>"
    assert route_template({"route": object()}) == "<unmatched>"


def test_route_template_without_app_or_pathless_routes() -> None:
    route = SimpleNamespace(path="/relative")
    # No app in scope: fall back to the route's own path.
    assert route_template({"route": route}) == "/relative"

    # Routes without a path (e.g. host routing) are ignored when building the map.
    class PathlessApp:
        routes: tuple[object, ...] = (object(),)

    app = PathlessApp()
    assert route_template({"route": route, "app": app}) == "/relative"


# --- request context, security headers -----------------------------------------------------


async def test_request_id_generated_and_bound_to_logs(settings: Any) -> None:
    app = create_app(settings)
    seen: dict[str, Any] = {}

    async def probe() -> dict[str, str]:
        seen.update(structlog.contextvars.get_contextvars())
        return {}

    app.add_api_route("/probe", probe)
    async for c in started(app):
        with structlog.testing.capture_logs() as logs:
            res = await c.get("/probe")
    rid = res.headers["x-request-id"]
    assert len(rid) == 32
    assert seen["request_id"] == rid
    access = [e for e in logs if e["event"] == "http_request"]
    assert access and access[0]["route"] == "/probe" and access[0]["status"] == 200
    assert structlog.contextvars.get_contextvars() == {}


@pytest.mark.parametrize(
    ("incoming", "echoed"),
    [("abc-123.X_y", True), ("x" * 65, False), ("bad id\n", False), ("", False)],
)
async def test_request_id_propagation(client: AsyncClient, incoming: str, echoed: bool) -> None:
    res = await client.get("/healthz", headers={"X-Request-ID": incoming} if incoming else {})
    assert (res.headers["x-request-id"] == incoming) is echoed


async def test_security_headers(client: AsyncClient) -> None:
    res = await client.get("/healthz")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert "strict-transport-security" not in res.headers


async def test_hsts_when_deployed() -> None:
    app = create_app(make_settings(app_env="staging"))
    async for c in started(app):
        res = await c.get("/healthz")
    assert res.headers["strict-transport-security"].startswith("max-age=")


async def _passthrough_app(scope: Scope, receive: Receive, send: Send) -> None:
    scope["called"] = True


@pytest.mark.parametrize(
    "factory",
    [
        RequestContextMiddleware,
        lambda app: MetricsMiddleware(app, HttpMetrics()),
        lambda app: TimeoutMiddleware(app, 1),
        lambda app: SecurityHeadersMiddleware(app, hsts=True),
    ],
)
async def test_middleware_ignores_non_http_scopes(factory: Any) -> None:
    scope: dict[str, Any] = {"type": "lifespan"}
    await factory(_passthrough_app)(scope, AsyncMock(), AsyncMock())
    assert scope["called"] is True


# --- request timeouts --------------------------------------------------------------------------


async def test_slow_request_times_out_with_504() -> None:
    app = create_app(make_settings(request_timeout_s=0.05))

    async def slow() -> dict[str, str]:
        await asyncio.sleep(2)
        return {}

    app.add_api_route("/slow", slow)
    async for c in started(app):
        res = await c.get("/slow")
        body = (await c.get("/metrics")).text
    assert res.status_code == 504
    assert res.json() == {"detail": "Request timed out"}
    assert 'http_request_timeouts_total{method="GET",route="/slow"} 1.0' in body


async def test_handler_timeout_error_is_not_a_504() -> None:
    app = create_app(make_settings(request_timeout_s=5))

    async def broken() -> None:
        raise TimeoutError("upstream")

    app.add_api_route("/broken", broken)
    async for c in started(app):
        res = await c.get("/broken")
    assert res.status_code == 500


async def test_timeout_after_response_started_aborts() -> None:
    sent: list[Message] = []

    async def streaming(scope: Scope, receive: Receive, send: Send) -> None:
        async def body() -> AsyncIterator[bytes]:
            yield b"first"
            await asyncio.sleep(2)
            yield b"never"

        await StreamingResponse(body())(scope, receive, send)

    async def send(message: Message) -> None:
        sent.append(message)

    async def receive() -> Message:
        await asyncio.sleep(10)
        return {"type": "http.disconnect"}

    middleware = TimeoutMiddleware(streaming, 0.05)
    with pytest.raises(TimeoutError):
        await middleware({"type": "http", "method": "GET", "headers": []}, receive, send)
    assert sent[0]["type"] == "http.response.start"


# --- tracing -----------------------------------------------------------------------------------


def test_telemetry_disabled_is_noop() -> None:
    telemetry = build_telemetry(make_settings())
    assert telemetry.enabled is False
    telemetry.instrument_app(FastAPI())
    telemetry.instrument_engine(AsyncMock())
    telemetry.shutdown()


def test_otlp_exporter_configuration() -> None:
    telemetry = build_telemetry(
        make_settings(otel_enabled=True, otel_exporter_otlp_endpoint="http://127.0.0.1:1/v1/traces")
    )
    assert isinstance(telemetry, Telemetry) and telemetry.enabled
    telemetry.shutdown()  # nothing buffered, so no network I/O


async def test_tracing_captures_http_and_db_spans(
    migrated_database: str, db_engine: AsyncEngine, workos: WorkOSHarness
) -> None:
    from app.auth.session import SessionManager
    from tests.conftest import COOKIE_PASSWORD

    exporter = InMemorySpanExporter()
    app = create_app(
        make_settings(database_url=migrated_database, otel_enabled=True), span_exporter=exporter
    )
    async with app.router.lifespan_context(app):
        app.state.session_manager = SessionManager(
            workos.client, cookie_password=COOKIE_PASSWORD, timeout_s=2
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api.test") as c:
            await sign_in(c, workos, organization_id="org_01")
            exporter.clear()
            await c.get("/healthz")
            assert exporter.get_finished_spans() == ()  # probes are excluded
            assert (await c.get("/api/v1/leads")).status_code == 200
    spans = exporter.get_finished_spans()
    names = {s.name for s in spans}
    assert "GET /api/v1/leads" in names
    db_spans = [s for s in spans if (s.attributes or {}).get("db.system") == "postgresql"]
    assert db_spans, names
    server = next(s for s in spans if s.name == "GET /api/v1/leads")
    assert all(s.context.trace_id == server.context.trace_id for s in db_spans)
