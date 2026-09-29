"""Every non-public route must reject anonymous callers."""

import pytest
from httpx import AsyncClient

from app.auth.routes import PUBLIC_PATHS
from app.main import create_app
from tests.conftest import make_settings
from tests.test_auth_routes import sign_in
from tests.workos_fakes import WorkOSHarness

ALWAYS_PUBLIC = {"/health", "/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}


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
    concrete = path.replace("{", "").replace("}", "")
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
