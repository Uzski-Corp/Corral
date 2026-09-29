"""AuthKit session handling on top of the WorkOS SDK.

``SessionManager`` wraps the sealed-cookie primitives with explicit timeouts and turns
the SDK's union return types / exceptions into two typed failures:

* :class:`SessionInvalid` - the caller must sign in again (maps to 401).
* :class:`AuthProviderUnavailable` - WorkOS could not be reached (maps to 503).

Expired access tokens are refreshed transparently with the stored refresh token.
"""

import asyncio
from collections.abc import Awaitable, Mapping
from dataclasses import dataclass
from typing import Any, TypeVar

import structlog
from jwt.exceptions import PyJWKClientError
from workos import AsyncWorkOSClient
from workos._errors import (
    APIError,
    RateLimitExceededError,
    ServerError,
    WorkOSConnectionError,
    WorkOSError,
    WorkOSTimeoutError,
)
from workos.session import (
    AuthenticateWithSessionCookieFailureReason as FailureReason,
)
from workos.session import (
    AuthenticateWithSessionCookieSuccessResponse,
    RefreshWithSessionCookieSuccessResponse,
    seal_session_from_auth_response,
)

from app.auth.provisioning import WorkOSProfile

log = structlog.get_logger(__name__)

T = TypeVar("T")

_UNAVAILABLE_ERRORS = (
    WorkOSConnectionError,
    WorkOSTimeoutError,
    ServerError,
    RateLimitExceededError,
)


class SessionError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class SessionInvalid(SessionError):
    """The session (or authorization code) is not valid; the user must sign in."""


class AuthProviderUnavailable(SessionError):
    """WorkOS could not be reached or timed out; retrying later may succeed."""


@dataclass(frozen=True, slots=True)
class SessionClaims:
    session_id: str
    workos_user_id: str
    workos_organization_id: str | None
    role: str | None
    user: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class ResolvedSession:
    claims: SessionClaims
    # A new sealed cookie when the session was refreshed during resolution.
    refreshed_cookie: str | None = None


@dataclass(frozen=True, slots=True)
class CodeExchange:
    sealed_session: str
    profile: WorkOSProfile
    claims: SessionClaims


def _reason(value: FailureReason | str) -> str:
    return value.value if isinstance(value, FailureReason) else str(value)


def _claims(
    result: AuthenticateWithSessionCookieSuccessResponse | RefreshWithSessionCookieSuccessResponse,
) -> SessionClaims:
    user = result.user or {}
    workos_user_id = user.get("id")
    if not isinstance(workos_user_id, str) or not workos_user_id:
        raise SessionInvalid("session_missing_user")
    return SessionClaims(
        session_id=result.session_id,
        workos_user_id=workos_user_id,
        workos_organization_id=result.organization_id,
        role=result.role,
        user=user,
    )


class SessionManager:
    def __init__(
        self, client: AsyncWorkOSClient, *, cookie_password: str, timeout_s: float
    ) -> None:
        if not cookie_password:
            raise ValueError("cookie_password is required")
        self._client = client
        self._cookie_password = cookie_password
        self._timeout_s = timeout_s

    async def _bounded(self, awaitable: Awaitable[T], *, op: str) -> T:
        try:
            return await asyncio.wait_for(awaitable, timeout=self._timeout_s)
        except TimeoutError as exc:
            log.warning("workos_timeout", op=op, timeout_s=self._timeout_s)
            raise AuthProviderUnavailable(f"{op}_timeout") from exc

    def authorization_url(self, *, redirect_uri: str, state: str, screen_hint: str | None) -> str:
        return self._client.user_management.get_authorization_url(
            provider="authkit", redirect_uri=redirect_uri, state=state, screen_hint=screen_hint
        )

    def logout_url(self, *, session_id: str, return_to: str) -> str:
        return self._client.user_management.get_logout_url(
            session_id=session_id, return_to=return_to
        )

    async def resolve(self, sealed: str) -> ResolvedSession:
        """Validate a sealed session cookie, refreshing it if the access token expired."""
        session = self._client.user_management.load_sealed_session(
            session_data=sealed, cookie_password=self._cookie_password
        )
        try:
            # authenticate() is synchronous and may fetch JWKS over the network on a
            # cold cache, so keep it off the event loop.
            result = await self._bounded(asyncio.to_thread(session.authenticate), op="authenticate")
        except PyJWKClientError as exc:
            log.warning("workos_jwks_unavailable", error=str(exc))
            raise AuthProviderUnavailable("jwks_unavailable") from exc

        if isinstance(result, AuthenticateWithSessionCookieSuccessResponse):
            return ResolvedSession(claims=_claims(result))
        if result.reason == FailureReason.INVALID_JWT:
            # Most commonly an expired access token: try the refresh token.
            return await self.refresh(sealed)
        raise SessionInvalid(_reason(result.reason))

    async def refresh(self, sealed: str, *, organization_id: str | None = None) -> ResolvedSession:
        session = self._client.user_management.load_sealed_session(
            session_data=sealed, cookie_password=self._cookie_password
        )
        result = await self._bounded(session.refresh(organization_id=organization_id), op="refresh")
        if isinstance(result, RefreshWithSessionCookieSuccessResponse):
            log.info("session_refreshed", session_id=result.session_id)
            return ResolvedSession(claims=_claims(result), refreshed_cookie=result.sealed_session)
        reason = _reason(result.reason)
        if result.reason == FailureReason.REFRESH_NETWORK_ERROR:
            raise AuthProviderUnavailable(reason)
        raise SessionInvalid(reason)

    async def exchange_code(
        self, code: str, *, ip_address: str | None = None, user_agent: str | None = None
    ) -> CodeExchange:
        """Exchange an AuthKit authorization code for a sealed session + profile."""
        um = self._client.user_management
        try:
            auth = await self._bounded(
                um.authenticate_with_code(code=code, ip_address=ip_address, user_agent=user_agent),
                op="authenticate_with_code",
            )
            org_name: str | None = None
            if auth.organization_id:
                org = await self._bounded(
                    self._client.organizations.get_organization(auth.organization_id),
                    op="get_organization",
                )
                org_name = org.name
        except _UNAVAILABLE_ERRORS as exc:
            log.warning("workos_unavailable", error_type=type(exc).__name__)
            raise AuthProviderUnavailable("code_exchange_unavailable") from exc
        except (APIError, WorkOSError) as exc:
            log.info("workos_code_rejected", error_type=type(exc).__name__)
            raise SessionInvalid("code_exchange_failed") from exc

        sealed = seal_session_from_auth_response(
            access_token=auth.access_token,
            refresh_token=auth.refresh_token,
            user=auth.user.to_dict(),
            impersonator=auth.impersonator.to_dict() if auth.impersonator else None,
            cookie_password=self._cookie_password,
        )
        # Validate the freshly issued access token (signature + claims) before trusting
        # the role and organization it carries.
        resolved = await self.resolve(sealed)
        claims = resolved.claims
        if resolved.refreshed_cookie:
            sealed = resolved.refreshed_cookie
        user = auth.user
        profile = WorkOSProfile(
            workos_user_id=user.id,
            email=user.email,
            email_verified=user.email_verified,
            first_name=user.first_name,
            last_name=user.last_name,
            profile_picture_url=user.profile_picture_url,
            workos_organization_id=claims.workos_organization_id,
            organization_name=org_name,
            role=claims.role,
        )
        return CodeExchange(sealed_session=sealed, profile=profile, claims=claims)
