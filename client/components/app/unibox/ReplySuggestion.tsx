"use client";
import { useEffect, useRef, useState } from "react";
import { replyApiFor } from "@/lib/api";
import type { ReplyOptions, ReplyRun } from "@/lib/api/replies";
import { Button } from "../primitives";

export function ReplySuggestion({ threadId, hasText, apply, disabled = false }: { threadId: string; hasText: boolean; disabled?: boolean; apply: (text: string) => void }) {
  const [api] = useState(() => replyApiFor());
  const [options, setOptions] = useState<ReplyOptions | null>(null);
  const [product, setProduct] = useState("");
  const [run, setRun] = useState<ReplyRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const attempt = useRef<{ product: string; id: string } | null>(null);
  const key = `corral:ai-run:${threadId}`;
  const running = !!run && ["queued", "running", "canceling"].includes(run.status);
  useEffect(() => {
    let stopped = false;
    void api.options().then(r => { if (stopped) return; if (r.ok) { setOptions(r.value); if (r.value.products.length === 1) setProduct(r.value.products[0].id); } else setError(r.error.message); });
    try { const id = localStorage.getItem(key); if (id) void api.get(id).then(r => { if (!stopped && r.ok) setRun(r.value); }); } catch { /* persistence unavailable */ }
    return () => { stopped = true; };
  }, [api, key]);
  useEffect(() => {
    if (!run || !running) return;
    let stopped = false;
    const timer = setInterval(() => { void api.get(run.id).then(r => { if (stopped) return; if (r.ok) { setRun(r.value); setError(""); } else setError(r.error.message); }); }, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [api, run?.id, running]);
  async function generate() {
    if (busy || !product) return;
    setBusy(true); setError(""); setReplace(false);
    if (!attempt.current || attempt.current.product !== product) attempt.current = { product, id: crypto.randomUUID() };
    const result = await api.start({ thread_id: threadId, product_id: product, request_id: attempt.current.id });
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    attempt.current = null; setRun(result.value);
    try { localStorage.setItem(key, result.value.id); } catch { /* keep active run in memory */ }
  }
  function accept() { if (!run?.result) return; if (hasText && !replace) { setReplace(true); return; } apply(run.result.body); setReplace(false); }
  return <div className="demo-suggestion">
    {options?.available ? <div className="demo-mail-actions">
      <label>Product knowledge <select value={product} disabled={busy || running} onChange={e => setProduct(e.target.value)}><option value="">Choose product</option>{options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <Button disabled={busy || running || !product} onClick={() => void generate()}>{busy ? "Starting…" : running ? "Drafting…" : "Generate reply"}</Button>
      {running && <Button disabled={busy || run.status === "canceling"} onClick={async () => { if (!run) return; setBusy(true); const r = await api.cancel(run.id); setBusy(false); if (r.ok) setRun(r.value); else setError(r.error.message); }}>Cancel</Button>}
    </div> : <p className="c-faint">AI drafting is not configured. You can write a reply below.</p>}
    {options?.available && !options.products.length && <p>Add a product and its knowledge sources to generate a grounded reply.</p>}
    {error && <p role="alert">{error}</p>}
    {run?.error && <p role="status">{run.error}</p>}
    {run?.status === "succeeded" && run.result && <>
      {run.stale && <p role="status">The conversation changed since this suggestion started. Review it against the latest reply.</p>}
      <p className="demo-suggestion-body">{run.result.body}</p>
      {!!run.sources.length && <details><summary>Knowledge consulted</summary>{run.sources.map(s => <p key={s.id}><strong>{s.name}</strong><br />{s.text}</p>)}</details>}
      <Button disabled={disabled} onClick={accept}>{replace ? "Replace my current text" : "Use suggestion"}</Button>
      {replace && <Button variant="quiet" onClick={() => setReplace(false)}>Keep my text</Button>}
    </>}
  </div>;
}
