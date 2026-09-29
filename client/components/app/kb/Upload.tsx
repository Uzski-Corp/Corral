"use client";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ACCEPT_ATTR, FAILURE, MAX_FILES_PER_DROP, checkFile, checkUrl, extOf, formatBytes, queueSummary, takeDrop, type SourceKind } from "@/lib/kb/upload";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { Button, Segmented, cx } from "../primitives";
import { FormField, TextInput } from "../Form";
import { Spinner } from "../States";
import { FileTile, Progress, useTicker } from "./parts";

/* ------------------------------------------------------------ queue model */
export type QueueError = { title: string; fix: string; actions: ("retry" | "replace" | "skip")[] };
export type QueueItem = {
  id: string; name: string; size?: number; kind: SourceKind; host?: string; whole?: boolean;
  state: "queued" | "active" | "done" | "error"; stage: "upload" | "scan"; pct: number; error?: QueueError;
};
let seq = 0;
const nid = () => `q${++seq}`;

export function fileItem(f: { name: string; size: number }, existing: string[] = []): QueueItem {
  const c = checkFile(f);
  const base = { id: nid(), name: f.name, size: f.size, stage: "upload" as const, pct: 0 };
  if (!c.ok) return { ...base, kind: "pdf", state: "error", error: { title: c.title, fix: c.fix, actions: [] } };
  if (existing.includes(f.name)) return { ...base, kind: c.kind, state: "error", error: { ...FAILURE.duplicate, actions: ["replace", "skip"] } };
  return { ...base, kind: c.kind, state: "queued" };
}
export const failed = (it: QueueItem, f: keyof typeof FAILURE, actions: QueueError["actions"]): QueueItem =>
  ({ ...it, state: "error", error: { title: FAILURE[f].title, fix: FAILURE[f].fix, actions } });

/** Upload simulator standing in for ENG-66 progress events: two at a time, bigger files slower.
 *  A file with "password" in its name fails the scan, so the failure path can be tried live. */
export function useUploadQueue({ initial = [], live = true, onDone }: { initial?: QueueItem[]; live?: boolean; onDone?: (it: QueueItem) => void }) {
  const [items, setItems] = useState<QueueItem[]>(initial);
  const done = useRef(onDone);
  const reported = useRef(new Set(initial.filter((i) => i.state === "done").map((i) => i.id)));
  useEffect(() => { done.current = onDone; }, [onDone]);
  // Report each finished item once, outside the state updater (StrictMode runs updaters twice).
  useEffect(() => {
    for (const it of items) if (it.state === "done" && !reported.current.has(it.id)) { reported.current.add(it.id); done.current?.(it); }
  }, [items]);
  const busy = items.some((i) => i.state === "active" || i.state === "queued");
  const tick = useCallback(() => setItems((list) => {
    let slots = 2 - list.filter((i) => i.state === "active").length;
    return list.map((it) => {
      if (it.state === "queued" && slots > 0) { slots--; return { ...it, state: "active", stage: it.kind === "url" ? "scan" : "upload", pct: 0 }; }
      if (it.state !== "active") return it;
      if (it.stage === "upload") {
        const pct = it.pct + Math.max(8, 34 - ((it.size ?? 0) / 1048576) * 3);
        return pct >= 100 ? { ...it, stage: "scan", pct: 0 } : { ...it, pct };
      }
      if (/password/i.test(it.name)) return failed(it, "encrypted", ["replace", "skip"]);
      const pct = it.pct + 50;
      if (pct < 100) return { ...it, pct };
      return { ...it, state: "done" as const, pct: 100 };
    });
  }), []);
  useTicker(live && busy, 280, tick);
  const addFiles = useCallback((files: { name: string; size: number }[], existing: string[] = []) => {
    const { accepted, overflow } = takeDrop(files);
    const add = accepted.map((f) => fileItem(f, existing));
    if (overflow) add.push({ id: nid(), name: `${overflow} more ${overflow === 1 ? "file" : "files"}`, kind: "pdf", state: "error", stage: "upload", pct: 0,
      error: { title: `Only ${MAX_FILES_PER_DROP} files at a time`, fix: "Add the rest once these are in.", actions: [] } });
    setItems((l) => [...add, ...l]);
  }, []);
  const addUrl = useCallback((host: string, path: string, whole: boolean) =>
    setItems((l) => [{ id: nid(), name: `${host}${path}`, host, kind: "url", whole, state: "queued", stage: "scan", pct: 0 }, ...l]), []);
  const retry = useCallback((id: string) => setItems((l) => l.map((i) => (i.id === id ? { ...i, state: "queued", pct: 0, error: undefined, stage: "upload" } : i))), []);
  const dismiss = useCallback((id: string) => setItems((l) => l.filter((i) => i.id !== id)), []);
  const clearDone = useCallback(() => setItems((l) => l.filter((i) => i.state !== "done")), []);
  return { items, busy, addFiles, addUrl, retry, dismiss, clearDone };
}
export type UploadQueue = ReturnType<typeof useUploadQueue>;

/* ------------------------------------------------------------ drop zone */
export function DropZone({ onFiles, compact, children }: { onFiles: (f: File[]) => void; compact?: boolean; children?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();
  const drop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); };
  return (
    <div className={cx("k-drop", compact && "k-drop--compact", over && "is-over")}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <span className="k-drop__ic" aria-hidden="true"><Icon name="upload" size={compact ? 14 : 16} /></span>
      <span className="k-drop__txt">
        <span className="k-drop__lead">Drop files here, or <button type="button" className="c-link k-linkbtn" onClick={() => input.current?.click()} aria-describedby={`${id}-h`}>choose from your computer</button></span>
        <span id={`${id}-h`} className="k-drop__hint">PDF, DOCX or Markdown · up to 25 MB each · {MAX_FILES_PER_DROP} at a time</span>
      </span>
      {children}
      <input ref={input} type="file" multiple accept={ACCEPT_ATTR} hidden onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}

/* ------------------------------------------------------------ URL adder */
export function UrlAdder({ onAdd, defaultValue = "", defaultError }: { onAdd: (host: string, path: string, whole: boolean) => void; defaultValue?: string; defaultError?: string }) {
  const [v, setV] = useState(defaultValue);
  const [whole, setWhole] = useState("This page");
  const [err, setErr] = useState<string | undefined>(defaultError);
  const submit = () => {
    const r = checkUrl(v);
    if (!r.ok) { setErr(r.message); return; }
    onAdd(r.host, r.path, whole === "Whole section"); setV(""); setErr(undefined);
  };
  return (
    <FormField label="Or add a web page" error={err} help={err ? undefined : "Corral re-reads web pages every week, so the knowledge stays current."}
      action={<Segmented label="How much to read" options={["This page", "Whole section"]} value={whole} onChange={setWhole} />}>
      <form className="k-url" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextInput icon="globe" placeholder="coldtrace.io/pricing" value={v} onChange={(e) => { setV(e.target.value); if (err) setErr(undefined); }} inputMode="url" autoComplete="url" />
        <Button type="submit" disabled={!v.trim()}>Add page</Button>
      </form>
    </FormField>
  );
}

/* ------------------------------------------------------------ queue row */
const mb = (n?: number) => (n === undefined ? "" : formatBytes(n));
export function QueueRow({ it, onRetry, onDismiss, onReplace }: { it: QueueItem; onRetry?: () => void; onDismiss?: () => void; onReplace?: () => void }) {
  const upDone = it.size ? formatBytes(Math.round((it.size * it.pct) / 100)) : "";
  const line = it.state === "error" ? null
    : it.state === "queued" ? <>{mb(it.size) || (it.whole ? "Whole section" : "One page")} · Waiting</>
    : it.state === "done" ? <>{it.kind === "url" ? (it.whole ? "Whole section" : "One page") : mb(it.size)} · Added. Corral is reading it now</>
    : it.stage === "upload" ? <><span className="c-mono">{upDone} of {mb(it.size)}</span> · Uploading</>
    : <>{it.kind === "url" ? "Fetching the page" : "Checking the file"}</>;
  return (
    <li className={cx("k-q", `is-${it.state}`)}>
      <FileTile kind={it.kind} label={it.error && !it.error.actions.length && it.kind !== "url" ? (extOf(it.name) || "?").toUpperCase() : undefined} />
      <div className="k-q__body">
        <span className="k-q__name">{it.name}</span>
        {it.error ? <span className="k-q__err"><b>{it.error.title}.</b> {it.error.fix}</span> : <span className="k-q__meta">{line}</span>}
        {it.state === "active" && <Progress value={it.stage === "upload" ? it.pct : undefined} label={`${it.name}: ${it.stage === "upload" ? `uploading, ${Math.round(it.pct)}%` : "checking"}`} />}
      </div>
      <div className="k-q__acts">
        {it.state === "active" && it.stage === "scan" && <Spinner size={13} />}
        {it.state === "active" && it.stage === "upload" && <span className="c-mono k-q__pct">{Math.round(it.pct)}%</span>}
        {it.state === "done" && <span className="k-q__ok" role="img" aria-label="Added"><Icon name="check" size={13} /></span>}
        {it.error?.actions.includes("retry") && <Button onClick={onRetry}><Icon name="refresh" />Retry</Button>}
        {it.error?.actions.includes("replace") && <Button onClick={onReplace}>Replace</Button>}
        {(it.state !== "done") && (
          <button type="button" className="c-iconbtn" aria-label={it.state === "error" ? `Dismiss ${it.name}` : `Cancel ${it.name}`} onClick={onDismiss}><Icon name="x" /></button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------ dialog */
export function UploadDialog({ open, onClose, q, product, existing = [], inline, onReplace }: {
  open: boolean; onClose: () => void; q: UploadQueue; product: string; existing?: string[]; inline?: boolean; onReplace?: (it: QueueItem) => void;
}) {
  const bad = q.items.filter((i) => i.state === "error").length;
  return (
    <Dialog open={open} onClose={onClose} inline={inline} width={600} title="Add sources"
      description={<>Corral reads each one, splits it into passages it can search, and drafts what it learns into <b className="k-strong">{product}</b>.</>}
      footer={<>
        <span className="k-foot-sum" role="status">
          <span>{queueSummary(q.items)}</span>
          {q.busy && <em>Uploads keep going if you close this.</em>}
        </span>
        {bad > 0 && !q.busy && <Button variant="quiet" onClick={() => q.items.filter((i) => i.state === "error").forEach((i) => q.dismiss(i.id))}>Clear {bad === 1 ? "failure" : "failures"}</Button>}
        <Button variant={q.busy ? "default" : "primary"} onClick={onClose}>{q.busy ? "Hide" : "Done"}</Button>
      </>}>
      <DropZone compact={q.items.length > 0} onFiles={(f) => q.addFiles(f, existing)} />
      <UrlAdder onAdd={q.addUrl} />
      {q.items.length > 0 && (
        <section className="k-queue" aria-label="This upload">
          <ul>{q.items.map((it) => <QueueRow key={it.id} it={it} onRetry={() => q.retry(it.id)} onDismiss={() => q.dismiss(it.id)} onReplace={() => { onReplace?.(it); q.dismiss(it.id); }} />)}</ul>
        </section>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------ tray
   The dialog is closed but uploads are still going: a small corner card, never a blocking toast. */
export function UploadTray({ q, onOpen, inline }: { q: UploadQueue; onOpen: () => void; inline?: boolean }) {
  const [min, setMin] = useState(false);
  if (!q.items.length) return null;
  const active = q.items.filter((i) => i.state !== "done" || !q.busy);
  const bad = q.items.filter((i) => i.state === "error").length;
  const pcts = q.items.filter((i) => i.state !== "error").map((i) => (i.state === "done" ? 100 : i.state === "queued" ? 0 : i.stage === "upload" ? i.pct * 0.8 : 80 + i.pct * 0.2));
  const pct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  return (
    <div className={cx("k-tray c-app c-pop-in", inline && "k-tray--inline")} role="region" aria-label="Uploads">
      <div className="k-tray__head">
        {q.busy ? <span className="k-live" aria-hidden="true" /> : <span className={cx("k-dot", bad ? "is-bad" : "is-ok")} aria-hidden="true" />}
        <button type="button" className="k-tray__title" onClick={onOpen}>
          <b>{q.busy ? `Adding ${q.items.filter((i) => i.state !== "error").length} sources` : bad ? `${bad} ${bad === 1 ? "upload needs" : "uploads need"} you` : "Sources added"}</b>
          <span>{q.busy ? <span className="c-mono">{pct}%</span> : queueSummary(q.items)}</span>
        </button>
        <button type="button" className="c-iconbtn" aria-label={min ? "Show uploads" : "Minimise uploads"} aria-expanded={!min} onClick={() => setMin((m) => !m)}><Icon name={min ? "up" : "down"} /></button>
        {!q.busy && <button type="button" className="c-iconbtn" aria-label="Close uploads" onClick={q.clearDone}><Icon name="x" /></button>}
      </div>
      {q.busy && <Progress value={pct} label={`Uploads, ${pct}%`} />}
      {!min && (
        <ul className="k-tray__list">
          {active.slice(0, 4).map((i) => (
            <li key={i.id} className={cx(`is-${i.state}`)}>
              <FileTile kind={i.kind} size={20} /><span className="k-tray__name">{i.name}</span>
              <span className="k-tray__st">{i.state === "error" ? "Failed" : i.state === "done" ? <Icon name="check" size={12} /> : i.state === "queued" ? "Waiting" : i.stage === "scan" ? "Checking" : `${Math.round(i.pct)}%`}</span>
            </li>
          ))}
          {active.length > 4 && <li className="k-tray__more">{active.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}
