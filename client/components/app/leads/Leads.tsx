"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lead } from "../data";
import { Button, Check, Chip, cx, type Status } from "../primitives";
import { Icon } from "../icons";
import { Dialog, DropdownMenu } from "../Overlays";
import { Select } from "../Form";
import { Tabs } from "../Tabs";
import { Banner, EmptyState, ErrorState, SkeletonTable, Spinner } from "../States";
import { SegmentTable } from "../SegmentTable";
import { SAVED_SEGMENTS } from "../Shell";
import { useToast } from "../Toaster";
import { SegmentBuilder, loosenHint, newRule } from "./Builder";
import { LeadDetail } from "./Detail";
import { ImportDialog, type ImportSeed } from "./Import";
import { StatusMenu } from "./parts";
import { EXISTING, FIT_80, LEAD_ROWS, TOTAL_COMPANIES, crmExportCsv, tradeShowCsv } from "./data";
import { BULK_CONFIRM_AT, describeRule, filterLeads, nextSort, selectedCount, selectionLabel, sortLeads, type Match, type Rule, type Selection, type Sort } from "@/lib/leads/segment";
import { guessMapping, parseCsv, type Mapping } from "@/lib/leads/import";
import type { LeadsReviewState } from "@/lib/leads/state";
import { isHandoffState } from "@/lib/handoff/state";
import { HandoffSection } from "../handoff/Handoff";
import { handoffFor } from "../handoff/data";
import { DEMO_TODAY_M4, STALE_IDS, STALE_TOTAL, provOf } from "../discovery/data";
import { FIT_OPEN, fitStatusFor, scoreFor } from "../fit/data";
import { barOf, shownValue, type FitScore, type FitStatus } from "@/lib/fit/score";
import type { LeadsApi, EnrollPlan } from "@/lib/api/leads";
import { skipLines } from "@/lib/leads/map";
import { useLiveLeads, useLivePreview, type LiveSegments } from "./live";
import { FIELD_LABEL } from "@/lib/discovery/provenance";

const f = (n: number) => n.toLocaleString("en");
const TABS = [{ id: "all", label: "All", total: TOTAL_COMPANIES }, { id: "fit", label: "Fit 80+", total: FIT_80 }, { id: "seq", label: "In a sequence", total: 38 }, { id: "rep", label: "Replied", total: 9 }];
const inTab = (l: Lead, tab: string) => tab === "fit" ? l.fit >= 80 : tab === "seq" ? ["Contacted", "OOO"].includes(l.reply) : tab === "rep" ? ["Interested", "Objection", "Meeting booked", "Referral", "Not interested"].includes(l.reply) : true;

/** What a bulk enroll leaves out, for the 1,284 sample. Real numbers come from the API's dry run. */
export const BULK_SKIPS: [number, string][] = [[38, "already in a sequence, left where they are"], [9, "replied in the last 30 days"], [41, "unsubscribed or said no"], [124, "no verified email yet"]];
export const POOL_PER_DAY = 210;

export const sampleTradeShow = () => ({ name: "trade-show-leads.csv", size: 8_412, csv: parseCsv(tradeShowCsv()) });
export const sampleCrm = () => ({ name: "crm-export-sep.csv", size: 1_190, csv: parseCsv(crmExportCsv()) });
export const SEGMENT_RULES: Record<string, () => Rule[]> = {
  "F&B · East Africa": () => [{ ...newRule("fit"), value: 80 }, { ...newRule("country"), value: ["Kenya", "Uganda", "Tanzania"] }, { ...newRule("industry"), value: ["Dairy", "Seafood", "Beverages", "Bakery"] }],
  "Logistics · Fit > 70": () => [{ ...newRule("fit"), value: 70 }, { ...newRule("industry"), value: ["Cold storage", "Grain"] }],
  "Replied, no meeting": () => [{ ...newRule("reply"), value: ["Interested", "Objection", "Referral"] }],
};

/** The import dialog as each review state shows it (also used by /styleguide). */
export function importSeed(s?: LeadsReviewState): ImportSeed | undefined {
  if (!s?.startsWith("import")) return undefined;
  const t = sampleTradeShow();
  if (s === "import") return { step: "file" };
  if (s === "import-file-error") return { step: "file", error: { title: ".xlsx files can't be imported", fix: "Excel files aren't read directly. In Excel, choose File → Save As → CSV UTF-8, then add that file." } };
  if (s === "import-map") { const m = guessMapping(t.csv); m[7] = "notes"; return { step: "map", file: t, mapping: m }; }
  if (s === "import-map-errors") { const c = sampleCrm(); const m: Mapping = guessMapping(c.csv); m[6] = "email"; return { step: "map", file: c, mapping: m }; }
  const m = guessMapping(t.csv); m[7] = "notes";
  return { step: s === "import-review" ? "review" : s === "import-running" ? "running" : "done", file: t, mapping: m, progress: 46 };
}

/** Signed in against the API (ENG-81): the lead CRM endpoints, whose fit to show, and the saved segments. */
export type LeadsLive = { api: LeadsApi; product: { productId: string | null; ready: boolean }; segments: LiveSegments };

export function LeadsView({ view, state, segment, importOpen, onImportOpenChange, builderOpen, onBuilderOpenChange, onEnroll, onFind, reviewSample = true, enrollAllSignal = 0, live: liveIn }: {
  view: "companies" | "segments"; state?: LeadsReviewState; segment?: string;
  importOpen: boolean; onImportOpenChange: (o: boolean) => void; builderOpen: boolean; onBuilderOpenChange: (o: boolean) => void;
  /** small selections open the shell's enroll dialog; large ones confirm here */ onEnroll: (n: number, includesReplied: boolean) => void;
  onFind: () => void; reviewSample?: boolean; /** bump to enroll everything in the view (segments: "Enroll segment") */ enrollAllSignal?: number;
  /** Present when signed in against the API; a review state always shows the sample. */ live?: LeadsLive;
}) {
  const toast = useToast();
  const frozen = !!state;
  const live = state ? undefined : liveIn;
  const seg = view === "segments" ? segment ?? (live ? live.segments.list[0]?.name : SAVED_SEGMENTS[0][0]) : undefined;
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(state === "loading" ? "loading" : state === "error" ? "error" : "ready");
  const [rows, setRows] = useState<Lead[]>(() => state === "empty" ? [] : state === "partial"
    ? LEAD_ROWS.map((l, i) => (i >= 14 && i < 24 ? { ...l, scoring: true } : l))
    : state === "stale" ? LEAD_ROWS.map((l) => { const d = STALE_IDS.find(([id]) => id === l.id)?.[1]; return d ? { ...l, enrich: { kind: "stale", days: d } } : l; })
    : state?.startsWith("fit") ? LEAD_ROWS.map((l) => { const st = fitStatusFor(l, state); return st.kind === "scored" ? { ...l, fit: shownValue(st.score) } : st.kind === "none" ? { ...l, fit: 0 } : l; })
    : LEAD_ROWS);
  // M5: every company's fit status (scored, scoring, not scored, error), seeded from the review state.
  const [fits, setFits] = useState<Record<string, FitStatus>>(() => Object.fromEntries(LEAD_ROWS.map((l) => [l.id, fitStatusFor(l, state)])));
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [staleCount, setStaleCount] = useState(state === "stale" ? STALE_TOTAL : 0);
  const [tab, setTab] = useState(state === "select-all" || state === "bulk-confirm" || state === "bulk-running" || state === "partial" || state === "duplicate" || FIT_OPEN[state!]?.tab === "all" ? "all" : "fit");
  const [rules, setRules] = useState<Rule[]>(() => live ? [] : seg ? (SEGMENT_RULES[seg] ?? SEGMENT_RULES["F&B · East Africa"])()
    : state === "no-results" ? [{ ...newRule("fit"), value: 90 }, { ...newRule("country"), value: ["Ethiopia"] }] : []);
  const [match, setMatch] = useState<Match>("all");
  const [draft, setDraft] = useState<{ rules: Rule[]; match: Match; name?: string } | null>(() => {
    if (state === "builder") return { rules: SEGMENT_RULES["F&B · East Africa"](), match: "all" };
    if (state === "builder-empty") return { rules: [{ ...newRule("fit"), value: 95 }, { ...newRule("country"), value: ["Kenya", "Uganda"] }, { ...newRule("industry"), value: ["Seafood"] }], match: "all" };
    if (state === "builder-error") return { rules: [{ ...newRule("fit"), value: "120" }, { ...newRule("country"), value: ["Kenya"] }, { ...newRule("reply"), value: [] }], match: "all" };
    return null;
  });
  const [sort, setSort] = useState<Sort>({ key: "fit", dir: "desc" });
  const [sel, setSel] = useState<Selection>(() => ({
    ids: new Set(state === "selected" || state === "status-menu" ? ["kilima", "pwani", "savanna"] : []),
    all: state === "select-all" || state === "bulk-confirm" || state === "bulk-running",
  }));
  const [open, setOpen] = useState<string | undefined>(state && FIT_OPEN[state] ? FIT_OPEN[state]!.id : state === "detail" || state === "provenance" ? "kilima" : state === "duplicate" ? "kilimaltd" : state === "stale" ? "kilima" : isHandoffState(state) ? "nyota" : undefined);
  const [confirm, setConfirm] = useState(state === "bulk-confirm");
  const [running, setRunning] = useState<number | null>(state === "bulk-running" ? 38 : null);
  const [seq, setSeq] = useState("pilot");
  const [pins, setPins] = useState<{ ids?: string[]; importId?: string }>({});
  const [plan, setPlan] = useState<EnrollPlan | null>(null);

  // Live (ENG-81): the table comes from the API, filtered and sorted there. The sample state above stays for review states.
  const lv = useLiveLeads(live ? { api: live.api, productId: live.product.productId, productReady: live.product.ready, segments: live.segments } : null, { seg, tab, rules, match, sort });
  const liveSeg = live && seg ? live.segments.byName(seg) : undefined;
  const [segShown, setSegShown] = useState<string | null>(null);
  if (liveSeg && segShown !== liveSeg.id) { setSegShown(liveSeg.id); setRules(liveSeg.rules); setMatch(liveSeg.match); }
  const preview = useLivePreview(live?.api ?? null, { rules: draft?.rules ?? [], match: draft?.match ?? "all", productId: live?.product.productId ?? null, enabled: !!live && builderOpen && !!draft });
  const data = lv ? lv.rows : rows;
  const loadDetail = lv?.loadDetail;
  useEffect(() => { if (open) loadDetail?.(open); }, [open, loadDetail]);

  // Opening the builder starts a draft from the current rules (adjusted during render, not in an effect)
  if (builderOpen && !draft) setDraft({ rules: rules.length ? rules : [newRule("fit")], match, name: seg ? undefined : "" });
  useEffect(() => { if (state === "builder" || state === "builder-empty" || state === "builder-error") onBuilderOpenChange(true); }, [state, onBuilderOpenChange]);
  useEffect(() => { if (state?.startsWith("import")) onImportOpenChange(true); }, [state, onImportOpenChange]);
  // Background bulk action (review: frozen at 38%)
  useEffect(() => {
    if (running === null || frozen) return;
    const t = setInterval(() => setRunning((p) => (p === null ? null : Math.min(100, p + 12))), 300);
    return () => clearInterval(t);
  }, [running, frozen]);
  const doneRef = useRef(false);
  useEffect(() => {
    if (running !== 100 || doneRef.current) return;
    doneRef.current = true;
    setRunning(null); setSel({ ids: new Set(), all: false });
    toast({ tone: "success", children: "Enrolled 1,072 companies in Cold-room pilot", meta: "sends spread over 6 days", action: { label: "View the 212 skipped", onClick: () => setTab("all") } });
  }, [running, toast]);

  const sampleShown = useMemo(() => sortLeads(filterLeads(rows.filter((l) => seg || inTab(l, tab)), rules, match), sort), [rows, tab, rules, match, sort, seg]);
  const shown = lv ? lv.rows : sampleShown;
  const total = lv ? lv.total : seg || rules.length ? shown.length : TABS.find((t) => t.id === tab)!.total;
  const n = selectedCount(sel, total);
  const allOnPage = shown.length > 0 && shown.every((l) => sel.ids.has(l.id));
  const clear = useCallback(() => setSel({ ids: new Set(), all: false }), []);
  const toggle = (id: string) => setSel((s) => { const ids = new Set(s.all ? shown.map((l) => l.id) : s.ids); if (ids.has(id)) ids.delete(id); else ids.add(id); return { ids, all: false }; });
  const toggleAll = () => setSel((s) => (s.all || s.ids.size ? { ids: new Set(), all: false } : { ids: new Set(shown.map((l) => l.id)), all: false }));

  // Esc clears the selection when nothing else is open
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && n > 0 && !confirm && !importOpen && !(e.target instanceof Element && e.target.closest("[role=dialog], [role=menu], [role=listbox]"))) clear(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [n, confirm, importOpen, clear]);

  // M5 fit actions. Rescoring takes a moment; your own number wins for sorting and filters until cleared.
  const putFit = (id: string, st: FitStatus) => {
    setFits((m) => ({ ...m, [id]: st }));
    if (st.kind === "scored") setRows((rs) => rs.map((l) => (l.id === id ? { ...l, fit: shownValue(st.score) } : l)));
  };
  const scoredOf = (id: string): FitScore | undefined => { const st = fits[id]; return st?.kind === "scored" ? st.score : st && "last" in st ? st.last : undefined; };
  const rescore = (l: Lead) => {
    const prev = scoredOf(l.id);
    setRescoring(l.id);
    setFits((m) => ({ ...m, [l.id]: { kind: "scoring", pages: 3, of: 30, checked: 1, last: prev } }));
    setTimeout(() => {
      setRescoring(null);
      const base = prev?.value ?? l.fit ?? 70;
      // A note that says "they don't run cold rooms" moves the rooms check; otherwise the score holds.
      const value = prev?.disagree ? Math.max(0, base - 18) : base;
      const next = scoreFor(l, value, "2026-09-29");
      const why = prev?.disagree ? [`Re-read ${l.domain} with your note: “${prev.disagree.note}”`] : ["Re-read the site; nothing material changed"];
      putFit(l.id, { kind: "scored", score: { ...next, override: prev?.override, history: prev ? [{ at: prev.at, value: prev.value, why }] : undefined } });
      toast({ tone: "success", icon: "refresh", children: `${l.company} rescored`, meta: value === base ? `still ${value}` : `${base} → ${value}` });
    }, 1600);
  };
  const fitActions = (l: Lead) => ({
    onRescore: () => rescore(l),
    onOverride: (value: number, note: string) => {
      const s0 = scoredOf(l.id) ?? scoreFor(l);
      const before = fits[l.id];
      putFit(l.id, { kind: "scored", score: { ...s0, override: { value, by: "Tomás Ibarra", at: "2026-09-29", note: note || undefined } } });
      toast({ tone: "success", icon: "pen", children: `Fit for ${l.company} set to ${value}`, meta: `Corral scored ${s0.value}`, action: { label: "Undo", onClick: () => putFit(l.id, before) } });
    },
    onClearOverride: () => {
      const s0 = scoredOf(l.id); if (!s0) return;
      putFit(l.id, { kind: "scored", score: { ...s0, override: undefined } });
      toast({ children: `Using Corral's fit for ${l.company}`, meta: String(s0.value) });
    },
    onDisagree: (note: string) => {
      const s0 = scoredOf(l.id) ?? scoreFor(l);
      putFit(l.id, { kind: "scored", score: { ...s0, disagree: { by: "Tomás Ibarra", at: "2026-09-29", note } } });
      toast({ tone: "success", children: "Thanks. Corral is re-reading with your note", meta: l.company });
      setTimeout(() => rescore({ ...l }), 0);
    },
    onAddField: (fld: keyof typeof FIELD_LABEL) => toast({ icon: "pen", children: `Add ${FIELD_LABEL[fld].toLowerCase()} for ${l.company}`, meta: "then Corral rescores" }),
  });

  const setStatus = (ids: string[] | "all", s: Status, field: "reply" | "email" = "reply") => {
    if (lv) { lv.setStatus(ids, s, field); return; }
    if (ids === "all") ids = shown.map((l) => l.id);
    const before = rows;
    setRows((r) => r.map((l) => (ids.includes(l.id) ? { ...l, [field]: s } : l)));
    const who = ids.length === 1 ? rows.find((l) => l.id === ids[0])!.company : `${f(ids.length)} companies`;
    toast({ tone: "success", children: `${who} set to ${s}`, meta: s === "Unsubscribed" || s === "Not interested" ? "removed from sequences" : field === "reply" ? "Corral changes it again only if they reply" : undefined, action: { label: "Undo", onClick: () => setRows(before) } });
  };
  // Live: the confirm dialog's numbers are the API's dry run for this selection.
  const enrollPlan = lv?.enrollPlan;
  useEffect(() => {
    if (!confirm || !enrollPlan) return;
    let off = false;
    void enrollPlan(sel.all ? "all" : [...sel.ids]).then((r) => { if (!off && r.ok) setPlan(r.value); });
    return () => { off = true; setPlan(null); };
  }, [confirm, enrollPlan, sel]);
  const enroll = () => {
    if (n >= BULK_CONFIRM_AT) { setConfirm(true); return; }
    onEnroll(n, sel.ids.has("pwani"));
  };
  // "Enroll segment" from the top bar selects the whole view; large ones confirm first
  const [signal, setSignal] = useState(enrollAllSignal);
  if (enrollAllSignal !== signal) {
    setSignal(enrollAllSignal);
    setSel({ ids: new Set(), all: true });
    if (total >= BULK_CONFIRM_AT) setConfirm(true);
  }
  const enrolledSignal = useRef(enrollAllSignal);
  useEffect(() => {
    if (signal === enrolledSignal.current) return;
    enrolledSignal.current = signal;
    if (total < BULK_CONFIRM_AT) onEnroll(total, shown.some((l) => l.id === "pwani"));
  }, [signal, total, shown, onEnroll]);
  const selectedIds = sel.all ? shown.map((l) => l.id) : [...sel.ids];
  const lead = open ? data.find((l) => l.id === open) : undefined;
  const skips = plan ? skipLines(plan.skipped) : BULK_SKIPS;
  const willEnroll = plan ? plan.willEnroll : n - BULK_SKIPS.reduce((a, [k]) => a + (n >= BULK_CONFIRM_AT ? k : 0), 0);
  const perDay = plan ? plan.sendsPerDay : POOL_PER_DAY;

  const saveDraft = () => {
    if (!draft) return;
    if (lv) {
      const d = draft;
      void (seg ? lv.saveSegmentRules(d.rules, d.match) : lv.createSegment({ name: d.name ?? "", rules: d.rules, match: d.match, companyIds: pins.ids, fromImportId: pins.importId })).then((saved) => {
        if (!saved) return;
        if (seg) { setRules(d.rules); setMatch(d.match); }
        setPins({}); setDraft(null); onBuilderOpenChange(false);
      });
      return;
    }
    if (seg) { setRules(draft.rules); setMatch(draft.match); toast({ tone: "success", icon: "layers", children: `Saved ${seg}`, meta: `${f(filterLeads(rows, draft.rules, draft.match).length)} companies match` }); }
    else toast({ tone: "success", icon: "layers", children: `Saved segment “${draft.name}”`, meta: "in the sidebar under Saved segments" });
    setDraft(null); onBuilderOpenChange(false);
  };
  const applyDraftAsFilters = () => { if (draft) { setRules(draft.rules.filter((r) => r)); setMatch(draft.match); } };

  const phaseNow = lv ? lv.phase : phase;
  const counts = lv ? lv.counts : undefined;
  const importLive = lv ? { existing: lv.existing, runner: lv.importer, sample: undefined } : { existing: EXISTING, runner: undefined, sample: reviewSample ? sampleTradeShow : undefined };
  const loadMore = lv ? (e: React.UIEvent<HTMLDivElement>) => { const el = e.currentTarget; if (lv.hasMore && el.scrollTop + el.clientHeight > el.scrollHeight - 400) lv.more(); } : undefined;
  if (phaseNow === "loading") return <div className="c-view l-leads"><Subbar view={view} tab={tab} setTab={setTab} counts={counts} /><div className="c-view__scroll"><SkeletonTable rows={10} label={seg ? `Loading ${seg}` : "Loading companies"} /></div></div>;
  if (phaseNow === "error") return (
    <div className="c-view c-view--center">
      <ErrorState title={seg ? `Couldn’t load ${seg}` : "Couldn’t load companies"} detail={lv ? lv.errorDetail : "GET /api/v1/companies?view=fit · 503"}
        actions={<Button variant="primary" onClick={() => { if (lv) { lv.retry(); return; } setPhase("loading"); setTimeout(() => setPhase("ready"), 700); }}><Icon name="refresh" />Try again</Button>}>
        Nothing changed. Sequences keep sending while this page is down.
      </ErrorState>
    </div>
  );
  if (lv ? lv.empty : rows.length === 0) return (
    <div className="c-view">
      <div className="c-view__scroll"><FirstRun onImport={() => onImportOpenChange(true)} onFind={onFind} /></div>
      <ImportDialog open={importOpen} onClose={() => onImportOpenChange(false)} existing={importLive.existing} seed={importSeed(state)} sample={importLive.sample} runner={importLive.runner}
        onDone={(m) => { if (!lv) setRows(LEAD_ROWS); toast({ tone: "success", children: m }); }} />
    </div>
  );

  return (
    <div className={cx("c-view l-leads", lead && "has-detail")}>
      {!seg && <Subbar view={view} tab={tab} setTab={(t) => { setTab(t); clear(); }} counts={counts} />}
      <div className="c-filters l-filters">
        {rules.map((r) => (
          <span key={r.id} className="c-chip l-chip"><button type="button" className="l-chip__main" onClick={() => onBuilderOpenChange(true)}>{describeRule(r)}</button>
            {!seg && <button type="button" className="l-chip__x" aria-label={`Remove filter: ${describeRule(r)}`} onClick={() => setRules(rules.filter((x) => x.id !== r.id))}><Icon name="x" size={11} /></button>}</span>
        ))}
        {seg ? <Chip onClick={() => onBuilderOpenChange(true)}><Icon name="pen" size={12} />Edit rules</Chip> : <Chip add onClick={() => onBuilderOpenChange(true)}>Filter</Chip>}
        <span className="l-filters__end">
          <span className="c-faint">{shown.length < total ? `${f(shown.length)} of ${f(total)}` : `${f(total)} ${total === 1 ? "company" : "companies"}`}</span>
          {!seg && rules.length > 0 && <Button variant="quiet" onClick={() => { setDraft({ rules, match, name: "" }); onBuilderOpenChange(true); }}><Icon name="layers" />Save as segment</Button>}
        </span>
      </div>

      {builderOpen && draft && (
        <SegmentBuilder rules={draft.rules} onRules={(r) => { setDraft({ ...draft, rules: r }); if (!seg && draft.name === undefined) applyDraftAsFilters(); }} match={draft.match} onMatch={(m) => setDraft({ ...draft, match: m })}
          leads={data} preview={preview ?? undefined} name={draft.name} onName={draft.name !== undefined ? (v) => setDraft({ ...draft, name: v }) : undefined}
          saveLabel={seg ? "Save changes" : draft.name !== undefined ? "Save segment" : "Apply filters"}
          onSave={() => { if (!seg && draft.name === undefined) { applyDraftAsFilters(); setDraft(null); onBuilderOpenChange(false); } else saveDraft(); }}
          onCancel={() => { setDraft(null); setPins({}); onBuilderOpenChange(false); }} />
      )}

      {staleCount > 0 && <div className="l-banner"><Banner tone="caution" icon="clock" title={`Contact details for ${f(staleCount)} companies were last checked over 90 days ago.`}
        action={<Button onClick={() => { setStaleCount(0); setRows((rs) => rs.map((l) => (l.enrich?.kind === "stale" ? { ...l, enrich: undefined } : l)));
          toast({ tone: "success", icon: "refresh", children: `Re-checking ${f(staleCount)} companies`, meta: `${f(staleCount * 2)} credits · runs in the background` }); }}>Re-check {f(staleCount)} · {f(staleCount * 2)} credits</Button>}>
        People change jobs and mailboxes close. Corral re-checks an email before it sends anything, so nothing bounces; re-check now to see what changed first.</Banner></div>}
      {state === "partial" && <div className="l-banner"><Banner tone="info" title="Corral is still scoring 212 of 1,284 companies.">Rows fill in as each website is read, usually within the hour. Scored rows are final; you can select and enroll them now.</Banner></div>}

      <div className={cx("l-split", lead && "has-detail")}>
        <div className="l-split__list c-view__scroll" onScroll={loadMore}>
          {(sel.all || (allOnPage && total > shown.length)) && (
            <div className="l-allbar" role="status">
              {sel.all ? <>All <b>{f(total)}</b> companies in {seg ?? TABS.find((t) => t.id === tab)!.label} are selected. <button type="button" className="c-link k-linkbtn" onClick={clear}>Clear selection</button></>
                : <>All {f(shown.length)} on this page are selected. <button type="button" className="c-link k-linkbtn" onClick={() => setSel({ ids: new Set(), all: true })}>Select all {f(total)} in {TABS.find((t) => t.id === tab)!.label}</button></>}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState compact icon="filter" title="No companies match these filters"
              actions={<><Button onClick={() => setRules(rules.slice(0, -1))}>Remove the last filter</Button><Button variant="quiet" onClick={() => setRules([])}>Clear filters</Button></>}>
              {loosenHint(lv ? data : rows.filter((l) => seg || inTab(l, tab)), rules, match) ?? "Try fewer filters, or switch the tab to All."}
            </EmptyState>
          ) : (
            <SegmentTable leads={shown} label={seg ? `Segment: ${seg}` : `Companies: ${TABS.find((t) => t.id === tab)!.label}`} selected={sel.all ? new Set(shown.map((l) => l.id)) : sel.ids}
              onToggle={toggle} onToggleAll={toggleAll} allChecked={sel.all || allOnPage ? true : sel.ids.size ? "mixed" : false}
              sort={sort} onSort={(k) => setSort(nextSort(sort, k))} onOpen={setOpen} active={open} fitOf={lv ? (l) => { const st = lv.fitOf(l.id); return st ? barOf(st, true) : { value: l.fit }; } : (l) => (fits[l.id] ? barOf(fits[l.id], true) : { value: l.fit })} />
          )}
          {shown.length > 0 && shown.length < total && <p className="l-more c-faint">Showing the first {f(shown.length)}. The rest load as you scroll.</p>}
        </div>
        {lead && lv && <div className="l-split__detail"><LeadDetail lead={lead} onClose={() => setOpen(undefined)} detail={lv.detailOf(lead.id)} findLead={lv.findLead} today={new Date()}
          onStatus={(id, s, fld) => setStatus([id], s, fld)} onEnroll={() => onEnroll(1, false)} onOpenLead={setOpen} fit={lv.fitOf(lead.id)}
          onMerge={(id) => { void lv.merge(id).then((keep) => { if (keep) setOpen(keep); }); }} onKeepBoth={(id) => lv.keepBoth(id)} /></div>}
        {lead && !lv && <div className="l-split__detail"><LeadDetail lead={lead} onClose={() => setOpen(undefined)}
          prov={provOf(lead, lead.enrich?.kind === "stale" ? lead.enrich.days : 0)} today={DEMO_TODAY_M4} provOpen={state === "provenance" ? "email" : undefined} rechecking={rechecking === lead.id}
          onRecheck={(id) => { setRechecking(id); setTimeout(() => { setRechecking(null); setRows((rs) => rs.map((l) => (l.id === id ? { ...l, enrich: undefined } : l))); setStaleCount((n) => Math.max(0, n - 1));
            toast({ tone: "success", icon: "refresh", children: `${rows.find((l) => l.id === id)?.company} re-checked`, meta: "email still works · 2 credits" }); }, 1200); }} onStatus={(id, s, fld) => setStatus([id], s, fld)} onEnroll={() => onEnroll(1, lead.id === "pwani")}
          onOpenLead={setOpen}
          fit={fits[lead.id]} fitBusy={rescoring === lead.id} fitFocus={state === "fit"} fitActions={fitActions(lead)}
          handoff={lead.id === "nyota" ? <HandoffSection key={state ?? "live"} h={handoffFor(isHandoffState(state) ? state : undefined)} /> : undefined}
          onMerge={(id) => { const before = rows; const into = rows.find((l) => l.id === id)!.dupOf!; setRows(rows.filter((l) => l.id !== id)); setOpen(into);
            toast({ tone: "success", children: `Merged into ${rows.find((l) => l.id === into)!.company}`, meta: "added 1 note", action: { label: "Undo", onClick: () => { setRows(before); setOpen(id); } } }); }}
          onKeepBoth={(id) => { setRows(rows.map((l) => (l.id === id ? { ...l, dupOf: undefined } : l))); toast({ children: "Kept both. Corral won't ask about this pair again." }); }} /></div>}
      </div>

      {(n > 0 || running !== null) && (
        <div className={cx("l-bulk c-app", running !== null && "is-running")} role="region" aria-label="Bulk actions">
          {running !== null ? <>
            <Spinner /><span className="l-bulk__n">Enrolling {f(Math.round(1072 * running / 100))} of 1,072</span>
            <span className="k-bar l-bulk__bar" role="progressbar" aria-label="Enrolling" aria-valuenow={running} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${running}%` }} /></span>
            <span className="c-faint l-bulk__hint">Runs in the background. You can leave this page.</span>
          </> : <>
            <Check on mixed={!sel.all && !allOnPage} onChange={clear} label="Clear selection" />
            <span className="l-bulk__n">{selectionLabel(sel, shown.length, total)}</span>
            <span className="l-bulk__sep" aria-hidden="true" />
            <Button variant="primary" onClick={enroll}><Icon name="seq" />Enroll{n >= BULK_CONFIRM_AT ? ` ${f(n)}` : ""}</Button>
            <span className="l-bulk__more">
              <StatusMenu label="Set status for the selection" side="top" defaultOpen={state === "status-menu"} onChange={(s) => setStatus(lv && sel.all ? "all" : selectedIds, s)} />
              <DropdownMenu label="Add to segment" side="top" width={240} items={[{ heading: "Add to a segment" }, ...(live ? live.segments.list.map((s) => ({ label: s.name, meta: String(s.count), onSelect: () => lv?.addToSegment(s, sel.all ? "all" : [...sel.ids]) }))
                : SAVED_SEGMENTS.map(([s, c]) => ({ label: s, meta: String(c), onSelect: () => toast({ tone: "success", icon: "layers", children: `Added ${f(n)} to ${s}`, meta: "pinned, even if rules change" }) }))),
                "separator", { label: "New segment from selection", icon: "plus", onSelect: () => { if (!sel.all) setPins({ ids: [...sel.ids] }); setDraft({ rules: rules.length ? rules : [newRule("fit")], match, name: "" }); onBuilderOpenChange(true); } }]}
                trigger={(tp) => <button type="button" className="c-btn" {...tp}><Icon name="layers" />Add to segment<Icon name="down" size={12} /></button>} />
              <Button onClick={() => toast({ icon: "upload", children: `Exporting ${f(n)} companies`, meta: "CSV lands in your downloads" })}>Export</Button>
            </span>
            <button type="button" className="c-iconbtn l-bulk__x" aria-label="Clear selection" onClick={clear}><Icon name="x" /></button>
            <span className="c-kbd l-bulk__esc" aria-hidden="true">Esc</span>
          </>}
        </div>
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)} width={500} title={`Enroll ${f(n)} companies in a sequence`}
        description="Large enrollments are checked first, then run in the background. Nothing sends until the first send time."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" onClick={() => { setConfirm(false); doneRef.current = false; setRunning(0); }}>Enroll {f(willEnroll)}</Button></>}>
        <Select label="Sequence" value={seq} onChange={setSeq} icon="seq" options={[{ value: "pilot", label: "Cold-room pilot", meta: "4 steps · 12 days" }, { value: "proof", label: "Dairy proof drip", meta: "3 steps · 9 days" }]} />
        <ul className="l-plan">
          <li className="is-main"><span className="l-plan__n">{f(willEnroll)}</span><span>will be enrolled</span></li>
          {skips.map(([k, why]) => <li key={why}><span className="l-plan__n">{f(k)}</span><span>skipped: {why}</span></li>)}
        </ul>
        <Banner tone="info" title={`Sends spread over ${plan ? plan.days : Math.ceil(willEnroll / perDay)} working days.`}>Your mailbox pool sends {perDay} a day, so the first emails go out Thursday 08:10 and the last next Wednesday.</Banner>
      </Dialog>
      <ImportDialog open={importOpen} onClose={() => onImportOpenChange(false)} existing={importLive.existing} seed={importSeed(state)} sample={importLive.sample} runner={importLive.runner}
        onDone={(m) => toast({ tone: "success", children: m, meta: "scoring now" })}
        onSegment={(importId) => { onImportOpenChange(false); if (lv) setPins({ importId }); setDraft({ rules: [{ ...newRule("source"), value: ["CSV import"] }], match: "all", name: lv ? "" : "Trade show · Sep" }); onBuilderOpenChange(true); }} />
    </div>
  );
}

function Subbar({ view, tab, setTab, counts }: { view: string; tab: string; setTab: (t: string) => void; /** live tab counts; a missing one shows blank until it answers */ counts?: Partial<Record<string, number>> }) {
  if (view !== "companies") return null;
  return <div className="c-subbar"><Tabs label="Companies" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: counts ? (counts[t.id] === undefined ? "" : f(counts[t.id]!)) : f(t.total) }))} /></div>;
}

function FirstRun({ onImport, onFind }: { onImport: () => void; onFind: () => void }) {
  return (
    <div className="l-first">
      <span className="l-first__kicker">Companies · ColdTrace</span>
      <h2>Bring in the companies you already know</h2>
      <p>Import a list from a spreadsheet or your CRM, or let Corral find companies that fit. Either way, Corral reads each website and scores it for ColdTrace Sensors.</p>
      <div className="l-first__paths">
        <button type="button" className="l-first__path" onClick={onImport}><Icon name="upload" size={16} /><span><b>Import a CSV</b><span>Trade-show lists, CRM exports, a sheet from sales. You map the columns; duplicates are caught first.</span></span></button>
        <button type="button" className="l-first__path" onClick={onFind}><Icon name="globe" size={16} /><span><b>Find companies</b><span>Describe who you sell to and Corral searches the market. Press <span className="c-kbd">⌘K</span> anywhere.</span></span></button>
      </div>
    </div>
  );
}
