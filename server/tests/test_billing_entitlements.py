"""Effective access: trial boundary, cancellation timing, and the rollout switch."""

from datetime import UTC, datetime, timedelta

from app.billing.entitlements import AccessFacts, effective_access

NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)


def facts(**overrides: object) -> AccessFacts:
    base = dict(
        now=NOW,
        enforce=True,
        past_due_access="unresolved",
        trial_started_at=NOW - timedelta(days=1),
        trial_ends_at=NOW + timedelta(days=6),
        subscription_status=None,
        paid_through_at=None,
        cancel_effective_at=None,
        payment_problem=False,
    )
    base.update(overrides)
    return AccessFacts(**base)  # type: ignore[arg-type]


def test_trial_is_active_until_the_end_instant() -> None:
    ends = NOW + timedelta(hours=1)
    active = effective_access(facts(trial_ends_at=ends))
    assert active.trial_state == "active" and active.entitlement == "trial"
    assert active.can_start_billable_work is True
    expired = effective_access(facts(trial_ends_at=NOW))
    assert expired.trial_state == "expired" and expired.entitlement == "none"
    assert expired.can_start_billable_work is False


def test_enforcement_off_does_not_lock_a_workspace_without_a_trial() -> None:
    access = effective_access(facts(enforce=False, trial_started_at=None, trial_ends_at=None))
    assert access.enforcement == "off"
    assert access.can_start_billable_work is True
    assert access.entitlement == "none"


def test_scheduled_cancellation_keeps_access_until_the_effective_time() -> None:
    later = NOW + timedelta(days=3)
    open_access = effective_access(
        facts(
            subscription_status="active",
            paid_through_at=later,
            cancel_effective_at=later,
            trial_ends_at=NOW - timedelta(days=1),
        )
    )
    assert open_access.cancellation_scheduled is True
    assert open_access.entitlement == "paid"
    assert open_access.access_until == later
    closed = effective_access(
        facts(
            subscription_status="active",
            paid_through_at=later,
            cancel_effective_at=NOW,
            trial_ends_at=NOW - timedelta(days=1),
        )
    )
    assert closed.subscription_state == "canceled"
    assert closed.entitlement == "none"


def test_paddle_trialing_is_not_paid_access() -> None:
    access = effective_access(
        facts(
            subscription_status="trialing",
            trial_started_at=None,
            trial_ends_at=None,
        )
    )
    assert access.subscription_state == "trialing"
    assert access.entitlement == "none"


def test_unresolved_past_due_does_not_grant_paid_access() -> None:
    blocked = effective_access(
        facts(
            subscription_status="past_due",
            payment_problem=True,
            trial_ends_at=NOW - timedelta(days=1),
        )
    )
    assert blocked.payment_problem is True
    assert blocked.entitlement == "none"
    retained = effective_access(
        facts(
            subscription_status="past_due",
            payment_problem=True,
            past_due_access="retain",
            trial_ends_at=NOW - timedelta(days=1),
        )
    )
    assert retained.entitlement == "paid"


def test_a_local_trial_still_covers_work_during_a_payment_problem() -> None:
    access = effective_access(
        facts(
            subscription_status="active",
            payment_problem=True,
            paid_through_at=NOW + timedelta(days=10),
        )
    )
    assert access.entitlement == "trial"
    assert access.can_start_billable_work is True
