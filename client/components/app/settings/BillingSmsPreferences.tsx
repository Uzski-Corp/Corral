"use client";

import { useState } from "react";
import { Button } from "../primitives";
import type { BillingSnapshot } from "@/lib/billing/types";
import type { BillingApi } from "@/lib/api/billing";

export function BillingSmsPreferences({
  snapshot,
  api,
  onSaved,
}: {
  snapshot: BillingSnapshot;
  api: BillingApi;
  onSaved: () => void;
}) {
  const sms = snapshot.sms;
  const [phone, setPhone] = useState(sms.phoneE164 ?? "");
  const [consented, setConsented] = useState(sms.consented);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(enableDelivery = false) {
    setBusy(true);
    setMessage(null);
    const result = await api.saveSms({
      phoneE164: phone.trim() || null,
      consented,
      notifyTrialEnding: consented,
      notifyPaymentFailed: consented,
      notifyRenewal: consented,
      enableDelivery,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message || "Couldn’t save SMS preferences.");
      return;
    }
    setMessage(enableDelivery ? result.value.reason : "Saved. Messages are not sent yet.");
    onSaved();
  }

  return (
    <section className="b-sms" aria-label="Billing SMS">
      <h3>Billing texts</h3>
      <p className="c-faint">{sms.reason} Nothing is marked delivered.</p>
      <label className="b-sms__phone">
        Phone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" disabled={!snapshot.canManage || busy} />
      </label>
      <label className="b-sms__opt">
        <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} disabled={!snapshot.canManage || busy} />
        Text me about the trial, failed payments, and renewals
      </label>
      <div className="b-sms__actions">
        <Button disabled={!snapshot.canManage || busy} onClick={() => void save(false)}>Save preference</Button>
        <Button variant="quiet" disabled={!snapshot.canManage || busy} onClick={() => void save(true)}>Turn on delivery</Button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
