"""Email-code (Magic Auth) sign-in: POST /auth/code/send and /auth/code/verify."""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from starlette.requests import Request
from structlog.testing import capture_logs
from workos._errors import (
    AuthenticationError,
    BadRequestError,
    RateLimitExceededError,
    ServerError,
    UnprocessableEntityError,
    WorkOSConnectionError,
    WorkOSError,
    WorkOSTimeoutError,
)

from app.auth.ratelimit import RateLimiter, RateRule
from app.auth.routes import _client_ip, _limit
from app.auth.session import (
    AuthProviderUnavailable,
    MagicCodeNotSent,
    SessionManager,
)
from app.main import create_app
from app.models.identity import Membership, Organization, User
from tests.conftest import COOKIE_PASSWORD, FRONTEND_URL, _running_app, make_settings
from tests.workos_fakes import WorkOSHarness, auth_response, last_kwargs, mint_access_token

SEND = "/api/v1/auth/code/send"
VERIFY = "/api/v1/auth/code/verify"
ORIGIN = {"Origin": FRONTEND_URL, "User-Agent": "pytest-ua"}
EMAIL = "ada@example.com"
CODE = "123456"
NO_RETRY = {"max_retries": 0}


@pytest.fixture
async def code_client(clean_redis: str, workos: WorkOSHarness) -> AsyncIterator[AsyncClient]:
    """App client with Redis (rate limits) but no database."""
    async for c in _running_app(create_app(make_settings(redis_url=clean_redis)), workos):
        yield c


@pytest.fixture
async def code_db_client(
    migrated_database: str, db_engine: AsyncEngine, clean_redis: str, workos: WorkOSHarness
) -> AsyncIterator[AsyncClient]:
    app = create_app(make_settings(database_url=migrated_database, redis_url=clean_redis))
    async for c in _running_app(app, workos):
        yield c


async def limited_client(
    redis_url: str, workos: WorkOSHarness, **limits: Any
) -> AsyncIterator[AsyncClient]:
    app = create_app(make_settings(redis_url=redis_url, **limits))
    async for c in _running_app(app, workos):
        yield c


def wrong(code: str) -> BadRequestError:
    return BadRequestError(
        "rejected", response_json={"code": code, "message": "One-time code rejected."}
    )


# --- send ---------------------------------------------------------------------------


async def test_send_code_asks_workos_and_answers_202(
    code_client: AsyncClient, workos: WorkOSHarness
) -> None:
    res = await code_client.post(SEND, json={"email": EMAIL}, headers=ORIGIN)
    assert res.status_code == 202
    assert res.json() == {"sent": True}
    assert last_kwargs(workos.create_magic_auth) == {
        "email": EMAIL,
        "ip_address": "127.0.0.1",
        "user_agent": "pytest-ua",
        "request_options": NO_RETRY,
    }


@pytest.mark.parametrize(
    "body",
    [{}, {"email": "not-an-email"}, {"email": EMAIL, "extra": 1}, {"email": ""}],
)
async def test_send_code_rejects_bad_input(
    code_client: AsyncClient, workos: WorkOSHarness, body: dict[str, Any]
) -> None:
    res = await code_client.post(SEND, json=body, headers=ORIGIN)
    assert res.status_code == 422
    workos.create_magic_auth.assert_not_awaited()


async def test_send_code_rejects_form_posts(
    code_client: AsyncClient, workos: WorkOSHarness
) -> None:
    res = await code_client.post(SEND, data={"email": EMAIL}, headers=ORIGIN)
    assert res.status_code == 422
    workos.create_magic_auth.assert_not_awaited()


@pytest.mark.parametrize("path", [SEND, VERIFY])
@pytest.mark.parametrize(
    "headers",
    [{}, {"Origin": "https://evil.test"}, {"Origin": "null"}, {"Origin": FRONTEND_URL + ".evil"}],
)
async def test_code_routes_require_a_trusted_origin(
    code_client: AsyncClient, workos: WorkOSHarness, path: str, headers: dict[str, str]
) -> None:
    with capture_logs() as logs:
        res = await code_client.post(path, json={"email": EMAIL, "code": CODE}, headers=headers)
    assert res.status_code == 403
    assert res.json() == {"detail": "Origin not allowed"}
    workos.create_magic_auth.assert_not_awaited()
    workos.authenticate_with_magic_auth.assert_not_awaited()
    assert any(e["event"] == "auth_origin_rejected" for e in logs)


async def test_cors_origins_are_trusted_too(code_client: AsyncClient) -> None:
    # make_settings keeps the default CORS_ORIGINS (http://localhost:3000).
    res = await code_client.post(
        SEND, json={"email": EMAIL}, headers={"Origin": "http://LOCALHOST:3000/"}
    )
    assert res.status_code == 202


@pytest.mark.parametrize(
    "error",
    [
        BadRequestError("nope", code="authentication_method_not_allowed"),
        UnprocessableEntityError("undeliverable"),
        AuthenticationError("denied"),
    ],
)
async def test_send_code_is_enumeration_safe(
    code_client: AsyncClient, workos: WorkOSHarness, error: Exception
) -> None:
    """WorkOS declining to send looks exactly like success to the caller."""
    ok = await code_client.post(SEND, json={"email": "known@example.com"}, headers=ORIGIN)
    workos.create_magic_auth.side_effect = error
    with capture_logs() as logs:
        declined = await code_client.post(SEND, json={"email": "other@example.com"}, headers=ORIGIN)
    assert declined.status_code == ok.status_code == 202
    assert declined.json() == ok.json()
    assert declined.headers.keys() == ok.headers.keys()
    assert [e["event"] for e in logs if e["event"].startswith("auth_code")] == [
        "auth_code_not_sent"
    ]


@pytest.mark.parametrize(
    ("retry_after", "expected"), [(17.2, "18"), (0.2, "1"), (None, "60"), (0, "60")]
)
async def test_send_code_passes_workos_429_through(
    code_client: AsyncClient,
    workos: WorkOSHarness,
    retry_after: float | None,
    expected: str,
) -> None:
    workos.create_magic_auth.side_effect = RateLimitExceededError(
        "slow down", retry_after=retry_after
    )
    res = await code_client.post(SEND, json={"email": EMAIL}, headers=ORIGIN)
    assert res.status_code == 429
    assert res.headers["retry-after"] == expected
    assert res.json() == {
        "error": "rate_limited",
        "detail": "Too many requests. Try again shortly.",
        "retry_after": int(expected),
    }


@pytest.mark.parametrize(
    "error",
    [
        ServerError("boom"),
        WorkOSConnectionError("down"),
        WorkOSTimeoutError("slow"),
        WorkOSError("sdk bug"),
    ],
)
async def test_send_code_unavailable(
    code_client: AsyncClient, workos: WorkOSHarness, error: Exception
) -> None:
    workos.create_magic_auth.side_effect = error
    res = await code_client.post(SEND, json={"email": EMAIL}, headers=ORIGIN)
    assert res.status_code == 503
    assert res.json()["error"] == "auth_unavailable"
    assert "retry-after" not in res.headers


async def test_send_code_rate_limited_per_email(
    code_client: AsyncClient, workos: WorkOSHarness
) -> None:
    for _ in range(3):
        assert (await code_client.post(SEND, json={"email": EMAIL}, headers=ORIGIN)).is_success
    with capture_logs() as logs:
        res = await code_client.post(SEND, json={"email": "ADA@example.com"}, headers=ORIGIN)
    assert res.status_code == 429
    assert 1 <= int(res.headers["retry-after"]) <= 60
    assert res.json()["error"] == "rate_limited"
    assert workos.create_magic_auth.await_count == 3
    throttled = next(e for e in logs if e["event"] == "auth_code_throttled")
    assert throttled["rule"] == "code_send_email"
    assert throttled["flow"] == "send"
    # Another address is unaffected.
    other = await code_client.post(SEND, json={"email": "grace@example.com"}, headers=ORIGIN)
    assert other.status_code == 202


async def test_send_code_rate_limited_per_ip(clean_redis: str, workos: WorkOSHarness) -> None:
    async for c in limited_client(clean_redis, workos, auth_code_send_per_ip=2):
        for n in range(2):
            ok = await c.post(SEND, json={"email": f"u{n}@example.com"}, headers=ORIGIN)
            assert ok.status_code == 202
        res = await c.post(SEND, json={"email": "u9@example.com"}, headers=ORIGIN)
        assert res.status_code == 429
        assert 540 <= int(res.headers["retry-after"]) <= 600
        assert workos.create_magic_auth.await_count == 2


async def test_rate_limits_fail_open_without_redis(workos: WorkOSHarness) -> None:
    app = create_app(make_settings(redis_url="redis://127.0.0.1:1/0", redis_timeout_s=0.5))
    async for c in _running_app(app, workos):
        with capture_logs() as logs:
            for _ in range(5):
                res = await c.post(SEND, json={"email": EMAIL}, headers=ORIGIN)
                assert res.status_code == 202
    assert any(e["event"] == "rate_limit_unavailable" for e in logs)


# --- verify -------------------------------------------------------------------------


async def test_verify_code_signs_in_like_the_callback(
    code_db_client: AsyncClient, workos: WorkOSHarness, db_engine: AsyncEngine
) -> None:
    workos.authenticate_with_magic_auth.return_value = auth_response()
    with capture_logs() as logs:
        res = await code_db_client.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
    assert res.status_code == 200
    assert res.json() == {"redirect_to": FRONTEND_URL}
    assert last_kwargs(workos.authenticate_with_magic_auth) == {
        "code": CODE,
        "email": EMAIL,
        "ip_address": "127.0.0.1",
        "user_agent": "pytest-ua",
        "request_options": NO_RETRY,
    }
    cookie = next(h for h in res.headers.get_list("set-cookie") if h.startswith("wos_session="))
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
    signed_in = next(e for e in logs if e["event"] == "auth_signed_in")
    assert signed_in["method"] == "email_code"
    assert signed_in["role"] == "owner"

    async with AsyncSession(db_engine) as s:
        user = (await s.execute(select(User))).scalar_one()
        assert user.email == "ada@example.com"
        assert (await s.execute(select(Membership))).scalar_one().role == "owner"

    me = await code_db_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "ada@example.com"


async def test_verify_code_joins_the_workos_organization(
    code_db_client: AsyncClient, workos: WorkOSHarness, db_engine: AsyncEngine
) -> None:
    workos.authenticate_with_magic_auth.return_value = auth_response(
        organization_id="org_01",
        access_token=mint_access_token(org_id="org_01", role="member"),
    )
    res = await code_db_client.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
    assert res.status_code == 200
    workos.get_organization.assert_awaited_once_with("org_01")
    async with AsyncSession(db_engine) as s:
        org = (await s.execute(select(Organization))).scalar_one()
        assert org.name == "Acme Inc"
        assert (await s.execute(select(Membership))).scalar_one().role == "member"


async def test_verify_code_twice_is_idempotent(
    code_db_client: AsyncClient, workos: WorkOSHarness, db_engine: AsyncEngine
) -> None:
    workos.authenticate_with_magic_auth.return_value = auth_response()
    for _ in range(2):
        res = await code_db_client.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
        assert res.status_code == 200
    async with AsyncSession(db_engine) as s:
        assert len((await s.execute(select(User))).scalars().all()) == 1


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (wrong("invalid_one_time_code"), 400, "code_invalid"),
        (wrong("one_time_code_expired"), 400, "code_expired"),
        (wrong("one_time_code_previously_used"), 400, "code_expired"),
        (wrong("one_time_code_too_many_attempts"), 400, "too_many_attempts"),
        (wrong("organization_selection_required"), 400, "auth_failed"),
        (BadRequestError("no code attribute"), 400, "auth_failed"),
        (AuthenticationError("denied"), 400, "auth_failed"),
        (UnprocessableEntityError("bad"), 400, "auth_failed"),
        (WorkOSError("sdk bug"), 400, "auth_failed"),
        (ServerError("boom"), 503, "auth_unavailable"),
        (WorkOSConnectionError("down"), 503, "auth_unavailable"),
        (WorkOSTimeoutError("slow"), 503, "auth_unavailable"),
    ],
)
async def test_verify_code_maps_workos_errors(
    code_client: AsyncClient,
    workos: WorkOSHarness,
    error: Exception,
    status: int,
    code: str,
) -> None:
    workos.authenticate_with_magic_auth.side_effect = error
    with capture_logs() as logs:
        res = await code_client.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
    assert res.status_code == status
    body = res.json()
    assert body["error"] == code
    assert set(body) == {"error", "detail"}
    assert "set-cookie" not in res.headers
    if status == 400:
        rejected = next(e for e in logs if e["event"] == "auth_code_rejected")
        assert rejected["error"] == code


async def test_verify_code_passes_workos_429_through(
    code_client: AsyncClient, workos: WorkOSHarness
) -> None:
    workos.authenticate_with_magic_auth.side_effect = RateLimitExceededError(
        "slow down", retry_after=42
    )
    res = await code_client.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
    assert res.status_code == 429
    assert res.headers["retry-after"] == "42"
    assert res.json()["retry_after"] == 42


async def test_verify_code_org_lookup_failure_is_unavailable(
    code_client: AsyncClient, workos: WorkOSHarness
) -> None:
    workos.authenticate_with_magic_auth.return_value = auth_response(organization_id="org_01")
    workos.get_organization.side_effect = WorkOSConnectionError("down")
    res = await code_client.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
    assert res.status_code == 503


@pytest.mark.parametrize(
    "body",
    [
        {"email": EMAIL, "code": "12345"},
        {"email": EMAIL, "code": "1234567"},
        {"email": EMAIL, "code": "12a456"},
        {"email": EMAIL, "code": " 123456"},
        {"email": EMAIL, "code": 123456},
        {"email": "nope", "code": CODE},
        {"code": CODE},
    ],
)
async def test_verify_code_rejects_bad_input(
    code_client: AsyncClient, workos: WorkOSHarness, body: dict[str, Any]
) -> None:
    res = await code_client.post(VERIFY, json=body, headers=ORIGIN)
    assert res.status_code == 422
    workos.authenticate_with_magic_auth.assert_not_awaited()


async def test_verify_code_rate_limited_per_email(clean_redis: str, workos: WorkOSHarness) -> None:
    workos.authenticate_with_magic_auth.side_effect = wrong("invalid_one_time_code")
    async for c in limited_client(clean_redis, workos, auth_code_verify_per_email=2):
        for _ in range(2):
            res = await c.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
            assert res.json()["error"] == "code_invalid"
        res = await c.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
        assert res.status_code == 429
        assert 590 <= int(res.headers["retry-after"]) <= 600
        assert workos.authenticate_with_magic_auth.await_count == 2


async def test_verify_code_rate_limited_per_ip(clean_redis: str, workos: WorkOSHarness) -> None:
    workos.authenticate_with_magic_auth.side_effect = wrong("invalid_one_time_code")
    async for c in limited_client(clean_redis, workos, auth_code_verify_per_ip=1):
        await c.post(VERIFY, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
        res = await c.post(
            VERIFY, json={"email": "grace@example.com", "code": CODE}, headers=ORIGIN
        )
        assert res.status_code == 429


@pytest.mark.parametrize("path", [SEND, VERIFY])
async def test_code_routes_need_workos_configured(clean_redis: str, path: str) -> None:
    app = create_app(make_settings(workos_api_key="", redis_url=clean_redis))
    async for c in _running_app(app, None):
        res = await c.post(path, json={"email": EMAIL, "code": CODE}, headers=ORIGIN)
        assert res.status_code == 503


async def test_logs_never_contain_the_email_or_code(
    code_client: AsyncClient, workos: WorkOSHarness
) -> None:
    secret_email = "Very.Secret+tag@Example.com"
    with capture_logs() as logs:
        await code_client.post(SEND, json={"email": secret_email}, headers=ORIGIN)
        workos.create_magic_auth.side_effect = BadRequestError("x", code="invitation_invalid")
        await code_client.post(SEND, json={"email": secret_email}, headers=ORIGIN)
        for error in (wrong("invalid_one_time_code"), wrong("weird"), ServerError("x")):
            workos.authenticate_with_magic_auth.side_effect = error
            await code_client.post(
                VERIFY, json={"email": secret_email, "code": "987654"}, headers=ORIGIN
            )
        for _ in range(4):
            await code_client.post(SEND, json={"email": secret_email}, headers=ORIGIN)
    dumped = repr(logs).lower()
    assert logs
    assert "secret" not in dumped
    assert "example.com" not in dumped
    assert "987654" not in dumped
    refs = {e["email_ref"] for e in logs if "email_ref" in e}
    assert len(refs) == 1 and len(next(iter(refs))) == 32


# --- units --------------------------------------------------------------------------


def test_client_ip_without_a_client() -> None:
    assert _client_ip(Request({"type": "http", "headers": []})) is None


async def test_limit_without_ip_only_counts_the_email(clean_redis: str) -> None:
    from redis.asyncio import Redis

    redis = Redis.from_url(clean_redis)
    try:
        limiter = RateLimiter(redis, timeout_s=1)
        request = Request({"type": "http", "headers": []})
        rule = RateRule("r_email", 5, 60)
        await _limit(
            limiter,
            make_settings(),
            request,
            flow="send",
            email_ref="ref",
            per_email=rule,
            per_ip=RateRule("r_ip", 5, 60),
        )
        assert await redis.keys("corral:rl:*") == [b"corral:rl:r_email:ref"]
    finally:
        await redis.aclose()


async def test_send_magic_code_times_out(workos: WorkOSHarness) -> None:
    async def hang(**_: Any) -> None:
        await asyncio.sleep(1)

    workos.create_magic_auth.side_effect = hang
    manager = SessionManager(workos.client, cookie_password=COOKIE_PASSWORD, timeout_s=0.01)
    with pytest.raises(AuthProviderUnavailable, match="create_magic_auth_timeout"):
        await manager.send_magic_code(EMAIL)


async def test_magic_code_not_sent_carries_the_workos_code(workos: WorkOSHarness) -> None:
    manager = SessionManager(workos.client, cookie_password=COOKIE_PASSWORD, timeout_s=1)
    workos.create_magic_auth.side_effect = BadRequestError("x", code="invitation_invalid")
    with pytest.raises(MagicCodeNotSent) as exc:
        await manager.send_magic_code(EMAIL)
    assert exc.value.reason == "invitation_invalid"
    workos.create_magic_auth.side_effect = UnprocessableEntityError("x")
    with pytest.raises(MagicCodeNotSent) as exc:
        await manager.send_magic_code(EMAIL)
    assert exc.value.reason == "UnprocessableEntityError"
