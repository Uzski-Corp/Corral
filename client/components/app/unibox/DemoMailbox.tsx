"use client";
import { useEffect, useRef, useState } from "react";
import type { InboxApi, DemoMailSnapshot } from "@/lib/api/inbox";
import { Button } from "../primitives";
import type { Thread } from "../data";

const LABELS: Record<string, string> = { queued: "Queued", sending: "Submitting", accepted: "Accepted by AutoSend", sent: "Sent", delivered: "Delivered", failed: "Not sent", uncertain: "Uncertain: check AutoSend before resending", bounced: "Bounced" };
export function DemoMailbox({ api, onThread }: { api: InboxApi; onThread: (thread: Thread) => void }) {
  const [snapshot, setSnapshot] = useState<DemoMailSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("Corral demo");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ content: string; id: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    async function load() {
      const result = await api.demo();
      if (stopped) return;
      if (result.ok) { setSnapshot(result.value); }
      else setError(result.error.message);
    }
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [api, refresh]);
  async function compose() {
    if (busy || !recipient || !body.trim() || !subject.trim()) return;
    const content = JSON.stringify([recipient, subject, body]);
    if (attempt.current?.content !== content) attempt.current = { content, id: crypto.randomUUID() };
    setBusy(true); setError("");
    const result = await api.compose({ request_id: attempt.current.id, recipient, subject, body });
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    onThread(result.value as Thread); setOpen(false); setBody(""); attempt.current = null; setRefresh(n => n + 1);
  }
  return <section className="demo-mail" aria-label="Demo mailbox">
    <div className="demo-mail-actions"><span>Demo mailbox{snapshot?.sender ? ` · ${snapshot.sender}` : ""}</span>
      {snapshot?.available && snapshot.can_compose && <Button onClick={() => setOpen(v => !v)}>{open ? "Close composer" : "New demo message"}</Button>}
      <Button variant="quiet" onClick={() => setRefresh(n => n + 1)}>Refresh status</Button>
    </div>
    {!snapshot && !error && <p role="status">Loading mailbox…</p>}
    {snapshot && !snapshot.available && <p className="c-faint">Set the demo sender, workspace and approved recipients to enable real email.</p>}
    {error && <p role="alert">{error}</p>}
    {open && <div className="demo-mail-form">
      <label>Recipient<select value={recipient} disabled={busy} onChange={e => setRecipient(e.target.value)}><option value="">Choose an approved recipient</option>{snapshot?.recipients.map(email => <option key={email} value={email}>{email}</option>)}</select></label>
      <label>Subject<input value={subject} maxLength={500} disabled={busy} onChange={e => setSubject(e.target.value)} /></label>
      <label>Message<textarea value={body} rows={4} maxLength={20000} disabled={busy} onChange={e => setBody(e.target.value)} /></label>
      <Button variant="primary" disabled={busy || !recipient || !body.trim() || !subject.trim()} onClick={() => void compose()}>{busy ? "Queueing…" : "Send demo message"}</Button>
    </div>}
    {!!snapshot?.deliveries.length && <details><summary>Recent deliveries ({snapshot.deliveries.length})</summary><ul>{snapshot.deliveries.map(row => <li key={row.id}>
      <span>{row.recipient} · {row.subject} · {LABELS[row.status] ?? row.status}</span>
      {row.error && <span className="c-faint"> · {row.error}</span>}
      {row.status === "uncertain" && row.provider_id && <code>{row.provider_id}</code>}
      {row.status === "failed" && snapshot.can_compose && <Button disabled={busy} onClick={async () => { setBusy(true); const r = await api.retryDelivery(row.id); setBusy(false); if (!r.ok) setError(r.error.message); setRefresh(n => n + 1); }}>Retry submission</Button>}
    </li>)}</ul></details>}
  </section>;
}
