"""Paddle webhook verification and the projection applied from a verified event.

Signature checks use the raw body. ``custom_data`` may attach a transaction id to a
checkout row this server already created. It never chooses the tenant by itself.
"""

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.billing.catalog import MappedPrice


class SignatureError(Exception):
    pass


def verify_paddle_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    *,
    now: datetime,
    tolerance_s: int,
) -> None:
    """Match Paddle Billing: HMAC-SHA256 of ``{ts}:{raw body}``, five-second freshness.

    During secret rotation the header may carry more than one ``h1``. Any match is enough.
    """
    if not header or not secret:
        raise SignatureError("missing")
    ts: str | None = None
    signatures: list[str] = []
    for part in header.split(";"):
        key, _, value = part.strip().partition("=")
        if key == "ts" and value:
            ts = value
        elif key == "h1" and value:
            signatures.append(value)
    if ts is None or not signatures or not ts.isdigit():
        raise SignatureError("malformed")
    sent = int(ts)
    age = int(now.timestamp()) - sent
    if abs(age) > tolerance_s:
        raise SignatureError("stale")
    signed = ts.encode() + b":" + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    matched = False
    for candidate in signatures:
        if len(candidate) == len(expected) and hmac.compare_digest(expected, candidate):
            matched = True
            break
    if not matched:
        raise SignatureError("mismatch")


def parse_event(raw_body: bytes) -> dict[str, Any]:
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise SignatureError("body") from exc
    if not isinstance(body, dict):
        raise SignatureError("body")
    event_id = body.get("event_id")
    event_type = body.get("event_type")
    occurred = body.get("occurred_at")
    data = body.get("data")
    if (
        not isinstance(event_id, str)
        or not isinstance(event_type, str)
        or not isinstance(data, dict)
    ):
        raise SignatureError("body")
    if not isinstance(occurred, str):
        raise SignatureError("body")
    return body


def occurred_at(body: dict[str, Any]) -> datetime:
    raw = str(body["occurred_at"]).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def should_project(previous: datetime | None, occurred: datetime) -> bool:
    """Older events do not roll the subscription backwards. Equal timestamps still apply."""
    return previous is None or occurred >= previous


def _parse_dt(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _price_id(data: dict[str, Any]) -> str | None:
    items = data.get("items")
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        return None
    item = items[0]
    price = item.get("price")
    if isinstance(price, dict) and isinstance(price.get("id"), str):
        return price["id"]
    if isinstance(item.get("price_id"), str):
        return item["price_id"]
    return None


def _id(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    return value if isinstance(value, str) and value else None


@dataclass(frozen=True, slots=True)
class BillingProjection:
    """Fields to write on the workspace row. None means leave the stored value alone."""

    customer_id: str | None = None
    subscription_id: str | None = None
    subscription_status: str | None = None
    price_id: str | None = None
    paid_through_at: datetime | None = None
    clear_paid_through: bool = False
    cancel_effective_at: datetime | None = None
    clear_cancel: bool = False
    payment_problem: bool | None = None
    payment_recovered: bool = False
    event_at: datetime | None = None
    checkout_status: str | None = None
    transaction_id: str | None = None
    checkout_id: str | None = None


def _custom_checkout(data: dict[str, Any]) -> str | None:
    custom = data.get("custom_data")
    if not isinstance(custom, dict):
        return None
    checkout_id = custom.get("corral_checkout_id")
    return checkout_id if isinstance(checkout_id, str) else None


def project_event(event_type: str, data: dict[str, Any], occurred: datetime) -> BillingProjection:
    transaction_id = (
        _id(data, "id") if event_type.startswith("transaction.") else _id(data, "transaction_id")
    )
    checkout_id = _custom_checkout(data)
    customer_id = _id(data, "customer_id")
    subscription_id = (
        _id(data, "id") if event_type.startswith("subscription.") else _id(data, "subscription_id")
    )

    if event_type in (
        "transaction.payment_failed",
        "subscription.past_due",
        "transaction.past_due",
    ):
        return BillingProjection(
            customer_id=customer_id,
            subscription_id=subscription_id,
            subscription_status="past_due" if event_type != "transaction.payment_failed" else None,
            payment_problem=True,
            event_at=occurred,
            transaction_id=transaction_id,
            checkout_id=checkout_id,
        )

    if event_type.startswith("subscription."):
        status = _id(data, "status")
        scheduled = data.get("scheduled_change")
        cancel_at = None
        clear_cancel = True
        if isinstance(scheduled, dict) and scheduled.get("action") == "cancel":
            cancel_at = _parse_dt(scheduled.get("effective_at"))
            clear_cancel = cancel_at is None
        period = data.get("current_billing_period")
        paid_through = None
        if isinstance(period, dict):
            paid_through = _parse_dt(period.get("ends_at"))
        recovered = status == "active"
        problem = True if status == "past_due" else False if recovered else None
        return BillingProjection(
            customer_id=customer_id,
            subscription_id=subscription_id,
            subscription_status=status,
            price_id=_price_id(data),
            paid_through_at=paid_through,
            cancel_effective_at=cancel_at,
            clear_cancel=clear_cancel and cancel_at is None,
            payment_problem=problem,
            payment_recovered=recovered,
            event_at=occurred,
            transaction_id=transaction_id,
            checkout_id=checkout_id,
        )

    completed = event_type in ("transaction.completed", "transaction.paid")
    return BillingProjection(
        customer_id=customer_id,
        subscription_id=subscription_id,
        price_id=_price_id(data),
        payment_problem=False if completed else None,
        payment_recovered=completed,
        event_at=occurred if completed else None,
        checkout_status="completed" if completed else None,
        transaction_id=transaction_id,
        checkout_id=checkout_id,
    )


def plan_fields(mapped: MappedPrice | None) -> tuple[str | None, str | None]:
    if mapped is None:
        return None, None
    return mapped.plan_id, mapped.interval
