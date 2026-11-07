"""Billing SMS contract. No provider is selected and nothing is sent.

A future sponsor adapter must implement verification, send, delivery receipts, opt-out,
and recovery when a send's outcome is unknown. Until then ``available`` is false.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

SmsKind = Literal["trial_ending", "payment_failed", "renewal"]
CONSENT_VERSION = "billing-sms-2026-11-07"

Notice = Literal[
    "unavailable", "skipped_revoked", "suppressed_recovered", "duplicate", "not_relevant"
]


@dataclass(frozen=True, slots=True)
class SmsConsent:
    consented: bool
    revoked_at: datetime | None
    phone_e164: str | None
    phone_verified_at: datetime | None
    role_can_receive: bool
    notify: bool


class BillingSmsSender(Protocol):
    """What a sponsor integration has to provide before any message can leave Corral.

    - ``start_verification`` sends a code and returns a provider reference. Corral must not
      mark the number verified until ``confirm_verification`` succeeds.
    - ``send`` is at-least-once. An ambiguous timeout must be recoverable (same idempotency
      key, no second customer-visible message) before a retry.
    - ``delivery_receipt`` and ``opt_out`` are provider callbacks. Opt-out revokes consent.
    - Recheck consent, role, and event relevance immediately before ``send``.
    """

    available: bool

    async def start_verification(self, phone_e164: str) -> str: ...

    async def confirm_verification(self, reference: str, code: str) -> bool: ...

    async def send(self, *, phone_e164: str, body: str, idempotency_key: str) -> str: ...

    async def delivery_receipt(
        self, provider_id: str
    ) -> Literal["delivered", "failed", "unknown"]: ...

    async def opt_out(self, phone_e164: str) -> None: ...


class UnavailableSms:
    """The scaffold. Every method refuses. Nothing is marked delivered."""

    available = False
    reason = "No billing SMS sponsor is configured."

    async def start_verification(self, phone_e164: str) -> str:
        raise RuntimeError(self.reason)

    async def confirm_verification(self, reference: str, code: str) -> bool:
        raise RuntimeError(self.reason)

    async def send(self, *, phone_e164: str, body: str, idempotency_key: str) -> str:
        raise RuntimeError(self.reason)

    async def delivery_receipt(self, provider_id: str) -> Literal["delivered", "failed", "unknown"]:
        return "unknown"

    async def opt_out(self, phone_e164: str) -> None:
        return None


def sms_sender() -> UnavailableSms:
    return UnavailableSms()


def consider_notification(
    *,
    kind: SmsKind,
    consent: SmsConsent,
    relevant: bool,
    payment_recovered: bool,
    already_recorded: bool,
    provider_available: bool,
) -> Notice:
    """Decide a reminder without sending it.

    A stale payment-failed alert is suppressed once payment has recovered.
    Revoked consent and a missing opt-in never produce a send.
    """
    if not relevant:
        return "not_relevant"
    if kind == "payment_failed" and payment_recovered:
        return "suppressed_recovered"
    if (
        not consent.consented
        or consent.revoked_at is not None
        or not consent.role_can_receive
        or not consent.notify
        or not consent.phone_e164
        or consent.phone_verified_at is None
    ):
        return "skipped_revoked"
    if already_recorded:
        return "duplicate"
    if not provider_available:
        return "unavailable"
    return "unavailable"
