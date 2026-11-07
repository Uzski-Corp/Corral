"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { ErrorState, Skeleton, SkeletonTable } from "../States";
import { DiscoveryEmpty } from "../Empties";
import { useToast } from "../Toaster";
import { LeadDetail } from "../leads/Detail";
import { scoreFor } from "../fit/data";
import { advanceRun, type Run } from "@/lib/discovery/run";
import type { DiscoveryReviewState } from "@/lib/discovery/state";
import { DEMO_TODAY_M4, provOf, resultsFor, runsFor, type Result } from "./data";
import { RunPanel, RunsList, type RunAction } from "./Run";
import { RunSetup, SETUP_ERROR_SEED, type RunSetupSeed, type SetupProduct } from "./Setup";
import { useAppData } from "@/components/session/AppData";

const f = (n: number) => n.toLocaleString("en-US");

/** Companies stored on a live run. Sample runs keep the ColdTrace rows from resultsFor. */
function companiesOf(run: Run): Result[] {
  return (run.companies ?? []).map((c, i) => ({
    id: `${run.id}-${i}`, company: c.name, domain: c.domain, person: "", title: "", avatar: "",
    fit: 0, email: "Unverified", reply: "Not contacted", last: "—", why: c.why ? [c.why] : [],
    country: run.criteria.countries[0], industry: run.criteria.industries[0], source: "Corral search",
    via: run.criteria.queries[0] ?? run.name,
  }));
}

/** Products on the signed-in workspace, oldest first, for the new-run menu. */
function useWorkspaceProducts(live: boolean) {
  const data = useAppData();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [products, setProducts] = useState<SetupProduct[]>([]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!live || !data) return;
    const c = new AbortController();
    void data.kb.listProducts(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) {
        if (r.error.kind !== "aborted") setPhase("error");
        return;
      }
      setProducts([...r.value].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((p) => ({ id: p.id, name: p.name, sourceCount: p.sourceCount })));
      setPhase("ready");
    });
    return () => c.abort();
  }, [live, data, attempt]);
  const retry = () => { setPhase("loading"); setAttempt((n) => n + 1); };
  return { phase, products, retry };
}

/**
 * Discovery (M4): the runs that find companies for a product. Runs list on the left, the open run
 * on the right (stages, results arriving with their enrichment state), a result's detail with
 * provenance per field. Review states are frozen; the default view ticks the running run to done.
 */
export type DiscoveryCatalog = {
  phase: "loading" | "ready" | "error";
  runs: Run[];
  productName?: string;
  /** Credits left this month, once the runs request has answered. */
  creditsLeft?: number | null;
  onRetry?: () => void;
  /** Persist a run. The server sends it to Pi and spends the estimate. */
  onCreate?: (run: Run) => Promise<Run>;
};

export function DiscoveryView({ state, setupOpen, onSetupOpenChange, onOpenCompanies, onSegment, catalog }: {
  state?: DiscoveryReviewState; setupOpen: boolean; onSetupOpenChange: (o: boolean) => void;
  onOpenCompanies: () => void; onSegment?: (name: string) => void;
  /** Signed-in data. When set, the sample runs are not used. */
  catalog?: DiscoveryCatalog;
}) {
  const toast = useToast();
  const data = useAppData();
  const workspaceProducts = useWorkspaceProducts(!!catalog);
  const frozen = !!state || !!catalog;
  const seeded = useMemo(() => (catalog ? { runs: catalog.runs, open: catalog.runs[0]?.id ?? null } : runsFor(state)), [catalog, state]);
  const [runs, setRuns] = useState<Run[]>(seeded.runs);
  const [open, setOpen] = useState<string | null>(seeded.open);
  const [detail, setDetail] = useState<string | undefined>(state === "detail" ? "kilima" : undefined);
  const [localPhase, setPhase] = useState<"ready" | "loading" | "error">(state === "loading" ? "loading" : state === "error" ? "error" : "ready");
  const phase = catalog ? catalog.phase : localPhase;
  const [seed, setSeed] = useState<RunSetupSeed | undefined>(state === "new-error" ? SETUP_ERROR_SEED : undefined);
  const [countdown, setCountdown] = useState<number | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => { if (state === "new" || state === "new-error") onSetupOpenChange(true); }, [state, onSetupOpenChange]);
  // Live demo: the running run advances until it's done.
  const liveRunning = !frozen && runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!liveRunning) return;
    const t = setInterval(() => { setRuns((rs) => rs.map((r) => advanceRun(r))); setTick((n) => n + 1); }, 1400);
    return () => clearInterval(t);
  }, [liveRunning]);
  const doneNow = runs.find((r) => r.id === "dairy")?.status === "done";
  useEffect(() => {
    if (!frozen && doneNow) toast({ tone: "success", icon: "globe", children: "Dairy & cold rooms · East Africa finished", meta: "203 added to Companies" });
  }, [doneNow, frozen, toast]);
  const paused = runs.find((r) => r.status === "paused");
  useEffect(() => {
    if (frozen || !paused) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, (c ?? paused.resumeIn ?? 60) - 1)), 1000);
    return () => clearInterval(t);
  }, [frozen, paused]);

  const creating = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const liveStamp = catalog?.runs.map((r) => `${r.id}:${r.status}:${r.found}:${r.companies?.length ?? 0}`).join("|") ?? "";
  useEffect(() => {
    const current = catalogRef.current;
    if (!current) return;
    setRuns((local) => {
      const ids = new Set(current.runs.map((r) => r.id));
      return [...local.filter((r) => !ids.has(r.id)), ...current.runs];
    });
  }, [liveStamp]);

  const run = runs.find((r) => r.id === open);
  const results = useMemo(() => {
    if (!run) return [];
    const rows = catalog ? companiesOf(run) : resultsFor(run);
    if (frozen || run.status !== "running") return rows;
    // Live: busy rows with a person settle one by one.
    let settled = 0;
    return rows.map((r): Result => (r.person && r.enrich && ["finding", "verifying"].includes(r.enrich.kind) && settled++ < tick ? { ...r, enrich: { kind: "done" } } : r));
  }, [run, frozen, tick]);
  const lead = detail ? results.find((r) => r.id === detail) : undefined;
  const running = runs.find((r) => r.status === "running" || r.status === "paused");
  const me = data?.person.name ?? "You";

  const act = (a: RunAction) => {
    if (!run) return;
    if (catalog && a !== "edit" && a !== "widen") { toast({ children: "Run controls are not available yet." }); return; }
    const set = (patch: Partial<Run>) => setRuns((rs) => rs.map((r) => (r.id === run.id ? { ...r, ...patch } : r)));
    if (a === "pause") { set({ status: "paused", limitedBy: undefined }); toast({ children: `Paused ${run.name}`, meta: "nothing is lost; resume any time", action: { label: "Resume", onClick: () => set({ status: "running" }) } }); }
    else if (a === "cancel") { const before = run; set({ status: "cancelled" }); toast({ children: `Cancelled ${run.name}`, meta: `${f(run.found)} companies found so far stay in Companies`, action: { label: "Undo", onClick: () => set(before) } }); }
    else if (a === "resume") { set({ status: "running", failure: undefined, stages: { ...run.stages, search: { ...run.stages.search, state: "running" } } }); toast({ children: `Resumed ${run.name}`, meta: "from search 13 of 18" }); }
    else if (a === "retry-timeouts") toast({ children: "Retrying 5 sites that timed out", meta: "with a 60-second wait this time" });
    else if (a === "segment") { onSegment?.(run.name); toast({ tone: "success", icon: "layers", children: `Segment “${run.name}” created`, meta: "live: Added by this run" }); }
    else if (a === "open-companies") onOpenCompanies();
    else if (a === "unqueue") { setRuns((rs) => rs.filter((r) => r.id !== run.id)); setOpen(runs[0].id); toast({ children: `Removed ${run.name} from the queue` }); }
    else if (a === "edit" || a === "widen") { setSeed({ criteria: a === "widen" ? { ...run.criteria, sizes: [...run.criteria.sizes, "201–1,000"] } : run.criteria, limit: run.limit, enrichAt: run.enrichAt }); onSetupOpenChange(true); }
  };

  const start = async (r: { name: string; product: string; criteria: Run["criteria"]; limit: number; enrichAt: number; queued: boolean }) => {
    if (creating.current) return;
    const id = `new-${runs.length}`;
    const blank = { done: 0, total: null, state: "waiting" as const };
    const nr: Run = { id, name: r.name, product: r.product, by: me, criteria: r.criteria, limit: r.limit, enrichAt: r.enrichAt,
      status: catalog ? "running" : "queued", after: !catalog && r.queued ? running?.name : undefined, position: !catalog && r.queued ? 1 : 0, started: catalog ? "just now" : undefined,
      stages: { search: catalog ? { done: 0, total: null, state: "running" } : blank, read: blank, score: blank, people: blank, verify: blank },
      found: 0, added: 0, updated: 0, fits: 0, credits: { used: 0, estimate: catalog ? 0 : 221 } };
    let saved = nr;
    if (catalog) {
      creating.current = true;
      try {
        if (!catalog.onCreate) throw new Error("Discovery is not available yet.");
        saved = await catalog.onCreate(nr);
      } catch (error) { toast({ tone: "error", children: error instanceof Error ? error.message : "The run was not saved. Try again." }); return; }
      finally { creating.current = false; }
    }
    setRuns((rs) => [saved, ...rs]); setOpen(saved.id); setDetail(undefined); onSetupOpenChange(false); setSeed(undefined);
    toast({ icon: "globe", children: catalog ? `Started ${saved.name}` : `Queued ${r.name}`, meta: catalog ? `${f(saved.credits.used)} credits spent · Pi has this run` : r.queued ? `starts after ${running?.name}` : "starts in a moment · you can close this page" });
  };
  // A queued run with nothing ahead is picked up shortly (the worker); then it is Running.
  const pickup = !frozen ? runs.find((r) => r.status === "queued" && !r.after) : undefined;
  useEffect(() => {
    if (!pickup) return;
    const t = setTimeout(() => setRuns((rs) => rs.map((r) => (r.id === pickup.id ? { ...r, status: "running", started: "just now", stages: { ...r.stages, search: { done: 0, total: 18, state: "running" } } } : r))), 1800);
    return () => clearTimeout(t);
  }, [pickup]);

  const setup = <RunSetup open={setupOpen} onClose={() => { onSetupOpenChange(false); setSeed(undefined); }} onStart={start} seed={seed} key={JSON.stringify(seed ?? null)}
    queueBehind={catalog ? undefined : running?.name} held={catalog ? 0 : running ? running.credits.estimate - running.credits.used : 0}
    products={catalog ? workspaceProducts.products : undefined} productsPhase={workspaceProducts.phase} onRetryProducts={workspaceProducts.retry}
    creditsLeft={catalog ? (catalog.creditsLeft ?? null) : undefined} />;

  if (phase === "loading") return (
    <div className="c-view d-view"><div className="d-layout">
      <div className="d-runs" role="status" aria-label="Loading runs"><div className="d-runs__head"><span>Runs</span></div>
        {[180, 150, 200, 130].map((w) => <div key={w} className="d-runrow d-runrow--skel"><Skeleton w={w} /><Skeleton w={w - 50} h={10} /></div>)}</div>
      <div className="d-main c-view__scroll" tabIndex={0} aria-label="Run"><div className="d-run"><Skeleton w={320} h={20} /><div className="d-stages d-stages--skel">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} w={120} h={48} r={8} />)}</div>
        <div className="d-results l-leads"><SkeletonTable rows={8} label="Loading results" /></div></div></div>
    </div></div>
  );
  if (phase === "error") return (
    <div className="c-view c-view--center d-view"><ErrorState title="Couldn’t load discovery runs" detail="GET /api/v1/discovery/runs · 503"
      actions={<Button variant="primary" onClick={() => { catalog?.onRetry?.(); setPhase("ready"); }}><Icon name="refresh" />Try again</Button>}>
      Runs in progress keep going on the server; this is only the page failing to load them.</ErrorState></div>
  );
  if (runs.length === 0) return (
    <div className="c-view c-view--center d-view">
      <DiscoveryEmpty onStart={() => onSetupOpenChange(true)} />
      {setup}
    </div>
  );

  const actions = run && (
    run.status === "running" ? <><Button onClick={() => act("pause")}>Pause</Button><Button variant="quiet" onClick={() => act("cancel")}>Cancel run</Button></>
    : run.status === "paused" ? <Button variant="quiet" onClick={() => act("cancel")}>Cancel run</Button>
    : run.status === "queued" ? <Button onClick={() => act("edit")}>Edit</Button>
    : <Button onClick={() => act("edit")}><Icon name="refresh" />Run again</Button>
  );
  return (
    <div className="c-view d-view">
      <div className={cx("d-layout", lead && "has-detail", open && "has-open")}>
        <RunsList runs={runs} open={open} onOpen={(id) => { setOpen(id); setDetail(undefined); }} onNew={() => onSetupOpenChange(true)} />
        <div className="d-main c-view__scroll">
          <button type="button" className="d-back" onClick={() => setOpen(null)}><Icon name="back" />All runs</button>
          {run && <RunPanel key={run.id} run={run} results={results} active={detail} onOpen={setDetail} onAction={act} countdown={countdown} actions={actions} />}
        </div>
        {lead && (
          <div className="d-detail">
            {catalog ? <section aria-label={`${lead.company} details`}><h2>{lead.company}</h2><p>{lead.domain}</p>{lead.why.map(why => <p key={why}>{why}</p>)}<p className="c-faint">No verified contact or fit assessment is available.</p><Button onClick={() => setDetail(undefined)}>Back to results</Button></section> : <LeadDetail lead={lead} backLabel="Back to results" foundVia={lead.via} prov={provOf(lead)} today={DEMO_TODAY_M4} provOpen={state === "detail" ? "email" : undefined}
              fit={{ kind: "scored", score: scoreFor(lead, lead.fit, "2026-09-29") }}
              onClose={() => setDetail(undefined)} onStatus={() => toast({ children: "Status changed", meta: "sample action" })}
              onEnroll={() => toast({ tone: "success", children: `${lead.company} enrolled in Cold-room pilot`, meta: "first email Thursday 08:10" })} />}
          </div>
        )}
      </div>
      {setup}
    </div>
  );
}
