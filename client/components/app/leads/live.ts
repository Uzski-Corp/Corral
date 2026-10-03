"use client";
/**
 * Companies, people, segments and CSV import on the real API (PR #71, ENG-81). Same shapes as Bau's
 * sample table, so <LeadsView> renders both with the same markup:
 *
 * - useLeadProduct:  whose fit the table shows (the workspace's first product, as the knowledge base picks it).
 * - useLiveSegments: the saved segments for the sidebar, the "Add to segment" menu and the segment view.
 * - useLiveLeads:    one page at a time of the filtered, sorted table (server-side), the tab counts,
 *                    status changes, segments, merge, unsubscribe, the enroll dry run and the company detail.
 * - useLivePreview:  the segment builder's "Matches now" count and first matches.
 * - importRunner:    the import dialog's dry run, upload and progress polling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KbApi } from "@/lib/api/kb";
import type { ApiCompany, ApiCompanyDetail, ApiImport, ApiRule, ApiSelection, CompanyPage, DryRun, EnrollPlan, ImportFileInput, LeadsApi, ReplyCode } from "@/lib/api/leads";
import { PAGE_SIZE } from "@/lib/api/leads";
import { errorDetail, type ApiError } from "@/lib/api/errors";
import { err, ok, type Result } from "@/lib/result";
import type { FitStatus } from "@/lib/fit/score";
import type { Existing } from "@/lib/leads/import";
import {
  REPLY_LABEL, companyToLead, detailFromApi, emailCodeOf, fitStatusOf, probableDuplicates, replyCodeOf, ruleFromApi, rulesToApi,
  selectionToApi, sortToApi, tabRules, viewQuery,
} from "@/lib/leads/map";
import type { LeadLike, Match, Rule, Sort } from "@/lib/leads/segment";
import type { Lead } from "../data";
import type { Status } from "../primitives";
import { useToast } from "../Toaster";
import type { LeadDetailData } from "./data";

const f = (n: number) => n.toLocaleString("en");
const defaultNow = () => new Date();

/* ------------------------------------------------------------ product */
/** The product whose fit the table shows: the oldest one, as the knowledge base defaults to. */
export function useLeadProduct(kb: KbApi | null): { productId: string | null; productName?: string | null; ready: boolean } {
  const [state, setState] = useState<{ productId: string | null; productName?: string | null; ready: boolean }>({ productId: null, ready: false });
  useEffect(() => {
    if (!kb) return;
    const c = new AbortController();
    void kb.listProducts(c.signal).then((r) => {
      if (c.signal.aborted) return;
      // No product (or no answer): the table still loads, without fit.
      const first = r.ok ? [...r.value].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] : undefined;
      setState({ productId: first?.id ?? null, productName: first?.name ?? null, ready: true });
    });
    return () => c.abort();
  }, [kb]);
  return state;
}

/* ------------------------------------------------------------ segments */
export type LiveSegment = { id: string; name: string; count: number; rules: Rule[]; match: Match };
export type LiveSegments = {
  phase: "loading" | "error" | "ready";
  list: LiveSegment[];
  byName(name: string | undefined): LiveSegment | undefined;
  refresh(): void;
};

export function useLiveSegments(api: LeadsApi | null): LiveSegments | null {
  const [list, setList] = useState<LiveSegment[]>([]);
  const [phase, setPhase] = useState<LiveSegments["phase"]>("loading");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!api) return;
    const c = new AbortController();
    void (async () => {
      const r = await api.segments(c.signal);
      if (c.signal.aborted) return;
      if (!r.ok) { if (r.error.kind !== "aborted") setPhase("error"); return; }
      // SegmentOut has no count or rules: each segment's detail carries them.
      const details = await Promise.all(r.value.map((s) => api.segment(s.id, c.signal)));
      if (c.signal.aborted) return;
      setList(r.value.map((s, i) => {
        const d = details[i];
        return d.ok ? { id: s.id, name: s.name, count: d.value.count, rules: d.value.rules.map(ruleFromApi), match: d.value.match }
          : { id: s.id, name: s.name, count: 0, rules: [], match: s.match };
      }).reverse());   // oldest first, like the sample sidebar
      setPhase("ready");
    })();
    return () => c.abort();
  }, [api, version]);
  const byName = useCallback((name: string | undefined) => list.find((s) => s.name === name), [list]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  if (!api) return null;
  return { phase, list, byName, refresh };
}

/* ------------------------------------------------------------ builder preview */
export type Preview = { count: number; peek: LeadLike[] };
export const PREVIEW_DEBOUNCE_MS = 250;

/** POST /segments/preview for the builder's rules (finished ones only), debounced. Null until it answers. */
export function useLivePreview(api: LeadsApi | null, { rules, match, productId, enabled, now = defaultNow }: {
  rules: Rule[]; match: Match; productId: string | null; enabled: boolean; now?: () => Date;
}): Preview | null {
  const [preview, setPreview] = useState<{ key: string; value: Preview } | null>(null);
  const apiRules = useMemo(() => rulesToApi(rules, productId), [rules, productId]);
  const key = JSON.stringify([apiRules, match]);
  useEffect(() => {
    if (!api || !enabled || !apiRules.length) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      void api.preview(apiRules, match, c.signal).then((r) => {
        if (!c.signal.aborted && r.ok) setPreview({ key, value: { count: r.value.count, peek: r.value.peek.map((x) => companyToLead(x, now())) } });
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => { clearTimeout(t); c.abort(); };
  }, [api, enabled, apiRules, match, key, now]);
  return enabled && apiRules.length && preview?.key === key ? preview.value : null;
}

/* ------------------------------------------------------------ import */
export const IMPORT_POLL_MS = 1_000;
const MAX_POLL_BACKOFF_MS = 15_000;
export type ImportRunner = {
  /** The server's plan for this file (dry run): nothing is stored. */
  plan(i: ImportFileInput, signal?: AbortSignal): Promise<Result<DryRun, ApiError>>;
  /** Upload, then follow the import until it's done or failed. `onProgress` gets 0–100. */
  run(i: ImportFileInput, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<Result<ApiImport, ApiError>>;
  errorsUrl(importId: string): string;
};
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
});

export function importRunner(api: LeadsApi, { pollMs = IMPORT_POLL_MS, onFinished }: { pollMs?: number; onFinished?: (i: ApiImport) => void } = {}): ImportRunner {
  return {
    plan: (i, signal) => api.dryRun(i, signal),
    async run(i, onProgress, signal) {
      const started = await api.startImport(i, { signal });
      if (!started.ok) return started;
      let row = started.value, wait = pollMs;
      onProgress(row.progressPct);
      while (row.status === "queued" || row.status === "running") {
        await sleep(wait, signal);
        if (signal?.aborted) return err({ kind: "aborted", op: `GET /api/v1/lead-imports/${row.id}`, message: "request was cancelled" });
        const r = await api.getImport(row.id, signal);
        if (!r.ok) { if (r.error.kind === "aborted") return r; wait = Math.min(MAX_POLL_BACKOFF_MS, wait * 2); continue; }
        wait = pollMs; row = r.value;
        onProgress(row.progressPct);
      }
      onFinished?.(row);
      return ok(row);
    },
    errorsUrl: (id) => api.errorsUrl(id),
  };
}

/* ------------------------------------------------------------ the table */
export type LeadsTab = "all" | "fit" | "seq" | "rep";
const TAB_IDS: LeadsTab[] = ["all", "fit", "seq", "rep"];
type Loaded = { key: string; rows: ApiCompany[]; cursor: string | null; total: number };

export type LiveLeads = {
  phase: "loading" | "error" | "ready";
  errorDetail: string;
  retry(): void;
  /** The loaded rows (server-filtered and sorted), as the table's `Lead`. */
  rows: Lead[];
  total: number;
  hasMore: boolean;
  more(): void;
  /** Tab counts (companies view); undefined until they answer. */
  counts: Partial<Record<LeadsTab, number>>;
  /** No company at all yet: Bau's first-run screen. */
  empty: boolean;
  /** A tab plus "match any" chips can't be one flat rule list: the chips were applied without the tab. */
  tabDropped: boolean;
  fitOf(id: string): FitStatus | undefined;
  findLead(id: string): Lead | undefined;
  detailOf(id: string): LeadDetailData | undefined;
  loadDetail(id: string): void;
  /** Set reply (or email) status for ids, or "all" for everything the view matches. */
  setStatus(ids: string[] | "all", s: Status, field?: "reply" | "email"): void;
  addToSegment(segment: LiveSegment, ids: string[] | "all"): void;
  createSegment(body: { name: string; rules: Rule[]; match: Match; companyIds?: string[]; fromImportId?: string }): Promise<boolean>;
  saveSegmentRules(rules: Rule[], match: Match): Promise<boolean>;
  merge(duplicateId: string): Promise<string | null>;
  keepBoth(id: string): void;
  enrollPlan(ids: string[] | "all"): Promise<Result<EnrollPlan, ApiError>>;
  importer: ImportRunner;
  existing: Existing[];
  reload(): void;
};

export function useLiveLeads(input: { api: LeadsApi; productId: string | null; productReady: boolean; segments: LiveSegments | null } | null, view: {
  seg?: string; tab: string; rules: Rule[]; match: Match; sort: Sort; now?: () => Date;
}): LiveLeads | null {
  const toast = useToast();
  const api = input?.api ?? null;
  const productId = input?.productId ?? null;
  const clock = useRef(view.now ?? defaultNow);
  const segment = view.seg ? input?.segments?.byName(view.seg) : undefined;
  const segWaiting = !!view.seg && !segment && input?.segments?.phase === "loading";
  const q = useMemo(() => (view.seg ? { rules: [] as ApiRule[], match: "all" as Match, tabDropped: false } : viewQuery(view.tab, view.rules, view.match, productId)), [view.seg, view.tab, view.rules, view.match, productId]);
  const sort = useMemo(() => sortToApi(view.sort, productId), [view.sort, productId]);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([segment?.id ?? null, q.rules, q.match, sort, productId, attempt]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<{ key: string; error: ApiError } | null>(null);
  const [now, setNow] = useState(() => (view.now ?? defaultNow)());
  const [counts, setCounts] = useState<Partial<Record<LeadsTab, number>>>({});
  const [countsVersion, setCountsVersion] = useState(0);
  const recount = useCallback(() => setCountsVersion((n) => n + 1), []);
  const [details, setDetails] = useState<Record<string, ApiCompanyDetail>>({});
  const [keptBoth, setKeptBoth] = useState<Set<string>>(() => new Set());
  const self = useRef<{ setStatus: LiveLeads["setStatus"] } | null>(null);

  const fetchPage = useCallback((cursor: string | null, signal?: AbortSignal): Promise<Result<CompanyPage, ApiError>> => {
    const body = { rules: q.rules, match: q.match, sort, productId, cursor, limit: PAGE_SIZE };
    return segment ? api!.members(segment.id, body, signal) : api!.query(body, signal);
  }, [api, q, sort, productId, segment]);

  const ready = !!api && !!input?.productReady && !segWaiting;
  const noFit = !view.seg && view.tab === "fit" && !productId;
  useEffect(() => {
    if (!ready) return;
    if (noFit) return;
    const c = new AbortController();
    void fetchPage(null, c.signal).then((r) => {
      if (c.signal.aborted) return;
      setNow(clock.current());
      if (r.ok) { setLoaded({ key, rows: r.value.data, cursor: r.value.nextCursor, total: r.value.total }); setFailed(null); }
      else if (r.error.kind !== "aborted") setFailed({ key, error: r.error });
    });
    return () => c.abort();
  }, [ready, key, fetchPage, noFit]);

  // Tab counts: one row each, just for `total`.
  const countsKey = JSON.stringify([productId, attempt, countsVersion]);
  useEffect(() => {
    if (!ready || view.seg) return;
    const c = new AbortController();
    for (const t of TAB_IDS) {
      if (t === "fit" && !productId) continue;
      void api!.query({ rules: tabRules(t, productId), match: "all", productId, limit: 1 }, c.signal).then((r) => {
        if (!c.signal.aborted && r.ok) setCounts((m) => ({ ...m, [t]: r.value.total }));
      });
    }
    return () => c.abort();
  }, [ready, countsKey, api, productId, view.seg]);

  // Bau's skeleton and error state are for the first load; after that the rows on screen stay while the next answer comes
  // (a reload after an import or a bulk change mustn't blank the table, or close the dialog that started it).
  const current = useMemo(() => (noFit ? { key, rows: [], cursor: null, total: 0 } : loaded), [noFit, key, loaded]);
  const phase: LiveLeads["phase"] = current ? "ready" : failed?.key === key ? "error" : "loading";
  const raw = useMemo(() => current?.rows ?? [], [current]);
  const byId = useMemo(() => new Map(raw.map((c) => [c.id, c])), [raw]);
  const dups = useMemo(() => {
    const d = probableDuplicates(raw);
    for (const id of keptBoth) delete d[id];
    return d;
  }, [raw, keptBoth]);
  const rows = useMemo(() => raw.map((c) => ({ ...companyToLead(c, now), ...(dups[c.id] ? { dupOf: dups[c.id] } : {}) })), [raw, dups, now]);
  const leadById = useMemo(() => new Map(rows.map((l) => [l.id, l])), [rows]);

  const paging = useRef(false);
  const more = useCallback(() => {
    if (!current?.cursor || paging.current) return;
    paging.current = true;
    const at = current.key;
    void fetchPage(current.cursor).then((r) => {
      paging.current = false;
      if (!r.ok) return;   // the next scroll tries again
      setLoaded((l) => (l && l.key === at ? { ...l, rows: [...l.rows, ...r.value.data.filter((x) => !l.rows.some((y) => y.id === x.id))], cursor: r.value.nextCursor, total: r.value.total } : l));
    });
  }, [current, fetchPage]);

  const reload = useCallback(() => setAttempt((n) => n + 1), [setAttempt]);
  const patchRows = useCallback((fn: (c: ApiCompany) => ApiCompany) => setLoaded((l) => (l ? { ...l, rows: l.rows.map(fn) } : l)), []);
  const selection = useCallback((ids: string[] | "all"): ApiSelection => selectionToApi(ids === "all" ? { ids: new Set(), all: true } : { ids: new Set(ids), all: false }, q), [q]);
  const nameOf = useCallback((ids: string[] | "all") => (ids !== "all" && ids.length === 1 ? byId.get(ids[0])?.name ?? "1 company" : `${f(ids === "all" ? current?.total ?? 0 : ids.length)} companies`), [byId, current]);
  const failToast = useCallback((text: string, e: ApiError, again?: () => void) => toast({ tone: "error", children: text, meta: errorDetail(e), action: again ? { label: "Try again", onClick: again } : undefined }), [toast]);

  const setStatus = useCallback((ids: string[] | "all", s: Status, field: "reply" | "email" = "reply") => {
    if (!api) return;
    const who = nameOf(ids);
    const list = ids === "all" ? raw.map((c) => c.id) : ids;
    const before = new Map(list.map((id) => [id, byId.get(id)]).filter((e): e is [string, ApiCompany] => !!e[1]));
    const revert = () => patchRows((c) => before.get(c.id) ?? c);
    const again = () => self.current?.setStatus(ids, s, field);

    if (field === "email") {
      const code = emailCodeOf(s);
      const targets = [...before.values()].filter((c) => c.primary);
      if (!code || !targets.length) return;
      patchRows((c) => (before.has(c.id) && c.primary ? { ...c, primary: { ...c.primary, emailStatus: code } } : c));
      void Promise.all(targets.map((c) => api.updatePerson(c.primary!.id, { email_status: code }))).then((rs) => {
        const bad = rs.find((r) => !r.ok);
        if (bad && !bad.ok) { revert(); failToast(`Couldn’t set ${who} to ${s}`, bad.error, again); return; }
        toast({ tone: "success", children: `${who} set to ${s}`, action: { label: "Undo", onClick: () => {
          revert();
          for (const c of targets) void api.updatePerson(c.primary!.id, { email_status: c.primary!.emailStatus });
        } } });
      });
      return;
    }

    const code = replyCodeOf(s);
    if (!code) { toast({ tone: "error", children: `Couldn’t set ${who} to ${s}`, meta: `${s} isn’t a status Corral stores yet` }); return; }
    const meta = s === "Unsubscribed" || s === "Not interested" ? "removed from sequences" : "Corral changes it again only if they reply";
    patchRows((c) => (before.has(c.id) && c.replyStatus !== "unsubscribed" ? { ...c, replyStatus: code } : c));
    const one = ids !== "all" && ids.length === 1 ? before.get(ids[0]) : undefined;
    // Unsubscribing one company's person also suppresses the address (final, so no Undo).
    const call: Promise<Result<unknown, ApiError>> = code === "unsubscribed" && one?.primary ? api.unsubscribe(one.primary.id)
      : api.bulk({ action: "set_reply_status", reply_status: code }, selection(ids), { confirm: true });
    void call.then((r) => {
      if (!r.ok) { revert(); failToast(`Couldn’t set ${who} to ${s}`, r.error, again); return; }
      if (ids === "all" || code === "unsubscribed") reload(); else recount();
      // Undo puts each company back to the status it had; everything in the view, or unsubscribed, can't be undone.
      const undo = ids === "all" || code === "unsubscribed" ? undefined : () => {
        revert();
        const groups = new Map<ReplyCode, string[]>();
        for (const c of before.values()) if (c.replyStatus !== "unsubscribed") groups.set(c.replyStatus, [...(groups.get(c.replyStatus) ?? []), c.id]);
        for (const [prev, gids] of groups) void api.bulk({ action: "set_reply_status", reply_status: prev }, { ids: gids }, { confirm: true });
      };
      toast({ tone: "success", children: `${who} set to ${REPLY_LABEL[code]}`, meta, action: undo ? { label: "Undo", onClick: undo } : undefined });
    });
  }, [api, raw, byId, nameOf, patchRows, selection, reload, recount, toast, failToast]);
  useEffect(() => { self.current = { setStatus }; }, [setStatus]);

  const segments = input?.segments ?? null;
  const addToSegment = useCallback((s: LiveSegment, ids: string[] | "all") => {
    if (!api) return;
    void api.bulk({ action: "add_to_segment", segment_id: s.id }, selection(ids), { confirm: true }).then((r) => {
      if (!r.ok) { failToast(`Couldn’t add to ${s.name}`, r.error); return; }
      segments?.refresh();
      toast({ tone: "success", icon: "layers", children: `Added ${f(r.value.changed)} to ${s.name}`, meta: "pinned, even if rules change" });
    });
  }, [api, selection, segments, toast, failToast]);

  const createSegment = useCallback<LiveLeads["createSegment"]>(async ({ name, rules, match, companyIds, fromImportId }) => {
    if (!api) return false;
    const r = await api.createSegment({ name: name.trim(), rules: rulesToApi(rules, productId), match, company_ids: companyIds ?? [], ...(fromImportId ? { from_import_id: fromImportId } : {}) });
    if (!r.ok) { failToast(`Couldn’t save “${name.trim()}”`, r.error); return false; }
    segments?.refresh();
    toast({ tone: "success", icon: "layers", children: `Saved segment “${r.value.name}”`, meta: "in the sidebar under Saved segments" });
    return true;
  }, [api, productId, segments, toast, failToast]);

  const saveSegmentRules = useCallback(async (rules: Rule[], match: Match) => {
    if (!api || !segment) return false;
    const r = await api.updateSegment(segment.id, { rules: rulesToApi(rules, productId), match });
    if (!r.ok) { failToast(`Couldn’t save ${segment.name}`, r.error); return false; }
    segments?.refresh(); reload();
    toast({ tone: "success", icon: "layers", children: `Saved ${segment.name}`, meta: `${f(r.value.count)} companies match` });
    return true;
  }, [api, segment, productId, segments, reload, toast, failToast]);

  const merge = useCallback(async (duplicateId: string) => {
    const keepId = dups[duplicateId];
    const keep = keepId ? byId.get(keepId) : undefined;
    if (!api || !keep) return null;
    const r = await api.merge(keep.id, duplicateId);
    if (!r.ok) { failToast(`Couldn’t merge into ${keep.name}`, r.error); return null; }
    setLoaded((l) => (l ? { ...l, rows: l.rows.filter((c) => c.id !== duplicateId).map((c) => (c.id === keep.id ? { ...c, ...r.value } : c)), total: Math.max(0, l.total - 1) } : l));
    setDetails((m) => ({ ...m, [keep.id]: r.value }));
    reload();
    toast({ tone: "success", children: `Merged into ${keep.name}` });
    return keep.id;
  }, [api, dups, byId, reload, toast, failToast]);

  const keepBoth = useCallback((id: string) => {
    setKeptBoth((s) => new Set(s).add(id));
    toast({ children: "Kept both. Corral won't ask about this pair again." });
  }, [toast]);

  const loadDetail = useCallback((id: string) => {
    if (!api || details[id] || !byId.has(id)) return;
    void api.company(id).then((r) => { if (r.ok) setDetails((m) => ({ ...m, [id]: r.value })); });
  }, [api, details, byId]);
  const detailOf = useCallback((id: string): LeadDetailData | undefined => {
    const d = details[id];
    if (d) return detailFromApi(d);
    const c = byId.get(id);
    return c ? detailFromApi({ ...c, people: c.primary ? [c.primary] : [], fits: [] }) : undefined;
  }, [details, byId]);

  const enrollPlan = useCallback((ids: string[] | "all") => (api ? api.enrollPlan(selection(ids)) : Promise.resolve(err<ApiError>({ kind: "network", op: "POST /api/v1/companies/enroll-plan", message: "offline" }))), [api, selection]);
  const importer = useMemo(() => (api ? importRunner(api, { onFinished: () => reload() }) : null), [api, reload]);
  const existing = useMemo<Existing[]>(() => raw.map((c) => ({ id: c.id, company: c.name, domain: c.domain ?? "", email: c.primary?.email ?? undefined })), [raw]);
  const fitOf = useCallback((id: string) => { const c = byId.get(id); return c ? fitStatusOf(c) : undefined; }, [byId]);
  const findLead = useCallback((id: string) => leadById.get(id), [leadById]);
  const retry = useCallback(() => { segments?.refresh(); reload(); }, [segments, reload]);

  if (!api || !importer) return null;
  const shownCounts = productId ? counts : { ...counts, fit: 0 };
  const allTotal = counts.all;
  return {
    phase, errorDetail: failed?.key === key ? errorDetail(failed.error) : "", retry,
    rows, total: current?.total ?? 0, hasMore: !!current?.cursor, more,
    counts: shownCounts, empty: phase === "ready" && !view.seg && allTotal === 0 && (current?.total ?? 0) === 0, tabDropped: q.tabDropped,
    fitOf, findLead, detailOf, loadDetail, setStatus, addToSegment, createSegment, saveSegmentRules, merge, keepBoth, enrollPlan,
    importer, existing, reload,
  };
}
