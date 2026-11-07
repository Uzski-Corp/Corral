"""Explicit Corral plan → Paddle price mapping.

Monthly USD amounts and allowances below were confirmed for Corral. Price IDs still
come from the environment so a sandbox catalog cannot leak into production. This
module refuses the Athena sandbox price IDs on the shared seller account.
Numeric allowances are displayed. Corral does not enforce those counts yet.
"""

from dataclasses import dataclass
from typing import Literal

from app.core.config import Settings

PlanId = Literal["field", "range", "territory"]
Interval = Literal["month", "year"]

PLAN_IDS: tuple[PlanId, ...] = ("field", "range", "territory")
INTERVALS: tuple[Interval, ...] = ("month", "year")
PRICE_ID = r"^pri_[a-z\d]{26}$"

# Seller slr_01m1kq9cc0hmgvc69nef5mhrqt ("Uzski Sand") — Athena Starter/Pro/Advanced.
# Corral must not check out against these prices.
ATHENA_PRICE_IDS = frozenset(
    {
        "pri_01m215b83z0avwsv0va5tdxteq",
        "pri_01m215b757n462c86r7tev62vq",
        "pri_01m215b4y93q0h63peaj2w7ga6",
        "pri_01m215b3khx25g48jem5rbk8tb",
        "pri_01m215b1hh683530gdj8xcc8c1",
        "pri_01m215b0ecq2b4ax936hxkg1zp",
    }
)

PLAN_NAMES: dict[PlanId, str] = {"field": "Field", "range": "Range", "territory": "Territory"}

# Confirmed 2026-11-07. Territory has no self-serve price. Counts are not enforced.
CONFIRMED_LIMITS: dict[str, dict[str, int | None]] = {
    "field": {
        "members": 1,
        "products": 1,
        "companies_per_month": 500,
        "ai_reply_drafts_per_month": 200,
        "mailboxes": 2,
        "monthly_usd": 49,
    },
    "range": {
        "members": 5,
        "products": 3,
        "companies_per_month": 2_000,
        "ai_reply_drafts_per_month": 1_000,
        "mailboxes": 10,
        "monthly_usd": 149,
    },
    "territory": {
        "members": None,
        "products": None,
        "companies_per_month": None,
        "ai_reply_drafts_per_month": None,
        "mailboxes": None,
        "monthly_usd": None,
    },
}
TRIAL_ALLOWANCE: dict[str, int | bool] = {
    "days": 7,
    "card_required": False,
    "members": 1,
    "products": 1,
    "companies_total": 25,
    "ai_reply_drafts_total": 20,
    "mailboxes": 1,
}


@dataclass(frozen=True, slots=True)
class MappedPrice:
    plan_id: PlanId
    interval: Interval
    price_id: str


def _raw(settings: Settings, plan_id: PlanId, interval: Interval) -> str:
    return getattr(settings, f"paddle_price_{plan_id}_{interval}").strip()


def validate_price_mappings(settings: Settings) -> None:
    import re

    seen: dict[str, str] = {}
    for plan_id in PLAN_IDS:
        for interval in INTERVALS:
            price_id = _raw(settings, plan_id, interval)
            if not price_id:
                continue
            label = f"PADDLE_PRICE_{plan_id.upper()}_{interval.upper()}"
            if not re.fullmatch(PRICE_ID, price_id):
                raise ValueError(f"{label} must be a Paddle price id (pri_…)")
            if price_id in ATHENA_PRICE_IDS:
                raise ValueError(
                    f"{label} is an Athena sandbox price and cannot be used for Corral"
                )
            if price_id in seen:
                raise ValueError(f"{label} duplicates {seen[price_id]}")
            seen[price_id] = label


def price_for(settings: Settings, plan_id: str, interval: str) -> MappedPrice | None:
    if plan_id not in PLAN_IDS or interval not in INTERVALS:
        return None
    price_id = _raw(settings, plan_id, interval)  # type: ignore[arg-type]
    if not price_id:
        return None
    return MappedPrice(plan_id=plan_id, interval=interval, price_id=price_id)  # type: ignore[arg-type]


def plan_for_price(settings: Settings, price_id: str | None) -> MappedPrice | None:
    if not price_id:
        return None
    for plan_id in PLAN_IDS:
        for interval in INTERVALS:
            mapped = price_for(settings, plan_id, interval)
            if mapped is not None and mapped.price_id == price_id:
                return mapped
    return None


def configured_plans(settings: Settings) -> list[dict[str, object]]:
    """Plans the billing screen may offer. A missing price id stays unavailable."""
    plans: list[dict[str, object]] = []
    for plan_id in PLAN_IDS:
        month = price_for(settings, plan_id, "month") is not None
        year = price_for(settings, plan_id, "year") is not None
        limits = CONFIRMED_LIMITS[plan_id]
        plans.append(
            {
                "id": plan_id,
                "name": PLAN_NAMES[plan_id],
                "month_configured": month,
                "year_configured": year,
                "contact_sales": plan_id == "territory" and not month and not year,
                "limits_confirmed": True,
                "limits_enforced": False,
                "monthly_usd": limits["monthly_usd"],
                "limits": limits,
            }
        )
    return plans


def catalog_ready(settings: Settings) -> bool:
    """At least one self-serve price. Territory can stay contact-sales."""
    return any(
        price_for(settings, plan_id, interval)
        for plan_id in ("field", "range")
        for interval in INTERVALS
    )
