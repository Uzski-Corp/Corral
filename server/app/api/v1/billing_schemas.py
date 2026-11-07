"""Billing request bodies. Responses are plain dicts shaped in the service."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PlanId = Literal["field", "range", "territory"]
Interval = Literal["month", "year"]


class CheckoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: PlanId
    interval: Interval


class SmsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consented: bool = False
    phone_e164: str | None = Field(default=None, max_length=20)
    timezone: str | None = Field(default=None, max_length=64)
    quiet_start_minute: int | None = Field(default=None, ge=0, le=1439)
    quiet_end_minute: int | None = Field(default=None, ge=0, le=1439)
    notify_trial_ending: bool = False
    notify_payment_failed: bool = False
    notify_renewal: bool = False
    enable_delivery: bool = False
