"""FastAPI dependencies for authentication and tenant resolution.

``require_auth`` (an alias of :func:`get_auth_context`) is attached to every non-public
router. Handlers that need the caller use ``current_user`` / ``current_org``.
"""

from dataclasses import dataclass
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.session import (
    AuthProviderUnavailable,
    ResolvedSession,
    SessionInvalid,
    SessionManager,
)
from app.core.config import Settings
from app.core.errors import Unauthenticated
from app.db.session import get_db
from app.models.identity import Membership, Organization, User

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
    """Map WorkOS session claims to local rows. ``None`` means no local access."""
    claims = resolved.claims
    user = (
        await db.execute(select(User).where(User.workos_user_id == claims.workos_user_id))
    ).scalar_one_or_none()
    if user is None:
        return None
    if claims.workos_organization_id:
        org_filter = Organization.workos_organization_id == claims.workos_organization_id
    else:
        org_filter = Organization.personal_owner_user_id == user.id
    row = (
        await db.execute(
            select(Organization, Membership.role)
            .join(Membership, Membership.org_id == Organization.id)
            .where(org_filter, Membership.user_id == user.id)
        )
    ).one_or_none()
    if row is None:
        return None
    org, role = row
    return AuthContext(user=user, org=org, role=role, session_id=claims.session_id)


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
