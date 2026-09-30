from collections.abc import AsyncIterator
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from structlog.testing import capture_logs
from workos._errors import AuthenticationError, WorkOSConnectionError

from app.auth.routes import STATE_COOKIE
from app.main import create_app
from app.models.identity import Membership, Organization, User
from tests.conftest import FRONTEND_URL, make_settings
from tests.workos_fakes import WorkOSHarness, auth_response, mint_access_token

SESSION_COOKIE = "wos_session"
ORIGIN = {"Origin": FRONTEND_URL}


def set_cookie_headers(res: Response) -> list[str]:
    return res.headers.get_list("set-cookie")


def cookie_cleared(res: Response, name: str) -> bool:
    return any(h.startswith(f'{name}=""') and "Max-Age=0" in h for h in set_cookie_headers(res))


async def start_login(client: AsyncClient) -> str:
    res = await client.get("/api/v1/auth/login")
    return parse_qs(urlparse(res.headers["location"]).query)["state"][0]


async def sign_in(
    client: AsyncClient,
    workos: WorkOSHarness,
    *,
    organization_id: str | None = None,
    role: str | None = None,
) -> Response:
    workos.authenticate_with_code.return_value = auth_response(
        organization_id=organization_id,
        access_token=mint_access_token(org_id=organization_id, role=role),
    )
    state = await start_login(client)
    return await client.get("/api/v1/auth/callback", params={"code": "c1", "state": state})


# --- login ------------------------------------------------------------------------


async def test_login_redirects_to_authkit_with_state_cookie(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/login")
    assert res.status_code == 303
    url = urlparse(res.headers["location"])
    q = parse_qs(url.query)
    assert url.netloc == "api.workos.com"
    assert q["redirect_uri"] == ["http://api.test/api/v1/auth/callback"]
    state_cookie = client.cookies.get(STATE_COOKIE, path="/api/v1/auth")
    assert state_cookie == q["state"][0]
    header = next(h for h in set_cookie_headers(res) if h.startswith(STATE_COOKIE))
    assert "HttpOnly" in header and "SameSite=lax" in header and "Max-Age=600" in header


async def test_login_screen_hint(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/login", params={"screen_hint": "sign-up"})
    assert parse_qs(urlparse(res.headers["location"]).query)["screen_hint"] == ["sign-up"]
    bad = await client.get("/api/v1/auth/login", params={"screen_hint": "evil"})
    assert bad.status_code == 422


@pytest.fixture
async def unconfigured_client() -> AsyncIterator[AsyncClient]:
    app = create_app(make_settings(workos_api_key=""))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api.test") as c:
            yield c


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/api/v1/auth/login"), ("GET", "/api/v1/auth/me"), ("POST", "/api/v1/auth/logout")],
)
async def test_auth_not_configured_returns_503(
    unconfigured_client: AsyncClient, method: str, path: str
) -> None:
    unconfigured_client.cookies.set(SESSION_COOKIE, "x")
    res = await unconfigured_client.request(method, path, headers=ORIGIN)
    assert res.status_code == 503
    assert res.json()["detail"] == "Authentication is not configured"


# --- callback (failure paths need no database) --------------------------------------


def assert_error_redirect(res: Response, code: str) -> None:
    assert res.status_code == 303
    assert res.headers["location"] == f"{FRONTEND_URL}/sign-in?error={code}"
    assert SESSION_COOKIE not in res.cookies


async def test_callback_provider_error(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/callback", params={"error": "access_denied"})
    assert_error_redirect(res, "provider_error")


async def test_callback_without_state_cookie(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/callback", params={"code": "c", "state": "s"})
    assert_error_redirect(res, "invalid_request")


async def test_callback_missing_code(client: AsyncClient) -> None:
    state = await start_login(client)
    res = await client.get("/api/v1/auth/callback", params={"state": state})
    assert_error_redirect(res, "invalid_request")


async def test_callback_state_mismatch_is_rejected(
    client: AsyncClient, workos: WorkOSHarness
) -> None:
    await start_login(client)
    res = await client.get("/api/v1/auth/callback", params={"code": "c", "state": "forged"})
    assert_error_redirect(res, "invalid_state")
    workos.authenticate_with_code.assert_not_awaited()


@pytest.mark.parametrize(
    ("error", "code"),
    [(AuthenticationError("bad"), "auth_failed"), (WorkOSConnectionError("x"), "auth_unavailable")],
)
async def test_callback_exchange_failures(
    client: AsyncClient, workos: WorkOSHarness, error: Exception, code: str
) -> None:
    workos.authenticate_with_code.side_effect = error
    state = await start_login(client)
    res = await client.get("/api/v1/auth/callback", params={"code": "c", "state": state})
    assert_error_redirect(res, code)


async def test_callback_rejects_oversized_params(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/callback", params={"code": "x" * 600, "state": "s"})
    assert res.status_code == 422


# --- callback + session (database) ----------------------------------------------------


async def test_callback_provisions_and_sets_session(
    db_client: AsyncClient, workos: WorkOSHarness, db_engine: AsyncEngine
) -> None:
    res = await sign_in(db_client, workos, organization_id="org_01", role="admin")
    assert res.status_code == 303
    assert res.headers["location"] == FRONTEND_URL
    session_header = next(h for h in set_cookie_headers(res) if h.startswith(SESSION_COOKIE))
    assert "HttpOnly" in session_header and "SameSite=lax" in session_header
    assert "Path=/" in session_header
    assert cookie_cleared(res, STATE_COOKIE)

    async with AsyncSession(db_engine) as s:
        user = (await s.execute(select(User))).scalar_one()
        org = (await s.execute(select(Organization))).scalar_one()
        membership = (await s.execute(select(Membership))).scalar_one()
    assert user.workos_user_id == "user_01"
    assert (org.workos_organization_id, org.name) == ("org_01", "Acme Inc")
    assert (membership.user_id, membership.org_id, membership.role) == (user.id, org.id, "admin")

    me = await db_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == "ada@example.com"
    assert body["organization"]["name"] == "Acme Inc"
    assert body["role"] == "admin"


async def test_personal_workspace_sign_in(db_client: AsyncClient, workos: WorkOSHarness) -> None:
    await sign_in(db_client, workos)
    me = await db_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["organization"]["name"] == "Ada's workspace"
    assert me.json()["role"] == "owner"


async def test_me_requires_session(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert res.json() == {"detail": "Not signed in"}


async def test_me_with_invalid_cookie_clears_it(client: AsyncClient) -> None:
    client.cookies.set(SESSION_COOKIE, "garbage")
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert cookie_cleared(res, SESSION_COOKIE)


async def test_me_when_provider_unavailable(client: AsyncClient, workos: WorkOSHarness) -> None:
    workos.jwks.fail = True
    client.cookies.set(SESSION_COOKIE, workos.seal())
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 503


async def test_me_valid_session_without_local_user_is_forbidden(
    db_client: AsyncClient, workos: WorkOSHarness
) -> None:
    db_client.cookies.set(SESSION_COOKIE, workos.seal())
    res = await db_client.get("/api/v1/auth/me")
    assert res.status_code == 403


async def test_me_session_for_org_without_membership_is_forbidden(
    db_client: AsyncClient, workos: WorkOSHarness
) -> None:
    await sign_in(db_client, workos, organization_id="org_01")
    # Same user, but the session now claims an org they were never provisioned into.
    db_client.cookies.set(SESSION_COOKIE, workos.seal(org_id="org_other"))
    res = await db_client.get("/api/v1/auth/me")
    assert res.status_code == 403


async def test_expired_session_is_refreshed_transparently(
    db_client: AsyncClient, workos: WorkOSHarness
) -> None:
    await sign_in(db_client, workos, organization_id="org_01", role="member")
    db_client.cookies.set(
        SESSION_COOKIE, workos.seal(access_token=mint_access_token(org_id="org_01", expires_in=-5))
    )
    workos.refresh_succeeds(org_id="org_01", role="member")
    res = await db_client.get("/api/v1/auth/me")
    assert res.status_code == 200
    assert any(h.startswith(f"{SESSION_COOKIE}=") for h in set_cookie_headers(res))
    workos.request_raw.assert_awaited_once()


# --- refresh ----------------------------------------------------------------------------


async def test_refresh_requires_cookie(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/auth/refresh", headers=ORIGIN)).status_code == 401


async def test_refresh_success_sets_new_cookie(client: AsyncClient, workos: WorkOSHarness) -> None:
    old = workos.seal()
    client.cookies.set(SESSION_COOKIE, old)
    workos.refresh_succeeds()
    res = await client.post("/api/v1/auth/refresh", headers=ORIGIN)
    assert res.status_code == 200
    assert res.json() == {"refreshed": True}
    assert res.cookies[SESSION_COOKIE] != old


async def test_refresh_denied_clears_cookie(client: AsyncClient, workos: WorkOSHarness) -> None:
    client.cookies.set(SESSION_COOKIE, workos.seal())
    workos.request_raw.return_value = {}
    res = await client.post("/api/v1/auth/refresh", headers=ORIGIN)
    assert res.status_code == 401
    assert cookie_cleared(res, SESSION_COOKIE)


async def test_refresh_provider_unavailable(client: AsyncClient, workos: WorkOSHarness) -> None:
    client.cookies.set(SESSION_COOKIE, workos.seal())
    workos.request_raw.side_effect = WorkOSConnectionError("down")
    res = await client.post("/api/v1/auth/refresh", headers=ORIGIN)
    assert res.status_code == 503
    assert res.json() == {"refreshed": False}


# --- logout -----------------------------------------------------------------------------


async def test_logout_with_valid_session(client: AsyncClient, workos: WorkOSHarness) -> None:
    client.cookies.set(SESSION_COOKIE, workos.seal())
    res = await client.post("/api/v1/auth/logout", headers=ORIGIN)
    assert res.status_code == 200
    q = parse_qs(urlparse(res.json()["logout_url"]).query)
    assert q["session_id"] == ["session_01"]
    assert q["return_to"] == [FRONTEND_URL]
    assert cookie_cleared(res, SESSION_COOKIE)


async def test_logout_without_session(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/logout", headers=ORIGIN)
    assert res.json() == {"logout_url": FRONTEND_URL}
    assert cookie_cleared(res, SESSION_COOKIE)


async def test_logout_with_invalid_session(client: AsyncClient) -> None:
    client.cookies.set(SESSION_COOKIE, "garbage")
    res = await client.post("/api/v1/auth/logout", headers=ORIGIN)
    assert res.json() == {"logout_url": FRONTEND_URL}


async def test_logout_is_post_only(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/logout")).status_code == 405


# --- Origin / CSRF on refresh and logout --------------------------------------------

UNTRUSTED_ORIGINS = [
    {},
    {"Origin": "https://evil.test"},
    {"Origin": "null"},
    {"Origin": FRONTEND_URL + ".evil"},
    # A sibling subdomain is "same-site" to SameSite=Lax, but not a trusted origin.
    {"Origin": "http://evil.frontend.test"},
    {"Origin": FRONTEND_URL.replace("http://", "https://")},  # scheme must match
    {"Origin": FRONTEND_URL + ":8443"},  # and so must the port
]


@pytest.mark.parametrize("headers", UNTRUSTED_ORIGINS)
async def test_refresh_requires_a_trusted_origin(
    client: AsyncClient, workos: WorkOSHarness, headers: dict[str, str]
) -> None:
    old = workos.seal()
    client.cookies.set(SESSION_COOKIE, old)
    workos.refresh_succeeds()
    with capture_logs() as logs:
        res = await client.post("/api/v1/auth/refresh", headers=headers)
    assert res.status_code == 403
    assert res.json() == {"detail": "Origin not allowed"}
    # Refused before WorkOS is called and without reissuing or clearing the cookie.
    workos.request_raw.assert_not_awaited()
    assert set_cookie_headers(res) == []
    assert any(
        e["event"] == "auth_origin_rejected" and e["path"] == "/api/v1/auth/refresh" for e in logs
    )


@pytest.mark.parametrize("headers", UNTRUSTED_ORIGINS)
async def test_logout_requires_a_trusted_origin(
    client: AsyncClient, workos: WorkOSHarness, headers: dict[str, str]
) -> None:
    client.cookies.set(SESSION_COOKIE, workos.seal())
    res = await client.post("/api/v1/auth/logout", headers=headers)
    assert res.status_code == 403
    assert res.json() == {"detail": "Origin not allowed"}
    # A cross-site page can't force a sign-out: the cookie survives.
    assert not cookie_cleared(res, SESSION_COOKIE)
    assert set_cookie_headers(res) == []


@pytest.mark.parametrize("path", ["/api/v1/auth/refresh", "/api/v1/auth/logout"])
@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://LOCALHOST:3000/"])
async def test_refresh_and_logout_accept_cors_origins(
    client: AsyncClient, workos: WorkOSHarness, path: str, origin: str
) -> None:
    # make_settings keeps the default CORS_ORIGINS (http://localhost:3000).
    client.cookies.set(SESSION_COOKIE, workos.seal())
    workos.refresh_succeeds()
    res = await client.post(path, headers={"Origin": origin})
    assert res.status_code == 200


async def test_origin_check_runs_before_the_session_check(client: AsyncClient) -> None:
    # No cookie *and* no origin: the CSRF guard answers first, so a probe learns nothing.
    assert (await client.post("/api/v1/auth/refresh")).status_code == 403
    assert (await client.post("/api/v1/auth/logout")).status_code == 403


def test_every_cookie_authenticated_auth_post_checks_origin() -> None:
    """Regression guard: a new state-changing auth route must opt into the Origin check."""
    from fastapi.routing import APIRoute

    from app.auth.deps import require_trusted_origin
    from app.auth.routes import router

    posts = [r for r in router.routes if isinstance(r, APIRoute) and "POST" in (r.methods or set())]
    assert {r.path for r in posts} == {
        "/auth/code/send",
        "/auth/code/verify",
        "/auth/refresh",
        "/auth/logout",
    }
    for route in posts:
        calls = {d.call for d in route.dependant.dependencies}
        assert require_trusted_origin in calls, route.path


def test_openapi_documents_the_origin_error() -> None:
    schema = create_app(make_settings()).openapi()
    for path in ("/api/v1/auth/refresh", "/api/v1/auth/logout"):
        assert "403" in schema["paths"][path]["post"]["responses"]


async def test_current_user_and_org_dependencies(
    migrated_database: str, db_engine: AsyncEngine, workos: WorkOSHarness
) -> None:
    from app.auth.deps import CurrentOrg, CurrentUser
    from app.auth.session import SessionManager
    from tests.conftest import COOKIE_PASSWORD

    app = create_app(make_settings(database_url=migrated_database))

    async def whoami(user: CurrentUser, org: CurrentOrg) -> dict[str, str]:
        return {"user": user.workos_user_id, "org": org.name}

    app.add_api_route("/whoami", whoami)
    async with app.router.lifespan_context(app):
        app.state.session_manager = SessionManager(
            workos.client, cookie_password=COOKIE_PASSWORD, timeout_s=2
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api.test") as c:
            await sign_in(c, workos, organization_id="org_01")
            res = await c.get("/whoami")
    assert res.json() == {"user": "user_01", "org": "Acme Inc"}
