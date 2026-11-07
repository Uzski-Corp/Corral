/**
 * Billing (server/app/api/v1/routes/billing.py).
 * GET  /api/v1/billing
 * POST /api/v1/billing/checkout   { plan_id, interval }
 * POST /api/v1/billing/portal
 * PUT  /api/v1/billing/sms
 */
import { err, ok, type Result } from "../result";
import type { BillingPlan, BillingSnapshot, Interval, PlanId } from "../billing/types";
import type { ApiClient } from "./client";
import { isRecord, isString, reader, type Reader } from "./decode";
import type { ApiError } from "./errors";

export type CheckoutBody = { planId: PlanId; interval: Interval };
export type SmsBody = {
  phoneE164?: string | null;
  consented?: boolean;
  timezone?: string | null;
  quietStartMinute?: number | null;
  quietEndMinute?: number | null;
  notifyTrialEnding?: boolean;
  notifyPaymentFailed?: boolean;
  notifyRenewal?: boolean;
  enableDelivery?: boolean;
};

export type SmsPreference = BillingSnapshot["sms"];

const PLAN_IDS = ["field", "range", "territory"] as const;

function planOf(row: Reader): BillingPlan {
  const id = row.oneOf("id", PLAN_IDS);
  const limits = row.obj("limits");
  return {
    id,
    name: row.str("name"),
    monthConfigured: row.bool("month_configured"),
    yearConfigured: row.bool("year_configured"),
    contactSales: row.bool("contact_sales"),
    limitsEnforced: row.bool("limits_enforced"),
    monthlyUsd: row.optNum("monthly_usd"),
    limits: {
      members: limits.optNum("members"),
      products: limits.optNum("products"),
      companiesPerMonth: limits.optNum("companies_per_month"),
      draftsPerMonth: limits.optNum("ai_reply_drafts_per_month"),
      mailboxes: limits.optNum("mailboxes"),
      monthlyUsd: limits.optNum("monthly_usd"),
    },
  };
}

function smsOf(row: Reader): SmsPreference {
  return {
    available: row.bool("available"),
    reason: row.str("reason"),
    consented: row.bool("consented"),
    phoneE164: row.optStr("phone_e164"),
    notifyTrialEnding: row.bool("notify_trial_ending"),
    notifyPaymentFailed: row.bool("notify_payment_failed"),
    notifyRenewal: row.bool("notify_renewal"),
  };
}

export function decodeBilling(input: unknown): Result<BillingSnapshot, string> {
  try {
    const row = reader(input, "billing");
    const trial = row.obj("trial");
    const sub = row.obj("subscription");
    const access = row.obj("access");
    const allowance = row.obj("trial_allowance");
    const pending = row.optObj("pending_checkout");
    return ok({
      serverTime: row.str("server_time"),
      catalogConfigured: row.bool("catalog_configured"),
      paddleConfigured: row.bool("paddle_configured"),
      canManage: row.bool("can_manage"),
      enforcement: row.oneOf("enforcement", ["off", "on"]),
      pastDueAccess: row.str("past_due_access"),
      trial: { state: trial.str("state"), startedAt: trial.optStr("started_at"), endsAt: trial.optStr("ends_at") },
      subscription: {
        state: sub.str("state"),
        status: sub.optStr("status"),
        planId: sub.optStr("plan_id"),
        interval: sub.optStr("interval"),
        paidThroughAt: sub.optStr("paid_through_at"),
        cancellationScheduled: sub.bool("cancellation_scheduled"),
        accessUntil: sub.optStr("access_until"),
      },
      paymentProblem: row.bool("payment_problem"),
      access: {
        entitlement: access.str("entitlement"),
        canStartBillableWork: access.bool("can_start_billable_work"),
        reason: access.str("reason"),
      },
      pendingCheckout: pending
        ? {
            id: pending.str("id"),
            transactionId: pending.optStr("transaction_id"),
            planId: pending.str("plan_id"),
            interval: pending.str("interval"),
            status: pending.str("status"),
          }
        : null,
      trialAllowance: { days: allowance.num("days"), cardRequired: allowance.bool("card_required") },
      limitsEnforced: row.bool("limits_enforced"),
      plans: row.list("plans", planOf),
      portalAvailable: row.bool("portal_available"),
      sms: smsOf(row.obj("sms")),
      gatedOperations: row.strList("gated_operations"),
      notGated: row.strList("not_gated"),
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : "billing: unexpected");
  }
}

function txn(input: unknown): Result<{ transactionId: string }, string> {
  if (!isRecord(input) || !isString(input.transaction_id)) return err("checkout: expected transaction_id");
  return ok({ transactionId: input.transaction_id });
}

function portal(input: unknown): Result<{ url: string }, string> {
  if (!isRecord(input) || !isString(input.url) || !input.url.startsWith("https://")) return err("portal: expected an https url");
  return ok({ url: input.url });
}

function decodeSms(input: unknown): Result<SmsPreference, string> {
  try {
    return ok(smsOf(reader(input, "sms")));
  } catch (error) {
    return err(error instanceof Error ? error.message : "sms: unexpected");
  }
}

export type BillingApi = {
  get(signal?: AbortSignal): Promise<Result<BillingSnapshot, ApiError>>;
  checkout(body: CheckoutBody): Promise<Result<{ transactionId: string }, ApiError>>;
  portal(): Promise<Result<{ url: string }, ApiError>>;
  saveSms(body: SmsBody): Promise<Result<SmsPreference, ApiError>>;
};

export function createBillingApi(client: ApiClient): BillingApi {
  return {
    get: (signal) => client.request("/api/v1/billing", { decode: decodeBilling, signal }),
    checkout: (body) => client.request("/api/v1/billing/checkout", {
      method: "POST",
      body: { plan_id: body.planId, interval: body.interval },
      decode: txn,
    }),
    portal: () => client.request("/api/v1/billing/portal", { method: "POST", decode: portal }),
    saveSms: (body) => client.request("/api/v1/billing/sms", {
      method: "PUT",
      body: {
        phone_e164: body.phoneE164 ?? null,
        consented: body.consented ?? false,
        timezone: body.timezone ?? null,
        quiet_start_minute: body.quietStartMinute ?? null,
        quiet_end_minute: body.quietEndMinute ?? null,
        notify_trial_ending: body.notifyTrialEnding ?? false,
        notify_payment_failed: body.notifyPaymentFailed ?? false,
        notify_renewal: body.notifyRenewal ?? false,
        enable_delivery: body.enableDelivery ?? false,
      },
      decode: decodeSms,
    }),
  };
}
