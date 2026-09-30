"use client";
/**
 * The knowledge base on the real API (PR #67). Same shapes as Bau's sample model, so
 * <KnowledgeBase> renders both with the same components:
 *
 * - useKbProducts:      the product list for the top-bar switcher and the page.
 * - useLiveUploadQueue: the Add sources queue: real uploads (two at a time, with upload progress),
 *                       web pages, and the API's refusals mapped onto the designed queue errors.
 * - useLiveKb:          sources for one product, polled while any is being read, plus re-read,
 *                       remove + Undo (restore), replace and the first passages of a source.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiSource, KbApi, Passage, Product } from "@/lib/api/kb";
import { errorDetail, type ApiError } from "@/lib/api/errors";
import { retryAfterSeconds } from "@/lib/auth/code";
import { toSources, type Person } from "@/lib/kb/map";
import { FAILURE, MAX_FILES_PER_DROP, checkFile, takeDrop } from "@/lib/kb/upload";
import type { Result } from "@/lib/result";
import { useToast } from "../Toaster";
import type { KSection, Source } from "./data";
import { fileItem, type QueueError, type QueueItem, type UploadQueue } from "./Upload";

/* ------------------------------------------------------------ products */
export type KbProducts = {
  phase: "idle" | "loading" | "error" | "ready";
  error: ApiError | null;
  products: Product[];
  selected: Product | null;
  select(id: string): void;
  retry(): void;
  /** The selected product, creating the first one (named after the workspace) when there is none. */
  ensure(): Promise<Result<Product, ApiError>>;
};

export function useKbProducts(api: KbApi | null, { active, workspace }: { active: boolean; workspace: string }): KbProducts | null {
  const [phase, setPhase] = useState<KbProducts["phase"]>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (!api || !active || started.current === attempt) return;
    started.current = attempt;
    const c = new AbortController();
    let done = false;
    setPhase("loading");
    void api.listProducts(c.signal).then((r) => {
      done = true;
      if (c.signal.aborted) return;
      if (!r.ok) { if (r.error.kind !== "aborted") { setError(r.error); setPhase("error"); } return; }
      // Oldest first, so the first product someone made stays the default.
      const list = [...r.value].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setProducts(list); setError(null); setPhase("ready");
      setSelectedId((id) => (id && list.some((p) => p.id === id) ? id : list[0]?.id ?? null));
    });
    // Cancelled before it answered (closed, or unmounted): load again next time.
    return () => { if (!done) { c.abort(); if (started.current === attempt) started.current = -1; } };
  }, [api, active, attempt]);

  const selected = useMemo(() => products.find((p) => p.id === selectedId) ?? null, [products, selectedId]);
  const ensure = useCallback(async (): Promise<Result<Product, ApiError>> => {
    if (selected) return { ok: true, value: selected };
    const r = await api!.createProduct({ name: workspace });
    if (r.ok) { setProducts((l) => [...l, r.value]); setSelectedId(r.value.id); }
    return r;
  }, [api, selected, workspace]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!api) return null;
  return { phase, error, products, selected, select: setSelectedId, retry, ensure };
}

/* ------------------------------------------------------------ upload queue */
const MB = 1048576;
export type UploadTarget = {
  upload(file: File, o: { replaceSourceId?: string; onProgress(pct: number): void; signal: AbortSignal }): Promise<Result<ApiSource, ApiError>>;
  addUrl(url: string, scope: "page" | "section", signal: AbortSignal): Promise<Result<ApiSource, ApiError>>;
};

const queueError = (title: string, fix: string, actions: QueueError["actions"] = []): QueueError => ({ title, fix, actions });
const serverSentence = (e: ApiError) => (e.message.endsWith(".") ? e.message : `${e.message}.`);

/** An API refusal (or no answer) → the queue row's designed error, or "wait" for a 429. */
export function queueFailure(e: ApiError, it: Pick<QueueItem, "name" | "size" | "kind">): { wait: number } | { error: QueueError; existingId?: string } {
  if (e.kind === "http") {
    if (e.status === 429) return { wait: retryAfterSeconds(e.retryAfter) };
    if (e.status === 409 && e.code === "duplicate") {
      const existingId = typeof e.details?.existing_source_id === "string" ? e.details.existing_source_id : undefined;
      return { error: queueError(FAILURE.duplicate.title, FAILURE.duplicate.fix, it.kind === "url" ? ["skip"] : ["replace", "skip"]), existingId };
    }
    // kb_full, url_invalid, url_not_public, type_mismatch: the server's sentence is the fix.
    if (e.status === 409) return { error: queueError("Couldn’t add it", serverSentence(e)) };
    const local = it.kind === "url" ? null : checkFile({ name: it.name, size: e.status === 413 ? Math.max(it.size ?? 0, 25 * MB + 1) : e.status === 422 && e.code === "empty" ? 0 : it.size ?? 1 });
    if (local && !local.ok) return { error: queueError(local.title, local.fix) };
    if (e.status === 415 || e.status === 422) return { error: queueError(it.kind === "url" ? "Couldn’t add this page" : FAILURE.unreadable.title, serverSentence(e)) };
  }
  return { error: queueError(FAILURE.dropped.title, FAILURE.dropped.fix, ["retry"]) };
}

type Job = { file?: File; url?: string; scope?: "page" | "section"; replaceSourceId?: string; existingId?: string; abort?: AbortController; timer?: ReturnType<typeof setTimeout> };
let seq = 0;

/** The same surface as the sample `useUploadQueue`, doing the real thing. */
export function useLiveUploadQueue({ target, onAdded, takeReplace }: {
  target: UploadTarget | null;
  onAdded: (source: ApiSource, it: QueueItem) => void;
  /** Consumed by the next file: the source a "Replace file" asked to replace. */
  takeReplace?: () => string | undefined;
}): UploadQueue & { replace(it: QueueItem, existingId?: string): void; existingIdOf(itemId: string): string | undefined } {
  const [items, setItems] = useState<QueueItem[]>([]);
  const jobs = useRef(new Map<string, Job>());
  const added = useRef(onAdded);
  useEffect(() => { added.current = onAdded; }, [onAdded]);
  const patch = useCallback((id: string, p: Partial<QueueItem>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const run = useCallback((it: QueueItem) => {
    const job = jobs.current.get(it.id);
    if (!job || !target) return;
    const abort = new AbortController();
    job.abort = abort;
    const settle = (r: Result<ApiSource, ApiError>) => {
      if (abort.signal.aborted || !jobs.current.has(it.id)) return;
      job.abort = undefined;   // finished: a retry starts it again with a fresh controller
      if (r.ok) { patch(it.id, { state: "done", pct: 100 }); added.current(r.value, it); return; }
      const f = queueFailure(r.error, it);
      if ("wait" in f) {
        patch(it.id, { state: "queued", stage: it.kind === "url" ? "scan" : "upload", pct: 0 });
        job.timer = setTimeout(() => { job.timer = undefined; patch(it.id, { state: "queued" }); setItems((l) => [...l]); }, f.wait * 1000);
        return;
      }
      job.existingId = f.existingId;
      patch(it.id, { state: "error", error: f.error });
    };
    if (job.url) {
      patch(it.id, { state: "active", stage: "scan", pct: 0 });
      void target.addUrl(job.url, job.scope ?? "page", abort.signal).then(settle);
      return;
    }
    patch(it.id, { state: "active", stage: "upload", pct: 0 });
    void target.upload(job.file!, {
      replaceSourceId: job.replaceSourceId, signal: abort.signal,
      onProgress: (pct) => { if (!abort.signal.aborted) patch(it.id, pct >= 100 ? { stage: "scan", pct: 0 } : { pct }); },
    }).then(settle);
  }, [target, patch]);

  // Two at a time, as the sample queue does; a 429'd item waits for its Retry-After.
  useEffect(() => {
    let slots = 2 - items.filter((i) => i.state === "active").length;
    for (const it of items) {
      if (slots <= 0) break;
      const job = jobs.current.get(it.id);
      if (it.state === "queued" && job && !job.timer && !job.abort) { slots--; run(it); }
    }
  }, [items, run]);
  useEffect(() => () => { for (const j of jobs.current.values()) { j.abort?.abort(); if (j.timer) clearTimeout(j.timer); } }, []);

  const addFiles = useCallback((files: { name: string; size: number }[], existing: string[] = []) => {
    const { accepted, overflow } = takeDrop(files);
    const replaceId = takeReplace?.();
    const add = accepted.map((f, i) => {
      const it = fileItem(f, replaceId && i === 0 ? [] : existing);
      // A duplicate keeps its file too, so its Replace can upload it.
      if (f instanceof Blob) jobs.current.set(it.id, { file: f as File, replaceSourceId: i === 0 ? replaceId : undefined });
      else if (it.state === "queued") return { ...it, state: "error" as const, error: queueError(FAILURE.dropped.title, FAILURE.dropped.fix) };
      return it;
    });
    if (overflow) add.push({ id: `lq${++seq}`, name: `${overflow} more ${overflow === 1 ? "file" : "files"}`, kind: "pdf", state: "error", stage: "upload", pct: 0,
      error: queueError(`Only ${MAX_FILES_PER_DROP} files at a time`, "Add the rest once these are in.") });
    setItems((l) => [...add, ...l]);
  }, [takeReplace]);

  const addUrl = useCallback((host: string, path: string, whole: boolean) => {
    const id = `lq${++seq}`;
    jobs.current.set(id, { url: `https://${host}${path}`, scope: whole ? "section" : "page" });
    setItems((l) => [{ id, name: `${host}${path}`, host, kind: "url", whole, state: "queued", stage: "scan", pct: 0 }, ...l]);
  }, []);

  const retry = useCallback((id: string) => setItems((l) => l.map((i) => (i.id === id ? { ...i, state: "queued", pct: 0, error: undefined, stage: i.kind === "url" ? "scan" : "upload" } : i))), []);
  const dismiss = useCallback((id: string) => {
    const j = jobs.current.get(id);
    j?.abort?.abort(); if (j?.timer) clearTimeout(j.timer);
    jobs.current.delete(id);
    setItems((l) => l.filter((i) => i.id !== id));
  }, []);
  const clearDone = useCallback(() => setItems((l) => { for (const i of l) if (i.state === "done") jobs.current.delete(i.id); return l.filter((i) => i.state !== "done"); }), []);
  /** A duplicate's Replace: upload the same file again, replacing the source it duplicates. */
  const replace = useCallback((it: QueueItem, existingId?: string) => {
    const old = jobs.current.get(it.id);
    const target = existingId ?? old?.existingId;
    if (!old?.file || !target) return;
    const id = `lq${++seq}`;
    jobs.current.set(id, { file: old.file, replaceSourceId: target });
    setItems((l) => [{ ...it, id, state: "queued", stage: "upload", pct: 0, error: undefined }, ...l]);
  }, []);
  const existingIdOf = useCallback((itemId: string) => jobs.current.get(itemId)?.existingId, []);

  const busy = items.some((i) => i.state === "active" || i.state === "queued");
  return { items, busy, addFiles, addUrl, retry, dismiss, clearDone, replace, existingIdOf };
}

/* ------------------------------------------------------------ sources */
export const POLL_MS = 2_000;
const EMPTY: ApiSource[] = [];
const defaultNow = () => new Date();
const MAX_BACKOFF_MS = 30_000;
const CLOCK_MS = 60_000;

export type LiveKb = {
  phase: "loading" | "error" | "ready";
  errorDetail: string | undefined;
  retry(): void;
  sources: Source[];
  knowledge: KSection[];
  setKnowledge: (next: KSection[] | ((k: KSection[]) => KSection[])) => void;
  q: ReturnType<typeof useLiveUploadQueue>;
  existing: string[];
  reread(id: string): void;
  remove(id: string): void;
  replace(id: string): void;
  replaceFromQueue(it: QueueItem): void;
  passages: Record<string, { loc: string; text: string }[] | undefined>;
  loadPassages(id: string): void;
};

const upsert = (list: ApiSource[], s: ApiSource) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list]);
/** Bau's passage column fits a short locator ("p. 14", "§2"). Markdown passages come back located by
 *  their heading ("ColdTrace T4 wireless temperature sensors"), which has no design yet, so those show "§n". */
export const MAX_LOC = 10;
export const passageRows = (list: Passage[]) =>
  list.map((p) => ({ loc: p.loc && p.loc.length <= MAX_LOC ? p.loc : `§${p.ordinal + 1}`, text: p.text }));

export function useLiveKb({ api, products, me, now: nowProp }: { api: KbApi; products: KbProducts; me: Person; now?: () => Date }): LiveKb {
  const toast = useToast();
  const clock = useRef(nowProp ?? defaultNow);
  const product = products.selected;
  const productId = product?.id ?? null;
  const [raw, setRaw] = useState<ApiSource[]>([]);
  /** Which load (product + attempt) the list on screen came from, and whether it worked. */
  const [fetched, setFetched] = useState<{ key: string; ok: boolean } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => (nowProp ?? defaultNow)());
  const [knowledge, setKnowledge] = useState<KSection[]>([]);
  const [passages, setPassages] = useState<LiveKb["passages"]>({});
  const [attempt, setAttempt] = useState(0);
  const replacing = useRef<string | undefined>(undefined);
  const inflight = useRef(false);

  const key = `${productId ?? ""}|${attempt}`;
  const load = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (!productId || inflight.current) return true;
    inflight.current = true;
    const r = await api.listSources(productId, { signal });
    inflight.current = false;
    if (signal?.aborted) return true;
    setNow(clock.current());
    if (r.ok) { setRaw(r.value); setError(null); setFetched({ key, ok: true }); return true; }
    if (r.error.kind === "aborted") return true;
    setError(r.error);
    setFetched((f) => (f?.key === key && f.ok ? f : { key, ok: false }));   // a failed poll keeps what's on screen
    return false;
  }, [api, productId, key]);

  useEffect(() => {
    if (!productId) return;
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [productId, load]);

  // Products first: their failure is the page's failure; no products yet is an empty knowledge base.
  const phase: LiveKb["phase"] = products.phase === "error" ? "error"
    : products.phase !== "ready" ? "loading"
    : !productId ? "ready"
    : fetched?.key !== key ? "loading"
    : fetched.ok ? "ready" : "error";
  const shownError = products.phase === "error" ? products.error : error;
  const shown = productId && fetched?.key === key ? raw : EMPTY;

  // Poll while anything is being read; back off while the API isn't answering; pause in a hidden tab.
  const busy = shown.some((s) => s.status === "processing");
  useEffect(() => {
    if (!busy || phase !== "ready") return;
    let wait = POLL_MS;
    let t: ReturnType<typeof setTimeout>;
    let stopped = false;
    const c = new AbortController();
    const tick = async () => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        const good = await load(c.signal);
        wait = good ? POLL_MS : Math.min(MAX_BACKOFF_MS, wait * 2);
      }
      if (!stopped) t = setTimeout(tick, wait);
    };
    t = setTimeout(tick, wait);
    return () => { stopped = true; clearTimeout(t); c.abort(); };
  }, [busy, phase, load]);

  // "just now" becomes "2 min ago" without a reload.
  useEffect(() => { const t = setInterval(() => setNow(clock.current()), CLOCK_MS); return () => clearInterval(t); }, []);

  const sources = useMemo(() => toSources(shown, { now, me }), [shown, now, me]);
  // Toast actions call back into the latest reread/remove.
  const self = useRef<{ reread(id: string): void; remove(id: string): void } | null>(null);

  const target = useMemo<UploadTarget>(() => ({
    upload: async (file, o) => {
      const p = await products.ensure();
      return p.ok ? api.uploadFile(p.value.id, file, o) : p;
    },
    addUrl: async (url, scope, signal) => {
      const p = await products.ensure();
      return p.ok ? api.addUrl(p.value.id, { url, scope }, signal) : p;
    },
  }), [api, products]);
  const onAdded = useCallback((s: ApiSource) => {
    setRaw((l) => upsert(l, s).filter((x) => !x.deletedAt));
  }, []);
  const takeReplace = useCallback(() => { const id = replacing.current; replacing.current = undefined; return id; }, []);
  const q = useLiveUploadQueue({ target, onAdded, takeReplace });

  const reread = useCallback((id: string) => {
    if (!productId) return;
    const before = raw.find((s) => s.id === id);
    if (!before) return;
    const name = before.name;
    setRaw((l) => l.map((s) => (s.id === id ? { ...s, status: "processing", stage: s.kind === "url" ? "upload" : "scan", stagePct: 0, failure: null, failureStage: null } : s)));
    const attemptOnce = (): void => {
      void api.reread(productId, id).then((r) => {
        if (r.ok) { setRaw((l) => upsert(l, r.value)); toast({ icon: "refresh", children: `Reading ${name} again`, meta: "the current version stays searchable meanwhile" }); return; }
        if (r.error.kind === "http" && r.error.status === 429) { setTimeout(attemptOnce, retryAfterSeconds(r.error.retryAfter) * 1000); return; }
        setRaw((l) => l.map((s) => (s.id === id ? before : s)));
        toast({ tone: "error", children: `Couldn’t read ${name} again. Nothing changed.`, meta: errorDetail(r.error), action: { label: "Try again", onClick: () => self.current?.reread(id) } });
      });
    };
    attemptOnce();
  }, [api, productId, raw, toast]);

  const remove = useCallback((id: string) => {
    if (!productId) return;
    const gone = raw.find((s) => s.id === id);
    if (!gone) return;
    const before = { raw, knowledge };
    setRaw((l) => l.filter((s) => s.id !== id));
    setKnowledge((ks) => ks.map((sec) => ({ ...sec, items: sec.items.map((i) => (i.cites.some((c) => c.src === id) && i.cites.every((c) => c.src === id) ? { ...i, flag: { f: "stale" as const, removed: gone.name, when: "today" } } : i)) })));
    void api.remove(productId, id).then((r) => {
      if (!r.ok) {
        setRaw(before.raw); setKnowledge(before.knowledge);
        toast({ tone: "error", children: `Couldn’t remove ${gone.name}. Nothing changed.`, meta: errorDetail(r.error), action: { label: "Try again", onClick: () => self.current?.remove(id) } });
        return;
      }
      toast({ tone: "success", children: `Removed ${gone.name}`, action: { label: "Undo", onClick: () => {
        void api.restore(productId, id).then((u) => {
          if (u.ok) { setRaw((l) => upsert(l, u.value)); setKnowledge(before.knowledge); return; }
          toast({ tone: "error", children: `Couldn’t bring back ${gone.name}.`, meta: errorDetail(u.error) });
        });
      } } });
    });
  }, [api, productId, raw, knowledge, toast]);

  useEffect(() => { self.current = { reread, remove }; }, [reread, remove]);

  const replace = useCallback((id: string) => { replacing.current = id; }, []);
  const replaceFromQueue = useCallback((it: QueueItem) => {
    const existingId = q.existingIdOf(it.id) ?? raw.find((s) => s.name === it.name)?.id;
    q.replace(it, existingId);
    toast({ icon: "upload", children: `Replacing ${it.name}`, meta: "the old copy stays searchable until the new one is read" });
  }, [q, raw, toast]);

  const loadPassages = useCallback((id: string) => {
    if (!productId || passages[id]) return;
    const s = raw.find((x) => x.id === id);
    if (!s || s.passageCount === 0) return;
    void api.passages(productId, id, { limit: 3 }).then((r) => { if (r.ok) setPassages((m) => ({ ...m, [id]: passageRows(r.value) })); });
  }, [api, productId, passages, raw]);

  const retry = useCallback(() => { if (products.phase === "error") products.retry(); else setAttempt((n) => n + 1); }, [products]);
  const existing = useMemo(() => shown.map((s) => s.name), [shown]);

  return {
    phase, errorDetail: shownError ? errorDetail(shownError) : undefined, retry, sources, knowledge, setKnowledge, q, existing,
    reread, remove, replace, replaceFromQueue, passages, loadPassages,
  };
}

