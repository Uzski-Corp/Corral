"use client";
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import type { KbReviewState } from "@/lib/kb/state";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { Button, cx } from "../primitives";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { Tabs } from "../Tabs";
import { useToast } from "../Toaster";
import { KNOWLEDGE, PRODUCT, SOURCES, citedBy, type KSection, type Source } from "./data";
import { KnowledgeEditor } from "./Editor";
import { advance, isBusy, useTicker } from "./parts";
import { SourceDetail } from "./SourceDetail";
import { SourceList, type SourceFilter } from "./SourceList";
import { DropZone, UploadDialog, UploadTray, UrlAdder, failed, fileItem, useUploadQueue, type QueueItem } from "./Upload";

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
    failed(f("Q3 customer webinar.pdf", 14.2 * MB, { state: "active", pct: 58 }), "interrupted", ["retry"]),
    f("Trade show deck.key", 42 * MB),
    f("Installer training video notes.pdf", 31.4 * MB),
    failed(f("Calibration certificate 2026.pdf", 380 * 1024), "encrypted", ["replace", "skip"]),
    f("ColdTrace pitch 2026.pdf", 4.2 * MB, {}),
    f("Reefer truck retrofit guide.pdf", 8.4 * MB, { state: "done", pct: 100 }),
  ].map((it) => (it.name === "ColdTrace pitch 2026.pdf" ? fileItem({ name: it.name, size: it.size! }, [it.name]) : it));
  return [];
}

const FROZEN: KbReviewState[] = ["loading", "error", "sources", "source", "partial", "failed", "upload", "upload-errors", "dragging", "tray", "editing", "save-error", "conflict"];

export function KnowledgeBase({ state, addOpen, onAddOpenChange, contained }: {
  state?: KbReviewState; addOpen: boolean; onAddOpenChange: (open: boolean) => void; /** styleguide frame: tray and overlays stay inside */ contained?: boolean;
}) {
  const toast = useToast();
  const live = !state || !FROZEN.includes(state);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(state === "loading" ? "loading" : state === "error" ? "error" : "ready");
  const [sources, setSources] = useState<Source[]>(() => (state === "empty" ? [] : state === "drafting" ? [{ ...SOURCES[4], id: "pitch", status: { s: "processing", stage: "parse", pct: 40 } }] : SOURCES));
  const [knowledge, setKnowledge] = useState<KSection[]>(state === "empty" || state === "drafting" ? [] : KNOWLEDGE);
  const sourceStates: KbReviewState[] = ["sources", "source", "partial", "failed", "tray", "dragging"];
  const [tab, setTab] = useState<"knowledge" | "sources">(state && sourceStates.includes(state) ? "sources" : "knowledge");
  const [selected, setSelected] = useState<string | undefined>(state === "source" ? "pitch" : state === "partial" ? "gateway" : state === "failed" ? "cert" : undefined);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [dragging, setDragging] = useState(state === "dragging");
  const [removing, setRemoving] = useState<string | undefined>();
  const depth = useRef(0);

  const onDone = useCallback((it: QueueItem) => {
    const now: Source = { id: `up-${it.id}`, name: it.name, kind: it.kind, host: it.host, meta: it.kind === "url" ? (it.whole ? "Whole section · re-read weekly" : "1 page · re-read weekly") : `${it.size ? `${Math.round(it.size / MB * 10) / 10} MB` : ""}`,
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
  if (knowledge.length === 0 && sources.some((s) => s.status.s === "ready")) setKnowledge(KNOWLEDGE);

  const existing = useMemo(() => sources.map((s) => s.name), [sources]);
  const openSource = (id: string) => { setTab("sources"); setSelected(id); };
  const jump = (itemId: string) => { setTab("knowledge"); setTimeout(() => document.getElementById(`k-item-${itemId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60); };
  const action = (id: string, a: "reread" | "replace" | "remove") => {
    const s = sources.find((x) => x.id === id);
    if (!s) return;
    if (a === "remove") { setRemoving(id); return; }
    if (a === "replace") { onAddOpenChange(true); return; }
    setSources((l) => l.map((x) => (x.id === id ? { ...x, status: { s: "processing", stage: x.kind === "url" ? "upload" : "scan", pct: 0 } } : x)));
    toast({ icon: "refresh", children: `Reading ${s.name} again`, meta: "the current version stays searchable meanwhile" });
  };
  const remove = (id: string) => {
    const s = sources.find((x) => x.id === id)!;
    const before = { sources, knowledge };
    setSources((l) => l.filter((x) => x.id !== id));
    setKnowledge((ks) => ks.map((sec) => ({ ...sec, items: sec.items.map((i) => (i.cites.some((c) => c.src === id) && i.cites.every((c) => c.src === id) ? { ...i, flag: { f: "stale" as const, removed: s.name, when: "today" } } : i)) })));
    if (selected === id) setSelected(undefined);
    setRemoving(undefined);
    toast({ tone: "success", children: `Removed ${s.name}`, action: { label: "Undo", onClick: () => { setSources(before.sources); setKnowledge(before.knowledge); } } });
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
          <ErrorState title="Couldn't load the knowledge base" detail={`GET /api/v1/products/${PRODUCT.slug}/knowledge · 502 Bad Gateway`}
            actions={<Button onClick={() => { setPhase("loading"); setTimeout(() => setPhase("ready"), 800); }}><Icon name="refresh" />Try again</Button>}>
            Your sources and edits are safe; this is a connection problem. Corral keeps using the last saved version in emails meanwhile.
          </ErrorState>
        </div>
      )}
      {empty && <FirstRun onFiles={(f) => { q.addFiles(f, existing); onAddOpenChange(true); }} onUrl={(h, p, w) => { q.addUrl(h, p, w); onAddOpenChange(true); }} />}

      {phase === "ready" && !empty && tab === "knowledge" && (
        <div className="c-view__scroll">
          {knowledge.length ? (
            <KnowledgeEditor sections={knowledge} onChange={setKnowledge} sources={sources} onOpenSource={openSource} onShowSources={() => setTab("sources")}
              initialEditing={state === "editing" || state === "save-error" ? "proof-kilima" : undefined} failFirstSave={state === "save-error"} initialFocus={state === "conflict" ? "price" : undefined} />
          ) : <Drafting sources={sources} />}
        </div>
      )}
      {phase === "ready" && !empty && tab === "sources" && (
        <div className={cx("k-split", sel && "has-detail")}>
          <div className="k-split__list">
            <SourceList sources={sources} filter={filter} onFilter={setFilter} selected={selected} onOpen={setSelected} onAction={action} onAdd={() => onAddOpenChange(true)} />
          </div>
          {sel && <div className="k-split__detail"><SourceDetail key={sel.id} src={sel} knowledge={knowledge} onBack={() => setSelected(undefined)} onAction={action} onJump={jump} /></div>}
        </div>
      )}

      {dragging && (
        <div className="k-dropover" aria-hidden="true">
          <div className="k-dropover__card"><Icon name="upload" size={18} /><b>Drop to add to {PRODUCT.name}</b><span>PDF, DOCX or Markdown · up to 25 MB each</span></div>
        </div>
      )}
      <UploadDialog open={addOpen} onClose={() => onAddOpenChange(false)} q={q} product={PRODUCT.name} existing={existing} inline={contained}
        onReplace={(it) => toast({ icon: "upload", children: `Replacing ${it.name}`, meta: "the old copy stays searchable until the new one is read" })} />
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
function FirstRun({ onFiles, onUrl }: { onFiles: (f: File[]) => void; onUrl: (host: string, path: string, whole: boolean) => void }) {
  return (
    <div className="c-view__scroll">
      <div className="k-first">
        <div className="k-first__main">
          <span className="k-eyebrow">Product knowledge · {PRODUCT.name}</span>
          <h1>Teach Corral what you sell</h1>
          <p className="k-lede">Add the documents your best rep would read before a first call. Corral reads them, drafts what it learns into one page you can edit, and cites every line back to where it came from.</p>
          <DropZone onFiles={onFiles} />
          <UrlAdder onAdd={onUrl} />
        </div>
        <aside className="k-first__side" aria-label="What to add">
          <span className="k-index__label">Good first sources</span>
          <ol className="k-first__list">
            <li><b>Your pitch deck</b><span>Positioning, who it&rsquo;s for, the numbers you quote.</span></li>
            <li><b>Two or three case studies</b><span>Proof Corral can name in emails.</span></li>
            <li><b>Your product and pricing pages</b><span>Re-read weekly, so the knowledge stays current.</span></li>
            <li><b>The objections doc, if you have one</b><span>Corral drafts replies from it.</span></li>
          </ol>
          <p className="k-first__note"><Icon name="clock" size={12} />A 20-page PDF is usually searchable in under a minute.</p>
        </aside>
      </div>
    </div>
  );
}

/* Sources exist, but none is searchable yet. */
function Drafting({ sources }: { sources: Source[] }) {
  return (
    <div className="c-view c-view--center">
      <EmptyState icon="book" title="Corral drafts this page once your first source is read">
        {sources.length === 1 ? `${sources[0].name} is being read now.` : `${sources.length} sources are being read now.`} You&rsquo;ll get a page of positioning, pains, proof and objections, each line cited, ready to edit.
      </EmptyState>
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
