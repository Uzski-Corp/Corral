import { describe, expect, it } from "vitest";
import { decodeBilling } from "./billing";

const SNAPSHOT = {
  server_time: "2026-11-07T12:00:00+00:00",
  catalog_configured: true,
  paddle_configured: false,
  can_manage: true,
  enforcement: "off",
  past_due_access: "unresolved",
  trial: { state: "active", started_at: "2026-11-01T00:00:00+00:00", ends_at: "2026-11-08T00:00:00+00:00" },
  subscription: {
    state: "none", status: null, plan_id: null, interval: null, paid_through_at: null,
    cancellation_scheduled: false, access_until: "2026-11-08T00:00:00+00:00",
  },
  payment_problem: false,
  access: { entitlement: "trial", can_start_billable_work: true, reason: "trial" },
  pending_checkout: null,
  trial_allowance: { days: 7, card_required: false },
  limits_enforced: false,
  plans: [{
    id: "field", name: "Field", month_configured: true, year_configured: false, contact_sales: false,
    limits_confirmed: true, limits_enforced: false, monthly_usd: 49,
    limits: { members: 1, products: 1, companies_per_month: 500, ai_reply_drafts_per_month: 200, mailboxes: 2, monthly_usd: 49 },
  }],
  portal_available: false,
  sms: {
    available: false, reason: "No billing SMS sponsor is configured.", consent_version: "billing-sms-2026-11-07",
    consented: false, phone_e164: null, phone_verified: false, timezone: null,
    quiet_start_minute: null, quiet_end_minute: null,
    notify_trial_ending: false, notify_payment_failed: false, notify_renewal: false, revoked_at: null,
  },
  gated_operations: ["lead CSV imports that write rows"],
  not_gated: ["reading existing records"],
};

describe("decodeBilling", () => {
  it("keeps trial, price, and the enforcement flag distinct", () => {
    const decoded = decodeBilling(SNAPSHOT);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.trialAllowance.days).toBe(7);
    expect(decoded.value.plans[0]?.monthlyUsd).toBe(49);
    expect(decoded.value.limitsEnforced).toBe(false);
    expect(decoded.value.access.entitlement).toBe("trial");
    expect(decoded.value.sms.available).toBe(false);
  });

  it("rejects a snapshot missing the trial", () => {
    const decoded = decodeBilling({ ...SNAPSHOT, trial: null });
    expect(decoded.ok).toBe(false);
  });
});
