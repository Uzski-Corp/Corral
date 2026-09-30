import asyncio
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from workos._errors import AuthenticationError, BadRequestError, WorkOSConnectionError

from app.auth.session import (
    AuthProviderUnavailable,
    SessionInvalid,
    SessionManager,
)
from tests.conftest import COOKIE_PASSWORD
from tests.workos_fakes import (
    WorkOSHarness,
    auth_response,
    last_kwargs,
    mint_access_token,
    user_payload,
)


def manager(h: WorkOSHarness, timeout_s: float = 2) -> SessionManager:
    return SessionManager(h.client, cookie_password=COOKIE_PASSWORD, timeout_s=timeout_s)


def test_requires_cookie_password(workos: WorkOSHarness) -> None:
    with pytest.raises(ValueError, match="cookie_password"):
        SessionManager(workos.client, cookie_password="", timeout_s=1)


async def test_resolve_valid_session(workos: WorkOSHarness) -> None:
    sealed = workos.seal(org_id="org_01", role="admin")
    resolved = await manager(workos).resolve(sealed)
    assert resolved.refreshed_cookie is None
    assert resolved.claims.session_id == "session_01"
    assert resolved.claims.workos_user_id == "user_01"
    assert resolved.claims.workos_organization_id == "org_01"
    assert resolved.claims.role == "admin"
    workos.request_raw.assert_not_awaited()


async def test_resolve_refreshes_expired_access_token(workos: WorkOSHarness) -> None:
    workos.refresh_succeeds(org_id="org_01", role="member")
    sealed = workos.seal(access_token=mint_access_token(expires_in=-60))
    m = manager(workos)
    resolved = await m.resolve(sealed)
    assert resolved.refreshed_cookie is not None
    assert resolved.refreshed_cookie != sealed
    assert resolved.claims.session_id == "session_02"
    assert resolved.claims.role == "member"
    body = last_kwargs(workos.request_raw)["body"]
    assert body["grant_type"] == "refresh_token"
    assert body["refresh_token"] == "refresh_01"
    # The refreshed cookie is itself a valid session.
    again = await m.resolve(resolved.refreshed_cookie)
    assert again.refreshed_cookie is None


async def test_bad_signature_triggers_refresh_and_fails_when_denied(
    workos: WorkOSHarness,
) -> None:
    workos.request_raw.return_value = {}
    sealed = workos.seal(access_token=mint_access_token(wrong_key=True))
    with pytest.raises(SessionInvalid) as err:
        await manager(workos).resolve(sealed)
    assert err.value.reason == "refresh_denied"


async def test_refresh_network_error_is_unavailable(workos: WorkOSHarness) -> None:
    workos.request_raw.side_effect = WorkOSConnectionError("down")
    sealed = workos.seal(access_token=mint_access_token(expires_in=-60))
    with pytest.raises(AuthProviderUnavailable):
        await manager(workos).resolve(sealed)


async def test_refresh_rejected_by_workos_is_invalid(workos: WorkOSHarness) -> None:
    workos.request_raw.side_effect = AuthenticationError("revoked")
    sealed = workos.seal(access_token=mint_access_token(expires_in=-60))
    with pytest.raises(SessionInvalid):
        await manager(workos).resolve(sealed)


async def test_refresh_times_out(workos: WorkOSHarness) -> None:
    async def slow(*args: Any, **kwargs: Any) -> dict[str, Any]:
        await asyncio.sleep(5)
        return {}

    workos.request_raw.side_effect = slow
    sealed = workos.seal(access_token=mint_access_token(expires_in=-60))
    with pytest.raises(AuthProviderUnavailable) as err:
        await manager(workos, timeout_s=0.05).resolve(sealed)
    assert err.value.reason == "refresh_timeout"


async def test_garbage_cookie_is_invalid(workos: WorkOSHarness) -> None:
    with pytest.raises(SessionInvalid) as err:
        await manager(workos).resolve("not-a-sealed-session")
    assert err.value.reason == "invalid_session_cookie"


async def test_jwks_outage_is_unavailable(workos: WorkOSHarness) -> None:
    workos.jwks.fail = True
    with pytest.raises(AuthProviderUnavailable) as err:
        await manager(workos).resolve(workos.seal())
    assert err.value.reason == "jwks_unavailable"


async def test_session_without_user_id_is_invalid(workos: WorkOSHarness) -> None:
    sealed = workos.seal(user={"email": "x@example.com"})
    with pytest.raises(SessionInvalid) as err:
        await manager(workos).resolve(sealed)
    assert err.value.reason == "session_missing_user"


async def test_explicit_refresh_can_switch_org(workos: WorkOSHarness) -> None:
    workos.refresh_succeeds(org_id="org_02")
    resolved = await manager(workos).refresh(workos.seal(), organization_id="org_02")
    assert resolved.claims.workos_organization_id == "org_02"
    assert last_kwargs(workos.request_raw)["body"]["organization_id"] == "org_02"


async def test_exchange_code_with_organization(workos: WorkOSHarness) -> None:
    workos.authenticate_with_code.return_value = auth_response(
        organization_id="org_01",
        access_token=mint_access_token(org_id="org_01", role="admin"),
    )
    exchange = await manager(workos).exchange_code("code_1", ip_address="1.2.3.4", user_agent="t")
    kwargs = last_kwargs(workos.authenticate_with_code)
    assert kwargs == {"code": "code_1", "ip_address": "1.2.3.4", "user_agent": "t"}
    workos.get_organization.assert_awaited_once_with("org_01")
    p = exchange.profile
    assert (p.workos_user_id, p.email, p.first_name) == ("user_01", "Ada@Example.com", "Ada")
    assert (p.workos_organization_id, p.organization_name, p.role) == (
        "org_01",
        "Acme Inc",
        "admin",
    )
    assert exchange.claims.session_id == "session_01"
    # The sealed session round-trips.
    resolved = await manager(workos).resolve(exchange.sealed_session)
    assert resolved.claims.workos_user_id == "user_01"


async def test_exchange_code_without_organization(workos: WorkOSHarness) -> None:
    workos.authenticate_with_code.return_value = auth_response()
    exchange = await manager(workos).exchange_code("code_1")
    workos.get_organization.assert_not_awaited()
    assert exchange.profile.workos_organization_id is None
    assert exchange.profile.organization_name is None


async def test_exchange_code_preserves_impersonator(workos: WorkOSHarness) -> None:
    workos.authenticate_with_code.return_value = auth_response(
        impersonator={"email": "support@corral.test", "reason": "debug"}
    )
    exchange = await manager(workos).exchange_code("code_1")
    from workos.session import unseal_data

    data = unseal_data(exchange.sealed_session, COOKIE_PASSWORD)
    assert data["impersonator"]["email"] == "support@corral.test"


async def test_exchange_code_refreshes_if_issued_token_already_expired(
    workos: WorkOSHarness,
) -> None:
    workos.authenticate_with_code.return_value = auth_response(
        access_token=mint_access_token(expires_in=-60)
    )
    workos.refresh_succeeds()
    exchange = await manager(workos).exchange_code("code_1")
    assert exchange.claims.session_id == "session_02"


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (AuthenticationError("bad code"), SessionInvalid),
        (BadRequestError("invalid_grant"), SessionInvalid),
        (WorkOSConnectionError("down"), AuthProviderUnavailable),
    ],
)
async def test_exchange_code_errors(
    workos: WorkOSHarness, error: Exception, expected: type[Exception]
) -> None:
    workos.authenticate_with_code.side_effect = error
    with pytest.raises(expected):
        await manager(workos).exchange_code("code_1")


async def test_exchange_code_organization_lookup_failure(workos: WorkOSHarness) -> None:
    workos.authenticate_with_code.return_value = auth_response(organization_id="org_01")
    workos.get_organization.side_effect = WorkOSConnectionError("down")
    with pytest.raises(AuthProviderUnavailable):
        await manager(workos).exchange_code("code_1")


async def test_exchange_code_timeout(workos: WorkOSHarness) -> None:
    async def slow(**kwargs: Any) -> None:
        await asyncio.sleep(5)

    workos.authenticate_with_code.side_effect = slow
    with pytest.raises(AuthProviderUnavailable) as err:
        await manager(workos, timeout_s=0.05).exchange_code("code_1")
    assert err.value.reason == "authenticate_with_code_timeout"


def test_authorization_url(workos: WorkOSHarness) -> None:
    url = manager(workos).authorization_url(
        redirect_uri="http://api.test/cb", state="s1", screen_hint="sign-up"
    )
    q = parse_qs(urlparse(url).query)
    assert q["state"] == ["s1"]
    assert q["redirect_uri"] == ["http://api.test/cb"]
    assert q["client_id"] == ["client_test"]
    assert q["provider"] == ["authkit"]
    assert q["screen_hint"] == ["sign-up"]


def test_logout_url(workos: WorkOSHarness) -> None:
    url = manager(workos).logout_url(session_id="session_01", return_to="http://frontend.test")
    q = parse_qs(urlparse(url).query)
    assert q["session_id"] == ["session_01"]
    assert q["return_to"] == ["http://frontend.test"]


def test_user_payload_is_workos_shaped() -> None:
    assert user_payload()["object"] == "user"
