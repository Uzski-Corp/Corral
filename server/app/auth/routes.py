"""AuthKit endpoints: login, callback, refresh, logout, me.

Login CSRF is prevented with a random ``state`` bound to a short-lived HttpOnly cookie
and compared in constant time on callback.
"""

import secrets
from typing import Annotated, Literal
from urllib.parse import urlencode

import structlog
from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import RedirectResponse

from app.auth.deps import (
    AuthContextDep,
    DbDep,
    SessionManagerDep,
    SettingsDep,
    clear_session_cookie,
    set_session_cookie,
)
from app.auth.provisioning import provision_identity
from app.auth.schemas import (
    LogoutResponse,
    MeResponse,
    OrganizationOut,
    RefreshResponse,
    UserOut,
)
from app.auth.session import AuthProviderUnavailable, SessionInvalid
from app.core.config import Settings
from app.core.errors import Unauthenticated

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
    }
)


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

    identity = await provision_identity(db, exchange.profile)
    log.info(
        "auth_signed_in",
        user_id=str(identity.user_id),
        org_id=str(identity.org_id),
        role=identity.role,
    )
    response = RedirectResponse(settings.frontend_url, status_code=303)
    set_session_cookie(response, settings, exchange.sealed_session)
    response.delete_cookie(STATE_COOKIE, path="/api/v1/auth")
    return response


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
