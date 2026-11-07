/** Billing snapshot from GET /api/v1/billing. Limits are display-only. */

export type PlanId = "field" | "range" | "territory";
export type Interval = "month" | "year";

export type PlanLimits = {
  members: number | null;
  products: number | null;
  companiesPerMonth: number | null;
  draftsPerMonth: number | null;
  mailboxes: number | null;
  monthlyUsd: number | null;
};

export type BillingPlan = {
  id: PlanId;
  name: string;
  monthConfigured: boolean;
  yearConfigured: boolean;
  contactSales: boolean;
  limitsEnforced: boolean;
  monthlyUsd: number | null;
  limits: PlanLimits;
};

export type BillingSnapshot = {
  serverTime: string;
  catalogConfigured: boolean;
  paddleConfigured: boolean;
  canManage: boolean;
  enforcement: "off" | "on";
  pastDueAccess: string;
  trial: { state: string; startedAt: string | null; endsAt: string | null };
  subscription: {
    state: string;
    status: string | null;
    planId: string | null;
    interval: string | null;
    paidThroughAt: string | null;
    cancellationScheduled: boolean;
    accessUntil: string | null;
  };
  paymentProblem: boolean;
  access: { entitlement: string; canStartBillableWork: boolean; reason: string };
  pendingCheckout: {
    id: string;
    transactionId: string | null;
    planId: string;
    interval: string;
    status: string;
  } | null;
  trialAllowance: { days: number; cardRequired: boolean };
  limitsEnforced: boolean;
  plans: BillingPlan[];
  portalAvailable: boolean;
  sms: {
    available: boolean;
    reason: string;
    consented: boolean;
    phoneE164: string | null;
    notifyTrialEnding: boolean;
    notifyPaymentFailed: boolean;
    notifyRenewal: boolean;
  };
  gatedOperations: string[];
  notGated: string[];
};
