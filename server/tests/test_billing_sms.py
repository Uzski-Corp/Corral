"""Billing SMS stays unsent until a sponsor exists."""

from datetime import UTC, datetime

from app.billing.sms import SmsConsent, UnavailableSms, consider_notification

NOW = datetime(2026, 11, 7, tzinfo=UTC)


def _consent(**overrides: object) -> SmsConsent:
    base = dict(
        consented=True,
        revoked_at=None,
        phone_e164="+254700000000",
        phone_verified_at=NOW,
        role_can_receive=True,
        notify=True,
    )
    base.update(overrides)
    return SmsConsent(**base)  # type: ignore[arg-type]


def test_provider_is_unavailable_and_nothing_is_delivered() -> None:
    sender = UnavailableSms()
    assert sender.available is False
    notice = consider_notification(
        kind="trial_ending",
        consent=_consent(),
        relevant=True,
        payment_recovered=False,
        already_recorded=False,
        provider_available=False,
    )
    assert notice == "unavailable"


def test_revocation_and_duplicate_keys_do_not_send() -> None:
    assert (
        consider_notification(
            kind="renewal",
            consent=_consent(revoked_at=NOW),
            relevant=True,
            payment_recovered=False,
            already_recorded=False,
            provider_available=True,
        )
        == "skipped_revoked"
    )
    assert (
        consider_notification(
            kind="trial_ending",
            consent=_consent(),
            relevant=True,
            payment_recovered=False,
            already_recorded=True,
            provider_available=True,
        )
        == "duplicate"
    )


def test_a_recovered_payment_suppresses_a_stale_failure_alert() -> None:
    assert (
        consider_notification(
            kind="payment_failed",
            consent=_consent(),
            relevant=True,
            payment_recovered=True,
            already_recorded=False,
            provider_available=True,
        )
        == "suppressed_recovered"
    )
