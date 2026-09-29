"""AuthKit endpoints: login, callback, refresh, logout, me, and email-code sign-in.

Login CSRF is prevented with a random ``state`` bound to a short-lived HttpOnly cookie
and compared in constant time on callback. The email-code routes are JSON POSTs called
by the frontend with ``fetch``; they require an allow-listed ``Origin`` instead.
"""

import secrets
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

import structlog
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse

from app.auth.deps import (
    AuthContextDep,
    DbDep,
    RateLimiterDep,
    SessionManagerDep,
    SettingsDep,
    clear_session_cookie,
    require_trusted_origin,
    set_session_cookie,
)
from app.auth.provisioning import provision_identity
from app.auth.ratelimit import RateLimited, RateRule, derive_secret, subject_key
from app.auth.schemas import (
    CodeSentResponse,
    LogoutResponse,
    MeResponse,
    OrganizationOut,
    RefreshResponse,
    SendCodeRequest,
    SignedInResponse,
    UserOut,
    VerifyCodeRequest,
)
from app.auth.session import (
    AuthProviderUnavailable,
    CodeExchange,
    MagicCodeExpired,
    MagicCodeInvalid,
    MagicCodeNotSent,
    MagicCodeTooManyAttempts,
    ProviderRateLimited,
    SessionInvalid,
)
from app.core.config import Settings
from app.core.errors import ApiProblem, Unauthenticated

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE = "wos_auth_state"
STATE_MAX_AGE_S = 600
# Routes reachable without a session. Everything else under /api/v1 requires auth.
PUBLIC_PATHS = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/callback",
        "/api/v1/auth/logout",
        "/api/v1/auth/refresh",
        "/api/v1/auth/code/send",
        "/api/v1/auth/code/verify",
    }
)
_CODE_ROUTE_ERRORS: dict[int | str, dict[str, Any]] = {
    429: {"description": "Rate limited; see the Retry-After header"},
    403: {"description": "Origin not allowed"},
    503: {"description": "Authentication provider unavailable"},
}


def _frontend_error(settings: Settings, code: str) -> RedirectResponse:
    target = f"{settings.frontend_url.rstrip('/')}/sign-in?{urlencode({'error': code})}"
    response = RedirectResponse(target, status_code=303)
    response.delete_cookie(STATE_COOKIE, path="/api/v1/auth")
    return response


@router.get("/login")
async def login(
    settings: SettingsDep,
    manager: SessionManagerDep,
    screen_hint: Annotated[Literal["sign-in", "sign-up"] | None, Query()] = None,
) -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    url = manager.authorization_url(
        redirect_uri=settings.workos_redirect_uri, state=state, screen_hint=screen_hint
    )
    response = RedirectResponse(url, status_code=303)
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=STATE_MAX_AGE_S,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/v1/auth",
    )
    return response


@router.get("/callback")
async def callback(
    request: Request,
    settings: SettingsDep,
    manager: SessionManagerDep,
    db: DbDep,
    code: Annotated[str | None, Query(max_length=512)] = None,
    state: Annotated[str | None, Query(max_length=512)] = None,
    error: Annotated[str | None, Query(max_length=128)] = None,
) -> RedirectResponse:
    if error:
        log.info("auth_callback_provider_error", error=error)
        return _frontend_error(settings, "provider_error")
    expected_state = request.cookies.get(STATE_COOKIE)
    if not code or not state or not expected_state:
        return _frontend_error(settings, "invalid_request")
    if not secrets.compare_digest(state, expected_state):
        log.warning("auth_callback_state_mismatch")
        return _frontend_error(settings, "invalid_state")

    try:
        exchange = await manager.exchange_code(
            code,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except SessionInvalid:
        return _frontend_error(settings, "auth_failed")
    except AuthProviderUnavailable:
        return _frontend_error(settings, "auth_unavailable")

    response = RedirectResponse(settings.frontend_url, status_code=303)
    await _complete_sign_in(db, settings, response, exchange, method="authkit")
    response.delete_cookie(STATE_COOKIE, path="/api/v1/auth")
    return response


async def _complete_sign_in(
    db: DbDep, settings: Settings, response: Response, exchange: CodeExchange, *, method: str
) -> None:
    """Upsert the local user/org/membership and set the sealed session cookie."""
    identity = await provision_identity(db, exchange.profile)
    log.info(
        "auth_signed_in",
        user_id=str(identity.user_id),
        org_id=str(identity.org_id),
        role=identity.role,
        method=method,
    )
    set_session_cookie(response, settings, exchange.sealed_session)


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _rate_limited(retry_after_s: int) -> ApiProblem:
    return ApiProblem(
        429,
        "rate_limited",
        "Too many requests. Try again shortly.",
        retry_after_s=retry_after_s,
    )


def _unavailable() -> ApiProblem:
    return ApiProblem(503, "auth_unavailable", "Sign-in is temporarily unavailable.")


async def _limit(
    limiter: RateLimiterDep,
    settings: Settings,
    request: Request,
    *,
    flow: str,
    email_ref: str,
    per_email: RateRule,
    per_ip: RateRule,
) -> None:
    ip = _client_ip(request)
    checks = [(per_email, email_ref)]
    if ip:
        checks.append((per_ip, subject_key(derive_secret(_secret(settings)), ip)))
    try:
        await limiter.hit(checks)
    except RateLimited as exc:
        log.info("auth_code_throttled", flow=flow, email_ref=email_ref, rule=exc.rule)
        raise _rate_limited(exc.retry_after_s) from exc


def _secret(settings: Settings) -> str:
    return settings.workos_cookie_password.get_secret_value()


def _email_ref(settings: Settings, email: str) -> str:
    return subject_key(derive_secret(_secret(settings)), email.strip().lower())


@router.post(
    "/code/send",
    status_code=202,
    dependencies=[Depends(require_trusted_origin)],
    responses=_CODE_ROUTE_ERRORS,
)
async def send_code(
    body: SendCodeRequest,
    request: Request,
    settings: SettingsDep,
    manager: SessionManagerDep,
    limiter: RateLimiterDep,
) -> CodeSentResponse:
    """Email a six-digit sign-in code.

    Enumeration-safe: the answer is the same whether or not the address has an account
    (WorkOS creates the user on first use) and even when WorkOS declines to send.
    """
    email_ref = _email_ref(settings, body.email)
    await _limit(
        limiter,
        settings,
        request,
        flow="send",
        email_ref=email_ref,
        per_email=RateRule(
            "code_send_email", settings.auth_code_send_per_email, settings.auth_code_send_window_s
        ),
        per_ip=RateRule(
            "code_send_ip", settings.auth_code_send_per_ip, settings.auth_code_ip_window_s
        ),
    )
    try:
        await manager.send_magic_code(
            body.email.strip(),
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except ProviderRateLimited as exc:
        log.info("auth_code_provider_throttled", flow="send", email_ref=email_ref)
        raise _rate_limited(exc.retry_after_s) from exc
    except AuthProviderUnavailable as exc:
        raise _unavailable() from exc
    except MagicCodeNotSent as exc:
        log.info("auth_code_not_sent", email_ref=email_ref, reason=exc.reason)
        return CodeSentResponse()
    log.info("auth_code_sent", email_ref=email_ref)
    return CodeSentResponse()


@router.post(
    "/code/verify",
    dependencies=[Depends(require_trusted_origin)],
    responses={
        **_CODE_ROUTE_ERRORS,
        400: {"description": "code_invalid | code_expired | too_many_attempts | auth_failed"},
    },
)
async def verify_code(
    body: VerifyCodeRequest,
    request: Request,
    response: Response,
    settings: SettingsDep,
    manager: SessionManagerDep,
    limiter: RateLimiterDep,
    db: DbDep,
) -> SignedInResponse:
    """Exchange an emailed code for a session; same provisioning and cookie as the callback."""
    email_ref = _email_ref(settings, body.email)
    await _limit(
        limiter,
        settings,
        request,
        flow="verify",
        email_ref=email_ref,
        per_email=RateRule(
            "code_verify_email",
            settings.auth_code_verify_per_email,
            settings.auth_code_verify_window_s,
        ),
        per_ip=RateRule(
            "code_verify_ip", settings.auth_code_verify_per_ip, settings.auth_code_ip_window_s
        ),
    )
    try:
        exchange = await manager.verify_magic_code(
            body.email.strip(),
            body.code,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except ProviderRateLimited as exc:
        log.info("auth_code_provider_throttled", flow="verify", email_ref=email_ref)
        raise _rate_limited(exc.retry_after_s) from exc
    except AuthProviderUnavailable as exc:
        raise _unavailable() from exc
    except MagicCodeInvalid as exc:
        log.info("auth_code_rejected", email_ref=email_ref, error="code_invalid")
        raise ApiProblem(400, "code_invalid", "That code isn't right.") from exc
    except MagicCodeExpired as exc:
        log.info("auth_code_rejected", email_ref=email_ref, error="code_expired")
        raise ApiProblem(400, "code_expired", "That code has expired.") from exc
    except MagicCodeTooManyAttempts as exc:
        log.info("auth_code_rejected", email_ref=email_ref, error="too_many_attempts")
        raise ApiProblem(400, "too_many_attempts", "Too many attempts for this code.") from exc
    except SessionInvalid as exc:
        log.info("auth_code_rejected", email_ref=email_ref, error="auth_failed")
        raise ApiProblem(400, "auth_failed", "That sign-in didn't finish.") from exc
    await _complete_sign_in(db, settings, response, exchange, method="email_code")
    return SignedInResponse(redirect_to=settings.frontend_url)


@router.post("/refresh")
async def refresh(
    request: Request, response: Response, settings: SettingsDep, manager: SessionManagerDep
) -> RefreshResponse:
    sealed = request.cookies.get(settings.session_cookie_name)
    if not sealed:
        raise Unauthenticated("Not signed in")
    try:
        resolved = await manager.refresh(sealed)
    except SessionInvalid as exc:
        raise Unauthenticated("Session invalid or expired", clear_cookie=True) from exc
    except AuthProviderUnavailable:
        response.status_code = 503
        return RefreshResponse(refreshed=False)
    assert resolved.refreshed_cookie is not None  # noqa: S101 - refresh always reseals
    set_session_cookie(response, settings, resolved.refreshed_cookie)
    return RefreshResponse(refreshed=True)


@router.post("/logout")
async def logout(
    request: Request, response: Response, settings: SettingsDep, manager: SessionManagerDep
) -> LogoutResponse:
    """Clear the local cookie and return the WorkOS URL that ends the hosted session."""
    clear_session_cookie(response, settings)
    sealed = request.cookies.get(settings.session_cookie_name)
    if not sealed:
        return LogoutResponse(logout_url=settings.frontend_url)
    try:
        resolved = await manager.resolve(sealed)
    except (SessionInvalid, AuthProviderUnavailable) as exc:
        log.info("logout_without_valid_session", reason=exc.reason)
        return LogoutResponse(logout_url=settings.frontend_url)
    url = manager.logout_url(session_id=resolved.claims.session_id, return_to=settings.frontend_url)
    return LogoutResponse(logout_url=url)


@router.get("/me")
async def me(ctx: AuthContextDep) -> MeResponse:
    return MeResponse(
        user=UserOut.model_validate(ctx.user),
        organization=OrganizationOut.model_validate(ctx.org),
        role=ctx.role,
    )
