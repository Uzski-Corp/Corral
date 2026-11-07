"use client";
import { ReplySuggestion } from "./ReplySuggestion";
import { useState } from "react";
import { Button } from "../primitives";
import type { Thread } from "../data";

export type SendReply = (id: string, body: string, requestId: string) => Promise<void>;

/** Live transport never uses the design-review timer or claims delivery on a click. */
export function LiveReply({ thread, send }: { thread: Thread; send: SendReply }) {
  const key = `corral:reply:${thread.id}`;
  const [body, setBody] = useState(() => {
    try { return localStorage.getItem(key) ?? thread.draft?.join("\n\n") ?? ""; }
    catch { return thread.draft?.join("\n\n") ?? ""; }
  });
  const [request, setRequest] = useState<{ body: string; id: string } | null>(() => {
    try { const value = JSON.parse(localStorage.getItem(`${key}:attempt`) || "null"); return value && typeof value.body === "string" && typeof value.id === "string" ? value : null; }
    catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function submit() {
    if (busy || !body.trim()) return;
    const attempt = request?.body === body ? request : { body, id: crypto.randomUUID() };
    setRequest(attempt);
    try { localStorage.setItem(`${key}:attempt`, JSON.stringify(attempt)); } catch { /* retain retry identity in memory */ }
    setBusy(true); setError(""); setNotice("");
    try {
      await send(thread.id, body, attempt.id);
      setNotice("Queued for the demo mailbox. Delivery status appears in the conversation.");
      setBody(""); setRequest(null);
      try { localStorage.removeItem(key); localStorage.removeItem(`${key}:attempt`); } catch { /* storage may be unavailable */ }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not queue your reply. Your text is saved here."); }
    finally { setBusy(false); }
  }
  return <section className="demo-mail-reply" aria-label="Write a reply">
    <ReplySuggestion disabled={busy} threadId={thread.id} hasText={!!body.trim()} apply={text => { setBody(text); try { localStorage.setItem(key, text); } catch { /* keep in memory */ } }} />
    <label htmlFor={`reply-${thread.id}`}>Your reply</label>
    <textarea id={`reply-${thread.id}`} rows={6} value={body} disabled={busy} maxLength={20000}
      onChange={(e) => { setBody(e.target.value); setNotice(""); try { localStorage.setItem(key, e.target.value); } catch { /* retain in memory */ } }} />
    <div className="demo-mail-actions"><Button variant="primary" disabled={busy || !body.trim()} onClick={() => void submit()}>{busy ? "Queueing…" : "Send reply"}</Button><span className="c-faint">Demo mailbox · approved recipients only</span></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
