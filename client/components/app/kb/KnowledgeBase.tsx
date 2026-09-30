"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { AppData } from "@/components/session/AppData";
import type { KbReviewState } from "@/lib/kb/state";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { Button, cx } from "../primitives";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { Tabs } from "../Tabs";
import { useToast } from "../Toaster";
import type { SearchHit } from "@/lib/api/kb";
import { ok } from "@/lib/result";
import { KNOWLEDGE, PASSAGES, PRODUCT, REVIEW_SOURCES, SOURCES, citedBy, type KSection, type Source } from "./data";
import { KnowledgeEditor } from "./Editor";
import { advance, isBusy, useTicker } from "./parts";
import { SourceDetail } from "./SourceDetail";
import { SourceList, type SourceFilter } from "./SourceList";
import { KbSearch, type KbSearchFn, type SearchState } from "./Search";
import { DropZone, FirstProductField, UploadDialog, UploadTray, UrlAdder, failed, fileItem, useUploadQueue, type FirstProduct, type QueueItem, type UploadQueue } from "./Upload";
import { useLiveKb, type KbProducts } from "./live";

const MB = 1048576;
/** Queues for the upload review states: a live-looking mix, and every way an upload can fail. */
export function reviewQueue(state?: KbReviewState): QueueItem[] {
  const f = (name: string, size: number, p: Partial<QueueItem> = {}): QueueItem => ({ ...fileItem({ name, size }), ...p });
  if (state === "upload" || state === "tray") return [
    f("Reefer truck retrofit guide.pdf", 8.4 * MB, { state: "active", stage: "upload", pct: 62 }),
    f("Pharmacy compliance one-pager.docx", 1.2 * MB, { state: "active", stage: "scan", pct: 40 }),
    f("Case study – Pwani Fresh.pdf", 3.1 * MB, { state: "queued" }),
    { id: "u-url", name: "coldtrace.io/pricing", host: "coldtrace.io", kind: "url", state: "done", stage: "scan", pct: 100 },
    f("Sensor datasheet 2026.pdf", 2.6 * MB, { state: "done", pct: 100 }),
  ];
  if (state === "upload-errors") return [
    failed(f("Q3 customer webinar.pdf", 14.2 * MB, { state: "active", pct: 58 }), "dropped", ["retry"]),
    f("Trade show deck.key", 42 * MB),
    f("Installer training video notes.pdf", 31.4 * MB),
    failed(f("Calibration certificate 2026.pdf", 380 * 1024), "encrypted", ["replace", "skip"]),
    f("ColdTrace pitch 2026.pdf", 4.2 * MB, {}),
    f("Reefer truck retrofit guide.pdf", 8.4 * MB, { state: "done", pct: 100 }),
  ].map((it) => (it.name === "ColdTrace pitch 2026.pdf" ? fileItem({ name: it.name, size: it.size! }, [it.name]) : it));
  return [];
}

/** Review states that add one REVIEW_SOURCES source on top of the list and open it (M10b, M10c). */
const INJECTED = ["unreadable", "interrupted", "partial-limit", "partial-web", "partial-mixed", "markdown", "replace"] as const satisfies readonly KbReviewState[];
const INJECT: Partial<Record<KbReviewState, keyof typeof REVIEW_SOURCES>> = { markdown: "warranty", replace: "warranty" };
const injected = (state: KbReviewState) => REVIEW_SOURCES[INJECT[state] ?? (state as keyof typeof REVIEW_SOURCES)];
const SEARCH_STATES = ["search", "search-loading", "search-none", "search-error"] as const satisfies readonly KbReviewState[];
const FROZEN: KbReviewState[] = ["loading", "error", "sources", "source", "partial", "failed", "unreadable", "interrupted", "partial-limit", "partial-web", "partial-mixed", "upload", "upload-errors", "dragging", "tray", "editing", "save-error", "conflict",
  "not-drafted", "first-product", "markdown", "replace", ...SEARCH_STATES];

/** Sample search: Bau's sample passages, matched on words (the API ranks by meaning). */
export function sampleSearch(sources: Source[]): KbSearchFn {
  return async (query, limit) => {
    await new Promise((r) => setTimeout(r, 350));
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];
    for (const [id, list] of Object.entries(PASSAGES)) {
      const src = sources.find((s) => s.id === id) ?? Object.values(REVIEW_SOURCES).find((s) => s.id === id);
      if (!src) continue;
      list.forEach((p, i) => {
        const hay = `${p.loc ?? ""} ${p.text}`.toLowerCase();
        const score = terms.filter((t) => hay.includes(t)).length / terms.length;
        if (score > 0) hits.push({ passageId: `${id}-${i}`, sourceId: id, sourceName: src.name, sourceKind: src.kind, loc: p.loc, text: p.text, score });
      });
    }
    return ok(hits.sort((a, b) => b.score - a.score).slice(0, limit));
  };
}

/** Frozen search review states: the query and what's on screen. */
export function reviewSearch(state: KbReviewState | undefined, sources: Source[]): { query: string; state: SearchState } | undefined {
  if (state === "search-loading") return { query: "battery life", state: { phase: "loading", query: "battery life" } };
  if (state === "search-none") return { query: "solar panels", state: { phase: "done", query: "solar panels", hits: [], limit: 8 } };
  if (state === "search-error") return { query: "battery life", state: { phase: "error", query: "battery life", detail: "POST /api/v1/products/coldtrace-sensors/knowledge/search · 503" } };
  if (state !== "search") return undefined;
  const hit = (id: string, i: number, score: number): SearchHit => {
    const src = [...sources, ...Object.values(REVIEW_SOURCES)].find((s) => s.id === id)!;
    const p = PASSAGES[id][i];
    return { passageId: `${id}-${i}`, sourceId: id, sourceName: src.name, sourceKind: src.kind, loc: p.loc, text: p.text, score };
  };
  return { query: "battery life", state: { phase: "done", query: "battery life", limit: 8,
    hits: [hit("gateway", 2, 0.91), hit("gateway", 1, 0.84), hit("warranty", 1, 0.8), hit("warranty", 0, 0.72), hit("pitch", 0, 0.61)] } };
}

/** What the page needs from its data, whether that's Bau's sample knowledge base or the API (live.ts). */
export type KbModel = {
  phase: "loading" | "error" | "ready";
  /** The mono line under "Couldn’t load the knowledge base": the request that failed. */
  errorDetail: string;
  retry: () => void;
  productName: string;
  sources: Source[];
  knowledge: KSection[];
  setKnowledge: (next: KSection[] | ((k: KSection[]) => KSection[])) => void;
  q: UploadQueue;
  /** Names already in this knowledge base, for the duplicate check before upload. */
  existing: string[];
  reread: (id: string) => void;
  remove: (id: string) => void;
  /** "Replace file": the next file added replaces this source. */
  replace: (id: string) => void;
  /** Replace on a duplicate in the upload queue. */
  replaceFromQueue: (it: QueueItem) => void;
  /** The API's first passages per source; undefined uses the sample passages. */
  passages?: Record<string, { loc: string | null; ordinal?: number; text: string }[] | undefined>;
  loadPassages?: (id: string) => void;
  /** Search this product's sources (M11). */
  search: KbSearchFn;
  /** No product yet: the first upload names it (M11). */
  firstProduct?: FirstProduct;
  /** Whether Corral drafts the Knowledge page. False on the API (no drafting yet), so read sources show "Not drafted yet". */
  drafts: boolean;
};

type KbProps = {
  state?: KbReviewState; addOpen: boolean; onAddOpenChange: (open: boolean) => void; /** styleguide frame: tray and overlays stay inside */ contained?: boolean;
  /** Present when the app is signed in against the API (and no review state is set): real data. */
  live?: { data: AppData; products: KbProducts };
};

export function KnowledgeBase(props: KbProps) {
  return props.live && !props.state ? <LiveKnowledgeBase {...props} live={props.live} /> : <SampleKnowledgeBase {...props} />;
}

function LiveKnowledgeBase({ live, ...props }: KbProps & { live: NonNullable<KbProps["live"]> }) {
  const m = useLiveKb({ api: live.data.kb, products: live.products, me: live.data.person });
  const p = live.products;
  const workspace = live.data.me.organization.name;
  const model: KbModel = { ...m, errorDetail: m.errorDetail ?? "", productName: p.selected?.name ?? (p.firstName.trim() || workspace), drafts: false,
    firstProduct: p.selected ? undefined : { name: p.firstName, workspace, setName: p.setFirstName } };
  return <KbView {...props} m={model} isLive />;
}

/** Bau's sample knowledge base, with the simulated pipeline and review states (unchanged from M2/M10b). */
function useSampleKb(state: KbReviewState | undefined): KbModel {
  const toast = useToast();
  const live = !state || !FROZEN.includes(state);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(state === "loading" ? "loading" : state === "error" ? "error" : "ready");
  const [sources, setSources] = useState<Source[]>(() => (state === "empty" || state === "first-product" ? [] : state === "drafting" ? [{ ...SOURCES[4], id: "pitch", status: { s: "processing", stage: "parse", pct: 40 } }]
    : state === "not-drafted" ? SOURCES.filter((s) => s.status.s === "ready")
    : state && (INJECTED as readonly string[]).includes(state) ? [injected(state), ...SOURCES]
    : state && (SEARCH_STATES as readonly string[]).includes(state) ? [REVIEW_SOURCES.warranty, ...SOURCES] : SOURCES));
  const [knowledge, setKnowledge] = useState<KSection[]>(state === "empty" || state === "drafting" || state === "not-drafted" || state === "first-product" ? [] : KNOWLEDGE);
  const [firstName, setFirstName] = useState("ColdTrace");

  const onDone = useCallback((it: QueueItem) => {
    const now: Source = { id: `up-${it.id}`, name: it.name, kind: it.kind, host: it.host, meta: it.kind === "url" ? (it.whole ? "Whole section" : "1 page") : `${it.size ? `${Math.round(it.size / MB * 10) / 10} MB` : ""}`,
      cited: 0, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Today", updated: "just now", status: { s: "processing", stage: "parse", pct: 0 } };
    setSources((l) => [now, ...l]);
  }, []);
  const q = useUploadQueue({ initial: reviewQueue(state), live, onDone });

  const tick = useCallback(() => {
    setSources((l) => l.map((s) => {
      if (!isBusy(s)) return s;
      const r = advance(s.status, s.passages ?? 12 + (s.name.length % 20));
      return { ...s, status: r.status, passages: r.passages ?? s.passages, updated: r.status.s === "ready" ? "just now" : s.updated };
    }));
  }, []);
  const anyBusy = sources.some(isBusy);
  useTicker(live && anyBusy, 900, tick);
  // First source finished while the page was empty: Corral drafts the page.
  if (state !== "not-drafted" && knowledge.length === 0 && sources.some((s) => s.status.s === "ready")) setKnowledge(KNOWLEDGE);

  const existing = useMemo(() => sources.map((s) => s.name), [sources]);
  const search = useMemo(() => sampleSearch(sources), [sources]);
  const reread = (id: string) => {
    const s = sources.find((x) => x.id === id);
    if (!s) return;
    setSources((l) => l.map((x) => (x.id === id ? { ...x, status: { s: "processing", stage: x.kind === "url" ? "upload" : "scan", pct: 0 } } : x)));
    toast({ icon: "refresh", children: `Reading ${s.name} again`, meta: "the current version stays searchable meanwhile" });
  };
  const remove = (id: string) => {
    const s = sources.find((x) => x.id === id)!;
    const before = { sources, knowledge };
    setSources((l) => l.filter((x) => x.id !== id));
    setKnowledge((ks) => ks.map((sec) => ({ ...sec, items: sec.items.map((i) => (i.cites.some((c) => c.src === id) && i.cites.every((c) => c.src === id) ? { ...i, flag: { f: "stale" as const, removed: s.name, when: "today" } } : i)) })));
    toast({ tone: "success", children: `Removed ${s.name}`, action: { label: "Undo", onClick: () => { setSources(before.sources); setKnowledge(before.knowledge); } } });
  };
  return {
    phase, errorDetail: `GET /api/v1/products/${PRODUCT.slug}/knowledge · 502`, retry: () => { setPhase("loading"); setTimeout(() => setPhase("ready"), 800); },
    productName: state === "first-product" ? firstName.trim() || "ColdTrace" : PRODUCT.name, sources, knowledge, setKnowledge, q, existing, reread, remove, replace: () => {},
    replaceFromQueue: (it) => toast({ icon: "upload", children: `Replacing ${it.name}`, meta: "the old copy stays searchable until the new one is read" }),
    search, drafts: state !== "not-drafted",
    firstProduct: state === "first-product" ? { name: firstName, workspace: "ColdTrace", setName: setFirstName } : undefined,
  };
}

function SampleKnowledgeBase(props: KbProps) {
  const m = useSampleKb(props.state);
  return <KbView {...props} m={m} />;
}

function KbView({ state, addOpen, onAddOpenChange, contained, m, isLive: live }: Omit<KbProps, "live"> & { m: KbModel; isLive?: boolean }) {
  const { phase, sources, knowledge, setKnowledge, q, existing } = m;
  const sourceStates: KbReviewState[] = ["sources", "source", "partial", "failed", ...INJECTED, ...SEARCH_STATES, "tray", "dragging"];
  // Live: nothing is drafted yet (the API has no knowledge drafting), so open on what's real.
  const [tab, setTab] = useState<"knowledge" | "sources">(live || (state && sourceStates.includes(state)) ? "sources" : "knowledge");
  const [selected, setSelected] = useState<string | undefined>(state === "source" ? "pitch" : state === "partial" ? "gateway" : state === "failed" ? "cert"
    : state && state !== "replace" && (INJECTED as readonly string[]).includes(state) ? injected(state).id : undefined);
  const [replacingId, setReplacingId] = useState<string | undefined>(state === "replace" ? injected(state).id : undefined);
  const [searchKey, setSearchKey] = useState(0);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [dragging, setDragging] = useState(state === "dragging");
  const [removing, setRemoving] = useState<string | undefined>();
  const depth = useRef(0);
  const { loadPassages } = m;
  useEffect(() => { if (selected) loadPassages?.(selected); }, [selected, loadPassages]);

  const openSource = (id: string) => { setTab("sources"); setSelected(id); };
  const jump = (itemId: string) => { setTab("knowledge"); setTimeout(() => document.getElementById(`k-item-${itemId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60); };
  const action = (id: string, a: "reread" | "replace" | "remove") => {
    if (!sources.some((x) => x.id === id)) return;
    if (a === "remove") { setRemoving(id); return; }
    if (a === "replace") { m.replace(id); setReplacingId(id); onAddOpenChange(true); return; }
    m.reread(id);
  };
  const remove = (id: string) => {
    m.remove(id);
    if (selected === id) setSelected(undefined);
    setRemoving(undefined);
  };

  const onDrag = (e: DragEvent, kind: "enter" | "leave" | "drop") => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
    e.preventDefault();
    if (kind === "enter") { depth.current++; setDragging(true); }
    if (kind === "leave" && --depth.current <= 0) { depth.current = 0; setDragging(false); }
    if (kind === "drop") { depth.current = 0; setDragging(false); q.addFiles(Array.from(e.dataTransfer.files), existing); onAddOpenChange(true); }
  };

  const busy = sources.filter(isBusy).length;
  const rem = removing ? sources.find((s) => s.id === removing) : undefined;
  const remUsed = rem ? citedBy(rem.id, knowledge).length : 0;
  const sel = selected ? sources.find((s) => s.id === selected) : undefined;
  const empty = phase === "ready" && sources.length === 0;
  const product = m.productName;
  const searchable = sources.reduce((t, s) => t + (s.status.s === "ready" || s.status.s === "partial" ? s.passages ?? 0 : 0), 0);
  const replacing = addOpen && replacingId ? sources.find((s) => s.id === replacingId) : undefined;
  const closeAdd = () => { onAddOpenChange(false); setReplacingId(undefined); };
  const toSearch = () => { setTab("sources"); setSearchKey((k) => k + 1); setTimeout(() => document.querySelector<HTMLInputElement>(".k-search input")?.focus(), 60); };

  return (
    <div className={cx("c-view k-kb", contained && "is-contained")} onDragEnter={(e) => onDrag(e, "enter")} onDragOver={(e) => { if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault(); }}
      onDragLeave={(e) => onDrag(e, "leave")} onDrop={(e) => onDrag(e, "drop")}>
      <div className="c-subbar">
        <Tabs label="Knowledge base" value={tab} onChange={(v) => setTab(v as "knowledge" | "sources")}
          tabs={[{ id: "knowledge", label: "Knowledge" }, { id: "sources", label: "Sources", count: phase === "ready" ? sources.length : undefined }]} />
        {busy > 0 && phase === "ready" && <span className="k-subbar__live"><span className="k-live" aria-hidden="true" />Reading {busy} {busy === 1 ? "source" : "sources"}</span>}
      </div>

      {phase === "loading" && <KbSkeleton tab={tab} />}
      {phase === "error" && (
        <div className="c-view c-view--center">
          <ErrorState title="Couldn’t load the knowledge base" detail={m.errorDetail}
            actions={<Button variant="primary" onClick={m.retry}><Icon name="refresh" />Try again</Button>}>
            Your sources and edits are safe; this is a connection problem. Corral keeps using the last saved version in emails meanwhile.
          </ErrorState>
        </div>
      )}
      {empty && <FirstRun product={product} firstProduct={m.firstProduct} onFiles={(f) => { q.addFiles(f, existing); onAddOpenChange(true); }} onUrl={(h, p, w) => { q.addUrl(h, p, w); onAddOpenChange(true); }} />}

      {phase === "ready" && !empty && tab === "knowledge" && (
        <div className="c-view__scroll">
          {knowledge.length ? (
            <KnowledgeEditor sections={knowledge} onChange={setKnowledge} sources={sources} onOpenSource={openSource} onShowSources={() => setTab("sources")}
              initialEditing={state === "editing" || state === "save-error" ? "proof-kilima" : undefined} failFirstSave={state === "save-error"} initialFocus={state === "conflict" ? "price" : undefined} />
          ) : busy ? <Drafting sources={sources.filter(isBusy)} drafts={m.drafts} />
            : m.drafts ? <Drafting sources={sources} drafts />
            : <NotDrafted sources={sources.length} passages={searchable} onSearch={toSearch} onSources={() => setTab("sources")} />}
        </div>
      )}
      {phase === "ready" && !empty && tab === "sources" && (
        <div className={cx("k-split", sel && "has-detail")}>
          <div className="k-split__list">
            <KbSearch key={searchKey} search={m.search} searchable={searchable} onOpen={setSelected} onAdd={() => onAddOpenChange(true)} initial={searchKey === 0 ? reviewSearch(state, sources) : undefined}>
              <SourceList sources={sources} filter={filter} onFilter={setFilter} selected={selected} onOpen={setSelected} onAction={action} onAdd={() => onAddOpenChange(true)} />
            </KbSearch>
          </div>
          {sel && <div className="k-split__detail"><SourceDetail key={sel.id} src={sel} knowledge={knowledge} onBack={() => setSelected(undefined)} onAction={action} onJump={jump}
            passages={m.passages ? m.passages[sel.id] ?? [] : undefined} /></div>}
        </div>
      )}

      {dragging && (
        <div className="k-dropover" aria-hidden="true">
          <div className="k-dropover__card"><Icon name="upload" size={18} /><b>Drop to add to {product}</b><span>PDF, DOCX or Markdown · up to 25 MB each</span></div>
        </div>
      )}
      <UploadDialog open={addOpen} onClose={closeAdd} q={q} product={product} existing={existing} inline={contained}
        onReplace={m.replaceFromQueue} replacing={replacing} firstProduct={m.firstProduct} />
      {!addOpen && (state === "tray" || q.busy || q.items.some((i) => i.state === "error")) && <UploadTray q={q} onOpen={() => onAddOpenChange(true)} inline={contained} />}
      <Dialog open={!!rem} onClose={() => setRemoving(undefined)} tone="danger" title={`Remove ${rem?.name ?? ""}?`}
        description={rem?.passages ? `Corral stops searching its ${rem.passages} passages.` : "Corral stops using it."}
        footer={<><Button variant="quiet" onClick={() => setRemoving(undefined)}>Cancel</Button><Button variant="primary" className="k-btn-danger" onClick={() => rem && remove(rem.id)}>Remove source</Button></>}>
        {remUsed > 0 ? <p className="k-p">{remUsed} {remUsed === 1 ? "line of knowledge cites" : "lines of knowledge cite"} it. They stay, marked <b>source removed</b>, so you can keep them as your own claim or delete them.</p>
          : <p className="k-p">Nothing in the knowledge cites it. You can add it again at any time.</p>}
      </Dialog>
    </div>
  );
}

/* First run: the page is the upload. No wizard, no modal: the drop zone is the empty state. */
function FirstRun({ product, firstProduct, onFiles, onUrl }: { product: string; firstProduct?: FirstProduct; onFiles: (f: File[]) => void; onUrl: (host: string, path: string, whole: boolean) => void }) {
  return (
    <div className="c-view__scroll">
      <div className="k-first">
        <div className="k-first__main">
          <span className="k-eyebrow">Product knowledge · {product}</span>
          <h1>Teach Corral what you sell</h1>
          <p className="k-lede">Add the documents your best rep would read before a first call. Corral reads them, splits them into passages, and cites them back to where they came from when it writes.</p>
          {firstProduct && <FirstProductField fp={firstProduct} />}
          <DropZone onFiles={onFiles} />
          <UrlAdder onAdd={onUrl} />
        </div>
        <aside className="k-first__side" aria-label="What to add">
          <span className="k-index__label">Good first sources</span>
          <ol className="k-first__list">
            <li><b>Your pitch deck</b><span>Positioning, who it&rsquo;s for, the numbers you quote.</span></li>
            <li><b>Two or three case studies</b><span>Proof Corral can name in emails.</span></li>
            <li><b>Your product and pricing pages</b><span>Corral reads them when you add them. Re-read one whenever it changes.</span></li>
            <li><b>The objections doc, if you have one</b><span>Corral drafts replies from it.</span></li>
          </ol>
          <p className="k-first__note"><Icon name="clock" size={12} />A 20-page PDF is usually searchable in under a minute.</p>
        </aside>
      </div>
    </div>
  );
}

/* Sources are being read. `drafts` (the sample) promises the drafted page; on the API there's no drafting yet,
   so it only promises what's true: the passages become searchable. */
function Drafting({ sources, drafts }: { sources: Source[]; drafts: boolean }) {
  const what = sources.length === 1 ? `${sources[0].name} is being read now.` : `${sources.length} sources are being read now.`;
  return (
    <div className="c-view c-view--center">
      {drafts ? (
        <EmptyState icon="book" title="Corral drafts this page once your first source is read">
          {what} You&rsquo;ll get a page of positioning, pains, proof and objections, each line cited, ready to edit.
        </EmptyState>
      ) : (
        <EmptyState icon="book" title="Reading your sources">{what} Once read, every passage is searchable from Sources.</EmptyState>
      )}
    </div>
  );
}

/* M11, gap 1: sources are read, nothing is drafted (the API has no drafting yet). Honest about both: what
   Corral has now (passages it can search) and what this page will hold, marked as not drafted yet. */
const OUTLINE = ["Positioning", "Who it’s for", "Pains it solves", "Proof", "Objections"];
function NotDrafted({ sources, passages, onSearch, onSources }: { sources: number; passages: number; onSearch: () => void; onSources: () => void }) {
  return (
    <div className="k-nd">
      <span className="k-eyebrow">Knowledge</span>
      <h2 className="k-nd__title">Your sources are read. This page isn&rsquo;t drafted yet.</h2>
      <p className="k-nd__lede">Corral can search <b>{passages.toLocaleString("en-GB")} passages</b> from {sources} {sources === 1 ? "source" : "sources"} right now. Drafting them into one page you can edit comes in a later update; nothing here is written for you yet.</p>
      <div className="k-nd__acts">
        <Button variant="primary" onClick={onSearch}><Icon name="search" />Search your sources</Button>
        <Button onClick={onSources}>See sources</Button>
      </div>
      <ol className="k-nd__outline" aria-label="What this page will hold">
        {OUTLINE.map((t) => <li key={t}><span>{t}</span><em>Not drafted</em></li>)}
      </ol>
    </div>
  );
}

function KbSkeleton({ tab }: { tab: "knowledge" | "sources" }) {
  if (tab === "sources") return (
    <div className="c-view__scroll" role="status" aria-busy="true" aria-label="Loading sources">
      <div className="k-sources"><div className="k-sources__head"><Skeleton w={260} h={12} /><Skeleton w={280} h={26} r={8} /></div>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="k-srcrow k-srcrow--skel"><Skeleton w={28} h={28} r={6} /><span className="k-skel2"><Skeleton w={`${50 + ((i * 17) % 30)}%`} h={11} /><Skeleton w="30%" h={9} /></span><Skeleton w={110} h={10} /></div>)}
      </div>
    </div>
  );
  return (
    <div className="c-view__scroll" role="status" aria-busy="true" aria-label="Loading knowledge">
      <div className="k-doc">
        <nav className="k-index" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} w={`${60 + ((i * 13) % 35)}%`} h={10} style={{ margin: "9px 0" }} />)}</nav>
        <div className="k-page">
          <div className="k-page__head"><Skeleton w={120} h={10} /><Skeleton w={300} h={24} style={{ margin: "12px 0 16px" }} /><Skeleton w="92%" h={11} /><Skeleton w="70%" h={11} style={{ marginTop: 8 }} /></div>
          {[3, 2, 3].map((n, s) => (
            <div key={s} className="k-sec"><Skeleton w={140} h={14} style={{ marginBottom: 18 }} />
              {Array.from({ length: n }, (_, i) => <div key={i} className="k-item k-item--skel"><div className="k-item__main"><Skeleton w="96%" h={11} /><Skeleton w="64%" h={11} style={{ marginTop: 8 }} /></div><div className="k-item__cites"><Skeleton w={150} h={22} r={6} /></div></div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
