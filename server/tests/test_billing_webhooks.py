"""Paddle signature checks and out-of-order projection."""

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.billing.service import checkout_action
from app.billing.webhooks import (
    SignatureError,
    project_event,
    should_project,
    verify_paddle_signature,
)
from app.main import create_app
from app.models.billing import BillingCheckout
from tests.conftest import _running_app, make_settings

SECRET = "pdl_ntfset_test_secret"
NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)


def _sign(body: bytes, ts: int, secret: str = SECRET) -> str:
    digest = hmac.new(secret.encode(), f"{ts}:".encode() + body, hashlib.sha256).hexdigest()
    return f"ts={ts};h1={digest}"


def test_signature_accepts_the_raw_body_and_a_second_h1() -> None:
    body = b'{"event_id":"evt_1"}'
    ts = int(NOW.timestamp())
    other = hmac.new(b"other", b"nope", hashlib.sha256).hexdigest()
    header = f"ts={ts};h1={other};h1={_sign(body, ts).split('h1=')[1]}"
    verify_paddle_signature(body, header, SECRET, now=NOW, tolerance_s=5)


def test_signature_rejects_a_stale_timestamp_and_a_rewritten_body() -> None:
    body = b"{}"
    ts = int(NOW.timestamp()) - 6
    with pytest.raises(SignatureError, match="stale"):
        verify_paddle_signature(body, _sign(body, ts), SECRET, now=NOW, tolerance_s=5)
    fresh = int(NOW.timestamp())
    with pytest.raises(SignatureError, match="mismatch"):
        verify_paddle_signature(body + b" ", _sign(body, fresh), SECRET, now=NOW, tolerance_s=5)


def test_older_subscription_events_do_not_roll_state_backward() -> None:
    previous = NOW
    assert should_project(previous, NOW - timedelta(seconds=1)) is False
    assert should_project(previous, NOW) is True
    assert should_project(None, NOW) is True


def test_scheduled_cancel_does_not_clear_the_period() -> None:
    projection = project_event(
        "subscription.updated",
        {
            "id": "sub_01m6tsa6df6nh819z7dgver2fv",
            "status": "active",
            "customer_id": "ctm_01m6tsa6df6nh819z7dgver2fv",
            "scheduled_change": {"action": "cancel", "effective_at": "2026-12-07T12:00:00Z"},
            "current_billing_period": {"ends_at": "2026-12-07T12:00:00Z"},
            "items": [{"price": {"id": "pri_01m6tsa6mzj5hcyrmt41vep1d0"}}],
        },
        NOW,
    )
    assert projection.subscription_status == "active"
    assert projection.cancel_effective_at is not None
    assert projection.clear_cancel is False


def test_checkout_replay_reuses_the_same_open_transaction() -> None:
    existing = BillingCheckout(
        org_id="00000000-0000-0000-0000-000000000001",  # type: ignore[arg-type]
        plan_id="field",
        interval="month",
        paddle_price_id="pri_01m6tsa6mzj5hcyrmt41vep1d0",
        paddle_transaction_id="txn_01m6tsa6df6nh819z7dgver2fv",
        status="open",
    )
    assert checkout_action(existing, "field", "month") == "reuse"
    assert checkout_action(existing, "range", "month") == "blocked_other"
    existing.status = "ambiguous"
    assert checkout_action(existing, "field", "month") == "blocked_ambiguous"
    assert checkout_action(None, "field", "month") == "create"


async def test_webhook_without_a_secret_is_unavailable(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/billing/webhooks/paddle",
        content=b"{}",
        headers={"Origin": "https://evil.example"},
    )
    assert res.status_code == 503
    assert res.json()["error"] == "billing_unconfigured"


async def test_webhook_rejects_a_bad_signature(workos) -> None:  # type: ignore[no-untyped-def]
    body = json.dumps({"event_id": "evt_x"}).encode()
    settings = make_settings(paddle_webhook_secret=SECRET)
    async for api in _running_app(create_app(settings), workos):
        res = await api.post(
            "/api/v1/billing/webhooks/paddle",
            content=body,
            headers={"Paddle-Signature": "ts=1;h1=" + ("ab" * 32)},
        )
        assert res.status_code == 401
        assert res.json()["error"] == "invalid_signature"
