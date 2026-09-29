"""FastAPI dependencies for authentication and tenant resolution.

``require_auth`` (an alias of :func:`get_auth_context`) is attached to every non-public
router. Handlers that need the caller use ``current_user`` / ``current_org``.
"""

from dataclasses import dataclass
from typing import Annotated
from urllib.parse import urlsplit

import structlog
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.ratelimit import RateLimiter
from app.auth.session import (
    AuthProviderUnavailable,
    ResolvedSession,
    SessionInvalid,
    SessionManager,
)
from app.core.config import Settings
from app.core.errors import Unauthenticated
from app.db.session import get_db
from app.db.tenancy import apply_tenant_context, resolve_membership
from app.models.identity import Organization, User

log = structlog.get_logger(__name__)


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_session_manager(request: Request) -> SessionManager:
    manager: SessionManager | None = getattr(request.app.state, "session_manager", None)
    if manager is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured")
    return manager


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
SessionManagerDep = Annotated[SessionManager, Depends(get_session_manager)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


def get_rate_limiter(request: Request, settings: SettingsDep) -> RateLimiter:
    return RateLimiter(request.app.state.queue.redis, timeout_s=settings.redis_timeout_s)


RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}".lower()


def require_trusted_origin(request: Request, settings: SettingsDep) -> None:
    """CSRF guard for state-changing JSON POSTs called with ``fetch``.

    Browsers always send ``Origin`` on cross-origin (and same-origin) POSTs, so a
    missing or unknown origin is refused. Allowed: the frontend and ``CORS_ORIGINS``.
    """
    origin = request.headers.get("origin")
    allowed = {_origin(settings.frontend_url), *(_origin(o) for o in settings.cors_origins)}
    if origin is None or _origin(origin) not in allowed:
        log.warning("auth_origin_rejected", path=request.url.path, has_origin=origin is not None)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Origin not allowed")


def set_session_cookie(response: Response, settings: Settings, sealed: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        sealed,
        max_age=settings.session_cookie_max_age_s,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        domain=settings.session_cookie_domain,
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie_name, path="/", domain=settings.session_cookie_domain
    )


async def get_resolved_session(
    request: Request, response: Response, settings: SettingsDep, manager: SessionManagerDep
) -> ResolvedSession:
    """Validate the session cookie; a refreshed cookie is written back on the response."""
    sealed = request.cookies.get(settings.session_cookie_name)
    if not sealed:
        raise Unauthenticated("Not signed in")
    try:
        resolved = await manager.resolve(sealed)
    except SessionInvalid as exc:
        log.info("session_rejected", reason=exc.reason)
        raise Unauthenticated("Session invalid or expired", clear_cookie=True) from exc
    except AuthProviderUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication provider unavailable"
        ) from exc
    if resolved.refreshed_cookie:
        set_session_cookie(response, settings, resolved.refreshed_cookie)
    return resolved


ResolvedSessionDep = Annotated[ResolvedSession, Depends(get_resolved_session)]


@dataclass(frozen=True, slots=True)
class AuthContext:
    user: User
    org: Organization
    role: str
    session_id: str


async def load_auth_context(db: AsyncSession, resolved: ResolvedSession) -> AuthContext | None:
    """Map WorkOS session claims to local rows and pin the transaction to that tenant.

    ``None`` means the caller has no local membership for the org in their session.
    """
    claims = resolved.claims
    membership = await resolve_membership(
        db,
        workos_user_id=claims.workos_user_id,
        workos_organization_id=claims.workos_organization_id,
    )
    if membership is None:
        return None
    await apply_tenant_context(db, org_id=membership.org_id, user_id=membership.user_id)
    # Both reads now pass through row-level security for the pinned tenant.
    user = await db.get(User, membership.user_id)
    org = await db.get(Organization, membership.org_id)
    if user is None or org is None:  # pragma: no cover - guarded by FK + RLS invariants
        return None
    return AuthContext(user=user, org=org, role=membership.role, session_id=claims.session_id)


async def get_auth_context(resolved: ResolvedSessionDep, db: DbDep) -> AuthContext:
    ctx = await load_auth_context(db, resolved)
    if ctx is None:
        log.info("auth_no_membership", workos_user_id=resolved.claims.workos_user_id)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this workspace")
    structlog.contextvars.bind_contextvars(user_id=str(ctx.user.id), org_id=str(ctx.org.id))
    return ctx


require_auth = get_auth_context
AuthContextDep = Annotated[AuthContext, Depends(get_auth_context)]


def current_user(ctx: AuthContextDep) -> User:
    return ctx.user


def current_org(ctx: AuthContextDep) -> Organization:
    return ctx.org


CurrentUser = Annotated[User, Depends(current_user)]
CurrentOrg = Annotated[Organization, Depends(current_org)]
