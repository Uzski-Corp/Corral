"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "@phosphor-icons/react/dist/ssr";
import { billingApiFor, type BillingApi } from "@/lib/api";
import type { BillingSnapshot, PlanId } from "@/lib/billing/types";
import { confirmingCopy, openCheckout } from "@/lib/billing/paddle";
import { Button } from "../primitives";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { BillingSmsPreferences } from "./BillingSmsPreferences";

const SALES = "mailto:hello@corral.so?subject=Territory";

export function BillingConnected({ api = billingApiFor() }: { api?: BillingApi }) {
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmationDelayed, setConfirmationDelayed] = useState(false);

  async function load() {
    const result = await api.get();
    if (!result.ok) {
      setError(result.error.message || "Billing couldn’t be loaded.");
      return;
    }
    setError(null);
    setSnapshot(result.value);
    if (result.value.access.entitlement === "paid" || result.value.pendingCheckout == null) setConfirming(false);
  }

  useEffect(() => {
    let stop = false;
    void api.get().then((result) => {
      if (stop) return;
      if (!result.ok) setError(result.error.message || "Billing couldn’t be loaded.");
      else setSnapshot(result.value);
    });
    return () => { stop = true; };
  }, [api]);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    const stop = window.setTimeout(() => { setConfirming(false); setConfirmationDelayed(true); }, 120_000);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, [confirming]);

  if (error && !snapshot) return <div className="i-page b-page"><ErrorState title="Billing isn’t available">{error}</ErrorState><Button onClick={() => void load()}>Try again</Button></div>;
  if (!snapshot) {
    return (
      <div className="i-page b-page" aria-busy="true">
        <span className="u-sr" role="status">Loading billing</span>
        <Skeleton w={160} h={18} />
      </div>
    );
  }

  const notice = confirmationDelayed ? "Payment confirmation is taking longer than expected. Refresh billing to check again." : confirming ? "Confirming payment" : confirmingCopy(snapshot);
  const trial = snapshot.trial;

  async function choose(planId: PlanId) {
    setBusy(planId);
    const result = await api.checkout({ planId, interval: "month" });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message || "Checkout didn’t start.");
      return;
    }
    try {
      await openCheckout(result.value.transactionId, () => { setConfirmationDelayed(false); setConfirming(true); });
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout didn’t open.");
    }
  }

  async function portal() {
    setBusy("portal");
    const result = await api.portal();
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message || "The billing portal didn’t open.");
      return;
    }
    window.location.assign(result.value.url);
  }

  return (
    <div className="i-page b-page">
      <div className="i-head"><h2>Billing</h2><Button variant="quiet" onClick={() => void load()}>Refresh billing</Button></div>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="b-hero">
        <EmptyState id="billing" glyph={CreditCard} title={snapshot.access.entitlement === "paid" ? "Paid workspace" : trial.state === "active" ? "Free trial" : "Choose a plan"}>
          {snapshot.access.entitlement === "paid" ? "Your workspace subscription is active. Manage payments and invoices below." : trial.state === "active" && trial.endsAt
            ? `Free until ${new Date(trial.endsAt).toLocaleDateString()}. No card. Paid checkout charges immediately.`
            : "Your existing records are preserved. Choose a plan to continue using Corral."}
        </EmptyState>
      </div>
      {!snapshot.catalogConfigured || !snapshot.paddleConfigured ? <p>Checkout isn’t configured for this environment yet.</p> : null}
      <ul className="b-plans" aria-label="Plans">
        {snapshot.plans.map((plan) => (
          <li key={plan.id} className="b-plan">
            <span className="b-plan__txt">
              <span className="b-plan__name">{plan.name}</span>
              <span className="b-plan__line">
                {plan.monthlyUsd == null ? "Agreed" : `$${plan.monthlyUsd} a month`}
                {plan.limits.companiesPerMonth ? ` · ${plan.limits.companiesPerMonth.toLocaleString("en")} companies` : ""}
              </span>
            </span>
            {plan.contactSales || plan.monthlyUsd == null
              ? <a className="c-btn c-btn--quiet" href={SALES}>Talk to us</a>
              : <Button disabled={!snapshot.canManage || !plan.monthConfigured || !snapshot.paddleConfigured || snapshot.access.entitlement === "paid" || busy !== null} onClick={() => void choose(plan.id)}>{snapshot.subscription.planId === plan.id && snapshot.access.entitlement === "paid" ? "Current plan" : busy === plan.id ? "Opening" : "Choose"}</Button>}
          </li>
        ))}
      </ul>
      {snapshot.subscription.cancellationScheduled && snapshot.subscription.accessUntil
        ? <p>Cancels {new Date(snapshot.subscription.accessUntil).toLocaleString()}. Access stays open until then.</p>
        : null}
      {snapshot.portalAvailable
        ? <Button disabled={!snapshot.canManage || busy !== null} onClick={() => void portal()}>Manage billing</Button>
        : null}
      {!snapshot.canManage ? <p className="c-faint">You can see billing. An owner or admin starts checkout.</p> : null}
      <BillingSmsPreferences snapshot={snapshot} api={api} onSaved={() => { void load(); }} />
    </div>
  );
}
