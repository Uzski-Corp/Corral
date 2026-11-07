"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { SequencesEmpty } from "../Empties";
import { Tabs } from "../Tabs";
import { useToast } from "../Toaster";
import { DEMO_TODAY_M4 } from "../discovery/data";
import { issuesOf, poolSummary, sendDays, spanDays, type Gate, type Mailbox, type Step } from "@/lib/sequences/sequence";
import type { SequenceReviewState } from "@/lib/sequences/state";
import { blankSequence, seedFor, type Sequence } from "./data";
import { IssuesBanner, LaunchState, Launching, PausedBanner, RunNumbers, SeqHeader, SeqList, StepList } from "./Steps";
import { useAppData } from "@/components/session/AppData";
import { StepEditor } from "./Editor";
import { PoolView } from "./Pool";

export type SeqTab = "sequences" | "pool";
const f = (n: number) => n.toLocaleString("en-US");

/**
 * Sequences (M6): the list on the left, the open sequence's steps with the waits and conditions
 * between them, a step's editor with its preview against a real company, and the mailbox pool.
 * Review states are frozen; the default view is live (launch runs its checks, pause and resume).
 */
export type SequenceCatalog = {
  phase: "loading" | "ready" | "error";
  list: Sequence[];
  onRetry?: () => void;
  onPersist?: (seq: Sequence) => void;
};

export function SequencesView({ state, tab, onTabChange, pool, onPoolChange, newSignal = 0, catalog, onConnectMailbox }: {
  state?: SequenceReviewState; tab: SeqTab; onTabChange: (t: SeqTab) => void;
  pool: Mailbox[]; onPoolChange: (p: Mailbox[]) => void; newSignal?: number;
  /** Signed-in sequences. When set, the sample list is not used. */
  catalog?: SequenceCatalog;
  /** M13: where "Connect mailbox" goes (onboarding step 4 in the app). Defaults to the Mailbox pool tab. */ onConnectMailbox?: () => void;
}) {
  const toast = useToast();
  const frozen = !!state || !!catalog;
  const seed = useMemo(() => (catalog
    ? { list: catalog.list, open: catalog.list[0]?.id ?? null, tab: "sequences" as const, pool, phase: catalog.phase === "ready" ? undefined : catalog.phase }
    : seedFor(state)), [catalog, pool, state]);
  const [list, setList] = useState<Sequence[]>(seed.list);
  const [open, setOpen] = useState<string | null>(seed.open);
  const [step, setStep] = useState<number | undefined>(seed.step);
  const [copilot, setCopilot] = useState(seed.form === "copilot");
  const [preview, setPreview] = useState(seed.preview ?? "mara");
  const [tried, setTried] = useState(!!seed.tried);
  const [confirm, setConfirm] = useState(seed.launch === "confirm");
  const [phase, setPhase] = useState<"ready" | "loading" | "error">(seed.phase ?? "ready");

  const seq = list.find((s) => s.id === open);
  const issues = useMemo(() => (seq && seq.status === "draft" ? issuesOf(seq.steps, seq.missing, seq.audience.count) : []), [seq]);
  // The save goes out here, not inside the state updater: React may run an updater twice.
  const put = (id: string, patch: Partial<Sequence> | ((s: Sequence) => Partial<Sequence>)) => {
    const cur = list.find((s) => s.id === id);
    if (!cur) return;
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    setList((l) => l.map((s) => (s.id === id ? next : s)));
    catalog?.onPersist?.(next);
  };
  const putStep = (i: number, st: Step) => seq && put(seq.id, (s) => ({ steps: s.steps.map((x, k) => (k === i ? st : x)), updated: "just now" }));
  const putGate = (i: number, g: Gate) => seq && put(seq.id, (s) => ({ steps: s.steps.map((x, k) => (k === i ? { ...x, gate: g } : x)), updated: "just now" }));

  // M13 (gap 4): a real blank draft, owned by whoever is signed in. No sample product, audience or copy.
  const me = useAppData()?.person.name ?? "You";
  const blank = (id: string): Sequence => blankSequence(id, me);
  const start = (withCorral: boolean) => {
    // Signed in, the id becomes the sequence's public id on the server, so it can't repeat one in the list.
    let n = list.length;
    while (list.some((s) => s.id === `new-${n}`)) n += 1;
    const id = `new-${n}`;
    // A blank draft is stored on its first edit (start can run during render, so no request here).
    setList((l) => [blank(id), ...l]); setOpen(id); setStep(0); setCopilot(withCorral); setTried(false);
  };
  const create = (withCorral: boolean) => { start(withCorral); onTabChange("sequences"); };
  // "New sequence" in the top bar bumps newSignal (only shown on the Sequences tab).
  const [signal, setSignal] = useState(newSignal);
  if (newSignal !== signal) { setSignal(newSignal); start(false); }

  // Live launch (M13, gap 5): checks → Queued (no mailbox: Waiting for mailbox) → Sending → Live, or Failed.
  // The server owns these; the client only reflects them. A launch never sits on "launching" past its checks.
  const sendable = pool.filter((m) => m.state === "warm" || m.state === "warming").length;
  const launching = list.find((s) => s.status === "launching");
  const waiting = list.find((s) => s.status === "queued" && s.queue?.reason === "mailbox");
  const sendingSeq = list.find((s) => s.status === "sending");
  useEffect(() => {
    if (frozen || !launching) return;
    const t = setTimeout(() => {
      const next = (launching.launch?.stage ?? 0) + 1;
      if (next < 3) put(launching.id, { launch: { stage: next } });
      else if (!sendable) put(launching.id, { status: "queued", launch: undefined, queue: { reason: "mailbox", since: "just now" } });
      else put(launching.id, { status: "sending", launch: undefined, sending: { sent: 0, total: launching.audience.count } });
    }, 1100);
    return () => clearTimeout(t);
  }, [frozen, launching, sendable]);
  useEffect(() => { // a mailbox connected while queued: start sending
    if (frozen || !waiting || !sendable) return;
    // the server picks the queued launch up on its next tick, not in the same render
    const t = setTimeout(() => put(waiting.id, { status: "sending", queue: undefined, sending: { sent: 0, total: waiting.audience.count } }), 600);
    return () => clearTimeout(t);
  }, [frozen, waiting, sendable]);
  useEffect(() => {
    if (frozen || !sendingSeq?.sending) return;
    const { sent, total } = sendingSeq.sending;
    const t = setTimeout(() => {
      if (sent + 20 < total) { put(sendingSeq.id, { sending: { sent: sent + 20, total } }); return; }
      put(sendingSeq.id, { status: "running", sending: undefined, run: { enrolled: total, active: total, replied: 0, meetings: 0, bounced: 0, unsubscribed: 0 } });
      toast({ tone: "success", icon: "seq", children: `${sendingSeq.name} is live`, meta: `${f(total)} first emails sent` });
    }, 900);
    return () => clearTimeout(t);
  }, [frozen, sendingSeq, toast]);
  const connectMailbox = onConnectMailbox ?? (() => onTabChange("pool"));
  const retry = () => { if (!seq) return; put(seq.id, { status: sendable ? "sending" : "queued", failure: undefined, queue: sendable ? undefined : { reason: "mailbox", since: "just now" }, sending: { sent: 0, total: seq.audience.count } }); };

  const launch = () => { if (!seq) return; if (issues.length) { setTried(true); setStep(undefined); return; } setConfirm(true); };
  const go = () => { if (!seq) return; setConfirm(false); setStep(undefined); put(seq.id, { status: "launching", launch: { stage: 0 } }); };
  const pause = () => {
    if (!seq) return; const before = seq;
    const held = seq.steps.reduce((a, s) => a + (s.stats?.due ?? 0), 0);
    put(seq.id, { status: "paused", paused: { by: "Tomás Ibarra", at: "just now", held } });
    toast({ children: `Paused ${seq.name}`, meta: `${held} emails due tomorrow wait`, action: { label: "Undo", onClick: () => put(before.id, before) } });
  };
  const resume = () => { if (!seq) return; put(seq.id, { status: "running", paused: undefined }); toast({ tone: "success", children: `Resumed ${seq.name}`, meta: "what came due goes out over the next morning" }); };

  const poolTab = (
    <div className="c-subbar"><Tabs label="Sequences" value={tab} onChange={(t) => onTabChange(t as SeqTab)} tabs={[
      { id: "sequences", label: "Sequences", count: phase === "ready" ? list.length : undefined },
      { id: "pool", label: "Mailbox pool", count: pool.length }]} /></div>
  );

  // The sequence transport has no live launch/control integration yet. Never
  // render sample audiences, mail merge recipients, or local send simulations.
  if (catalog) return <div className="c-view q-view">{poolTab}<div className="c-view c-view--center">
    {catalog.phase === "error" ? <ErrorState title="Couldn’t load sequences" actions={<Button onClick={catalog.onRetry}>Try again</Button>}>Try loading your saved sequences again.</ErrorState>
      : catalog.phase === "loading" ? <div role="status">Loading sequences…</div>
      : <div><EmptyState id="sequences" title={tab === "pool" ? "Mailbox connections are not available yet" : "Sequence sending is not available yet"}>Use the demo mailbox in Unibox for approved recipients.</EmptyState>
        {!!catalog.list.length && <ul aria-label="Saved sequences">{catalog.list.map(s => <li key={s.id}>{s.name} · {s.status}</li>)}</ul>}</div>}
  </div></div>;

  if (tab === "pool") {
    const set = (id: string, patch: Partial<Mailbox>) => onPoolChange(pool.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    return (
      <div className="c-view q-view">{poolTab}
        <div className="c-view__scroll"><PoolView pool={pool} today={DEMO_TODAY_M4}
          onCap={(id, cap) => { set(id, { cap }); toast({ children: `Daily cap set to ${cap}`, meta: pool.find((m) => m.id === id)!.address }); }}
          onReconnect={(id) => { set(id, { state: "warm", since: undefined, note: undefined }); toast({ tone: "success", children: `Reconnected ${pool.find((m) => m.id === id)!.address}`, meta: "sending again from the next slot" }); }}
          onResume={(id) => { set(id, { state: "warm", bouncedToday: 0, note: undefined, since: undefined }); toast({ children: `${pool.find((m) => m.id === id)!.address} is sending again`, meta: "mwanzafish.co.tz stays blocked" }); }}
          onBounces={() => toast({ icon: "mail", children: "4 bounces today", meta: "3 at mwanzafish.co.tz · 1 at dodomadairy.co.tz" })} /></div>
      </div>
    );
  }
  if (phase === "loading") return (
    <div className="c-view q-view">{poolTab}<div className="q-layout">
      <div className="d-runs" role="status" aria-label="Loading sequences"><div className="d-runs__head"><span>Sequences</span></div>
        {[170, 140, 190, 120].map((w) => <div key={w} className="d-runrow d-runrow--skel"><Skeleton w={w} /><Skeleton w={w - 40} h={10} /></div>)}</div>
      <div className="d-main c-view__scroll" aria-hidden="true"><div className="d-run q-seq"><Skeleton w={300} h={20} />{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={76} r={10} />)}</div></div>
    </div></div>
  );
  if (phase === "error") return (
    <div className="c-view q-view">{poolTab}<div className="c-view c-view--center"><ErrorState title="Couldn’t load sequences" detail="GET /api/v1/sequences · 503"
      actions={<Button variant="primary" onClick={() => setPhase("ready")}><Icon name="refresh" />Try again</Button>}>
      Sequences keep sending on the server; this is only the page failing to load them.</ErrorState></div></div>
  );
  if (list.length === 0) return (
    <div className="c-view q-view">{poolTab}<div className="c-view c-view--center">
      <SequencesEmpty onDraft={() => create(true)} onBlank={() => create(false)} /></div></div>
  );

  const actions = seq && (
    seq.status === "draft" ? <><span className="d-credits">Edited {seq.updated}</span><Button variant="primary" onClick={launch}><Icon name="send" />Launch</Button></>
    : seq.status === "running" || seq.status === "sending" ? <Button onClick={pause}>Pause</Button>
    : seq.status === "paused" ? <Button variant="primary" onClick={resume}>Resume</Button>
    : <Button variant="quiet" onClick={() => put(seq.id, { status: "draft", launch: undefined, queue: undefined, sending: undefined, failure: undefined })}>Cancel launch</Button>
  );
  const s = pool.filter((m) => m.state === "warm" || m.state === "warming");
  const perDay = poolSummary(pool).tomorrow;
  const days = sendDays(seq ? seq.audience.count : 0, Math.round(perDay / 3));
  const n = seq ? seq.audience.count - (seq.audience.skipped?.reduce((a, x) => a + x.n, 0) ?? 0) : 0;

  return (
    <div className="c-view q-view">{poolTab}
      <div className={cx("q-layout", open && "has-open", step !== undefined && "has-step")}>
        <SeqList list={list} open={open} onOpen={(id) => { setOpen(id); setStep(undefined); setTried(false); setCopilot(false); }} onNew={() => create(false)} />
        <div className="d-main c-view__scroll q-main">
          <button type="button" className="d-back" onClick={() => setOpen(null)}><Icon name="back" />All sequences</button>
          {seq && <div className="d-run q-seq">
            <SeqHeader seq={seq} actions={actions} />
            {seq.status === "paused" && <PausedBanner seq={seq} />}
            {seq.status === "launching" && <Launching seq={seq} />}
            <LaunchState seq={seq} onConnect={connectMailbox} onRetry={retry} />
            {tried && <IssuesBanner issues={issues} onFix={(k) => { setStep(k - 1); setCopilot(false); }} />}
            {!tried && issues.length > 0 && <p className="q-pre"><Icon name="alert" size={12} />{issues.length === 1 ? "1 thing" : `${issues.length} things`} to fix before launch<Button size="sm" variant="quiet" onClick={() => setTried(true)}>Show</Button></p>}
            <RunNumbers seq={seq} />
            {seq.status !== "draft" && seq.status !== "launching" && seq.status !== "queued" && step !== undefined && <p className="q-pre q-pre--info"><Icon name="pen" size={12} />Pause the sequence to change its steps; emails already sent stay as they were.</p>}
            <StepList seq={seq} active={step} issues={tried ? issues : []} onOpen={(i) => { setStep(i); setCopilot(false); }} onGate={putGate}
              onAdd={() => { put(seq.id, (x) => ({ steps: [...x.steps, { id: `${x.id}-${x.steps.length + 1}`, thread: "reply", subject: "", body: "", gate: { wait: 3, cond: "no-reply" } }] })); setStep(seq.steps.length); }}
              openCondition={state === "conditions" ? 2 : undefined} />
            <p className="q-from c-faint">Sends from the mailbox pool: {s.length} mailboxes, rotated, 2–7 minutes apart. <button type="button" className="c-link" onClick={() => onTabChange("pool")}>See the pool</button></p>
          </div>}
        </div>
        {seq && step !== undefined && seq.steps[step] && (
          <div className="q-edwrap">
            <StepEditor key={`${seq.id}-${step}`} seq={seq} i={step} onClose={() => { setStep(undefined); setCopilot(false); }} onChange={(st) => putStep(step, st)}
              preview={preview} onPreview={setPreview} copilot={copilot} onCopilot={setCopilot} tried={tried} issues={issues.filter((x) => x.step === step + 1)} />
          </div>
        )}
      </div>
      {seq && <Dialog open={confirm} onClose={() => setConfirm(false)} width={520} title={`Launch ${seq.name}`}
        description="Nothing sends until Thursday morning, and you can pause at any point."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" onClick={go}><Icon name="send" />Launch to {f(n)}</Button></>}>
        <ul className="q-confirm">{([
          [`${f(n)} companies get step 1`, `${f(n)} of ${f(seq.audience.count)} in ${seq.audience.label}${seq.audience.skipped?.length ? `; ${seq.audience.skipped.map((x) => `${x.n} ${x.why}`).join(", ")}` : ""}`],
          ["First emails Thursday 1 Oct, 08:10–10:40 their time", "each company’s own morning, never at the weekend"],
          [`Spread over ${days} ${days === 1 ? "morning" : "mornings"}, alongside the 2 running sequences`, `${s.length} mailboxes, rotated, 2–7 minutes apart`],
          ["9 emails older than 90 days are re-checked first", "18 credits; any that bounce are left out"],
          ["Stops for anyone who replies, books a meeting or unsubscribes", `${seq.steps.length} steps over ${spanDays(seq.steps)} days`],
        ] as [string, string][]).map(([t, m]) => <li key={t}><Icon name="check" size={12} /><span><span>{t}</span><span className="c-faint">{m}</span></span></li>)}</ul>
      </Dialog>}
    </div>
  );
}
