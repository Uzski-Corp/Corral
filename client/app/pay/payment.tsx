"use client";
import { useEffect, useRef, useState } from "react";
import { openCheckout } from "@/lib/billing/paddle";
export function PaymentPage() {
  const [message, setMessage] = useState("Opening secure checkout…");
  const [failed, setFailed] = useState(false);
  const opened = useRef(false);
  async function open() {
    const id = new URL(window.location.href).searchParams.get("_ptxn");
    if (!id || !/^txn_[a-z0-9]{26}$/.test(id)) { setMessage("Open the payment link from your Corral billing page."); return; }
    setFailed(false);
    try { await openCheckout(id, () => setMessage("Payment submitted. Corral will update your workspace after verification.")); }
    catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : "Checkout couldn't open."); }
  }
  useEffect(() => { if (!opened.current) { opened.current = true; void open(); } }, []);
  return <main className="i-page b-page"><h1>Corral billing</h1><p role="status">{message}</p>{failed && <button className="c-btn" onClick={() => void open()}>Try again</button>}<p><a href="/app/settings/billing">Return to billing</a></p></main>;
}
