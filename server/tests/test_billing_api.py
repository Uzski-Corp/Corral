"""Checkout and catalog stay unavailable until Corral price ids are configured."""

import pytest
from pydantic import ValidationError

from app.billing.catalog import ATHENA_PRICE_IDS, catalog_ready, configured_plans, price_for
from tests.conftest import make_settings


def test_missing_prices_leave_checkout_unconfigured() -> None:
    settings = make_settings()
    assert catalog_ready(settings) is False
    assert price_for(settings, "field", "month") is None
    plans = {plan["id"]: plan for plan in configured_plans(settings)}
    assert plans["field"]["month_configured"] is False
    assert plans["field"]["monthly_usd"] == 49
    assert plans["field"]["limits_enforced"] is False
    assert plans["territory"]["contact_sales"] is True
    assert plans["range"]["monthly_usd"] == 149


def test_a_configured_field_price_is_the_only_one_offered() -> None:
    settings = make_settings(paddle_price_field_month="pri_01m6tsa6mzj5hcyrmt41vep1d0")
    mapped = price_for(settings, "field", "month")
    assert mapped is not None and mapped.price_id.startswith("pri_")
    assert price_for(settings, "range", "month") is None
    assert catalog_ready(settings) is True


def test_athena_ids_are_not_valid_corral_prices() -> None:
    athena = next(iter(ATHENA_PRICE_IDS))
    with pytest.raises(ValidationError, match="Athena"):
        make_settings(paddle_price_range_month=athena)
