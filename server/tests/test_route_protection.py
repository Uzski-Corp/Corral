"""Every non-public route must reject anonymous callers."""

import re

import pytest
from httpx import AsyncClient

from app.auth.routes import PUBLIC_PATHS
from app.main import create_app
from tests.conftest import make_settings
from tests.test_auth_routes import sign_in
from tests.workos_fakes import WorkOSHarness

ALWAYS_PUBLIC = {
    "/health",
    "/healthz",
    "/readyz",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/docs/oauth2-redirect",
}


def protected_routes() -> list[tuple[str, str]]:
    # The OpenAPI document lists every mounted operation, including nested routers.
    schema = create_app(make_settings()).openapi()
    return [
        (method.upper(), path)
        for path, operations in sorted(schema["paths"].items())
        if path not in PUBLIC_PATHS | ALWAYS_PUBLIC
        for method in sorted(operations)
    ]


def test_there_are_protected_routes() -> None:
    paths = {p for _, p in protected_routes()}
    assert {"/api/v1/leads", "/api/v1/auth/me"} <= paths
    assert not paths & PUBLIC_PATHS


@pytest.mark.parametrize(("method", "path"), protected_routes())
async def test_anonymous_request_is_rejected(client: AsyncClient, method: str, path: str) -> None:
    concrete = re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", path)
    res = await client.request(method, concrete)
    assert res.status_code == 401, f"{method} {path} is reachable without auth"


@pytest.mark.parametrize("resource", ["leads", "segments", "sequences", "inbox", "knowledge"])
async def test_authenticated_request_is_allowed(
    db_client: AsyncClient, workos: WorkOSHarness, resource: str
) -> None:
    await sign_in(db_client, workos)
    res = await db_client.get(f"/api/v1/{resource}")
    assert res.status_code == 200
    assert res.json() == []


# POSTs that only read (a search body is too big for a query string). Everything else that
# isn't GET/HEAD/OPTIONS changes state and must check the Origin (CSRF).
# Paddle authenticates this POST with Paddle-Signature. Browser Origin checks do not apply.
PROVIDER_WEBHOOKS = {"/api/v1/billing/webhooks/paddle", "/api/v1/inbox/webhooks/autosend", "/api/v1/ai/tools/{org_id}/{run_id}/{tool}"}

READ_ONLY_POSTS = {
    "/api/v1/products/{product_id}/knowledge/search",
    "/api/v1/companies/query",
    "/api/v1/companies/enroll-plan",
    "/api/v1/segments/preview",
    "/api/v1/segments/{segment_id}/companies",
}


def state_changing_routes() -> list[tuple[str, str]]:
    schema = create_app(make_settings()).openapi()
    return [
        (method.upper(), path)
        for path, operations in sorted(schema["paths"].items())
        for method in sorted(operations)
        if method not in {"get", "head", "options"}
        and path not in READ_ONLY_POSTS
        and path not in PROVIDER_WEBHOOKS
    ]


def test_state_changing_routes_are_found() -> None:
    routes = set(state_changing_routes())
    assert {
        ("POST", "/api/v1/leads"),
        ("PATCH", "/api/v1/leads/{lead_id}"),
        ("DELETE", "/api/v1/leads/{lead_id}"),
        ("POST", "/api/v1/auth/logout"),
    } <= routes


@pytest.mark.parametrize(("method", "path"), state_changing_routes())
@pytest.mark.parametrize("origin", [None, "https://evil.example"])
async def test_every_state_changing_route_checks_the_origin(
    db_client: AsyncClient, workos: WorkOSHarness, method: str, path: str, origin: str | None
) -> None:
    """Behavioural CSRF guard: signed in, but from a foreign (or no) Origin, is refused.

    The Origin dependency runs before body and path validation, so no valid payload is needed.
    """
    await sign_in(db_client, workos)
    concrete = re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", path)
    headers = {} if origin is None else {"Origin": origin}
    res = await db_client.request(method, concrete, headers=headers)
    assert res.status_code == 403, f"{method} {path} accepts a cross-site request"


def test_paddle_webhook_is_intentionally_public() -> None:
    assert "/api/v1/billing/webhooks/paddle" in PUBLIC_PATHS
    routes = set(state_changing_routes())
    assert ("POST", "/api/v1/billing/webhooks/paddle") not in routes
    assert ("POST", "/api/v1/billing/checkout") in routes


def test_read_only_posts_are_real_routes() -> None:
    schema = create_app(make_settings()).openapi()
    for path in READ_ONLY_POSTS:
        assert "post" in schema["paths"][path]
