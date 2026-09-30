"""Test doubles for WorkOS.

We use the *real* ``AsyncWorkOSClient`` and sealed-session code from the SDK and replace
only the network edges: the JWKS fetch, the refresh-token HTTP call, the code exchange and
the organization lookup,
and the Magic Auth (email code) calls. Access tokens are genuine RS256 JWTs signed with a test key.
"""

import time
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.exceptions import PyJWKClientError
from workos import AsyncWorkOSClient
from workos.organizations.models import Organization as WorkOSOrganization
from workos.session import seal_session_from_auth_response
from workos.user_management.models import AuthenticateResponse

_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TIMESTAMP = "2026-01-01T00:00:00.000Z"


def last_kwargs(mock: AsyncMock) -> dict[str, Any]:
    assert mock.await_args is not None, f"{mock} was never awaited"
    return dict(mock.await_args.kwargs)


class FakeJWKS:
    def __init__(self) -> None:
        self.fail = False

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        if self.fail:
            raise PyJWKClientError("jwks endpoint unreachable")
        return SimpleNamespace(key=_PRIVATE_KEY.public_key())


def mint_access_token(
    *,
    sid: str = "session_01",
    org_id: str | None = None,
    role: str | None = None,
    expires_in: int = 300,
    wrong_key: bool = False,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {"sid": sid, "sub": "user_01", "iat": now, "exp": now + expires_in}
    if org_id is not None:
        claims["org_id"] = org_id
    if role is not None:
        claims["role"] = role
    key = _OTHER_KEY if wrong_key else _PRIVATE_KEY
    return jwt.encode(claims, key, algorithm="RS256")


def user_payload(
    workos_user_id: str = "user_01", email: str = "Ada@Example.com", **extra: Any
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "object": "user",
        "id": workos_user_id,
        "first_name": "Ada",
        "last_name": "Lovelace",
        "profile_picture_url": None,
        "email": email,
        "email_verified": True,
        "external_id": None,
        "last_sign_in_at": None,
        "created_at": TIMESTAMP,
        "updated_at": TIMESTAMP,
    }
    payload.update(extra)
    return payload


def auth_response(
    *,
    user: dict[str, Any] | None = None,
    access_token: str | None = None,
    organization_id: str | None = None,
    refresh_token: str = "refresh_01",
    impersonator: dict[str, Any] | None = None,
) -> AuthenticateResponse:
    data: dict[str, Any] = {
        "user": user or user_payload(),
        "access_token": access_token or mint_access_token(org_id=organization_id),
        "refresh_token": refresh_token,
        "organization_id": organization_id,
    }
    if impersonator is not None:
        data["impersonator"] = impersonator
    return AuthenticateResponse.from_dict(data)


def workos_organization(org_id: str = "org_01", name: str = "Acme Inc") -> WorkOSOrganization:
    return WorkOSOrganization.from_dict(
        {
            "object": "organization",
            "id": org_id,
            "name": name,
            "domains": [],
            "metadata": {},
            "external_id": None,
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
        }
    )


@dataclass
class WorkOSHarness:
    client: AsyncWorkOSClient
    cookie_password: str
    jwks: FakeJWKS
    request_raw: AsyncMock
    authenticate_with_code: AsyncMock
    get_organization: AsyncMock
    create_magic_auth: AsyncMock
    authenticate_with_magic_auth: AsyncMock
    sealed: list[str] = field(default_factory=list)

    def seal(
        self,
        *,
        access_token: str | None = None,
        user: dict[str, Any] | None = None,
        refresh_token: str = "refresh_01",
        org_id: str | None = None,
        role: str | None = None,
    ) -> str:
        return seal_session_from_auth_response(
            access_token=access_token or mint_access_token(org_id=org_id, role=role),
            refresh_token=refresh_token,
            user=user if user is not None else user_payload(),
            cookie_password=self.cookie_password,
        )

    def refresh_succeeds(
        self, *, org_id: str | None = None, role: str | None = None, sid: str = "session_02"
    ) -> None:
        self.request_raw.return_value = {
            "access_token": mint_access_token(org_id=org_id, role=role, sid=sid),
            "refresh_token": "refresh_02",
            "user": user_payload(),
        }


def build_harness(monkeypatch: pytest.MonkeyPatch, cookie_password: str) -> WorkOSHarness:
    jwks = FakeJWKS()
    monkeypatch.setattr("workos.session._get_jwks_client", lambda url: jwks)
    client = AsyncWorkOSClient(api_key="sk_test_dummy", client_id="client_test", max_retries=0)
    request_raw = AsyncMock(name="request_raw")
    monkeypatch.setattr(client, "request_raw", request_raw)
    authenticate_with_code = AsyncMock(name="authenticate_with_code")
    monkeypatch.setattr(client.user_management, "authenticate_with_code", authenticate_with_code)
    get_organization = AsyncMock(name="get_organization", return_value=workos_organization())
    monkeypatch.setattr(client.organizations, "get_organization", get_organization)
    # The response (which carries the code itself) is discarded by the app.
    create_magic_auth = AsyncMock(name="create_magic_auth", return_value=SimpleNamespace(id="ma_1"))
    monkeypatch.setattr(client.user_management, "create_magic_auth", create_magic_auth)
    authenticate_with_magic_auth = AsyncMock(name="authenticate_with_magic_auth")
    monkeypatch.setattr(
        client.user_management, "authenticate_with_magic_auth", authenticate_with_magic_auth
    )
    return WorkOSHarness(
        client=client,
        cookie_password=cookie_password,
        jwks=jwks,
        request_raw=request_raw,
        authenticate_with_code=authenticate_with_code,
        get_organization=get_organization,
        create_magic_auth=create_magic_auth,
        authenticate_with_magic_auth=authenticate_with_magic_auth,
    )
