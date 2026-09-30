"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { Banner, EmptyState } from "../States";
import { Tabs } from "../Tabs";
import { SegmentTable } from "../SegmentTable";
import { Progress } from "../kb/parts";
import { formatCountdown } from "@/lib/auth/code";
import { SKIP_TEXT, STAGES, currentStage, etaText, overallPercent, plural, runHeadline, zeroResultHints, type Run, type RunStatus, type StageProgress } from "@/lib/discovery/run";
import type { Result } from "./data";

const f = (n: number) => n.toLocaleString("en-US");

/* ---------------------------------------------------------------- status */

export function runTone(r: Pick<Run, "status" | "found">): { label: string; tone: "live" | "neutral" | "caution" | "negative" } {
  const m: Record<RunStatus, { label: string; tone: "live" | "neutral" | "caution" | "negative" }> = {
    running: { label: "Running", tone: "live" }, queued: { label: "Queued", tone: "neutral" }, paused: { label: "Paused", tone: "caution" },
    done: { label: r.found ? "Finished" : "No results", tone: "neutral" }, partial: { label: "Finished · some skipped", tone: "caution" },
    failed: { label: "Stopped", tone: "negative" }, cancelled: { label: "Cancelled", tone: "neutral" },
  };
  return m[r.status];
}
export function RunTag({ run }: { run: Pick<Run, "status" | "found"> }) {
  const t = runTone(run);
  return <span className={cx("d-runtag", `is-${t.tone}`)}>{t.tone === "live" && <span className="d-live" aria-hidden="true" />}{t.label}</span>;
}

/* ---------------------------------------------------------------- runs list */

export function RunsList({ runs, open, onOpen, onNew }: { runs: Run[]; open: string | null; onOpen: (id: string) => void; onNew: () => void }) {
  return (
    <nav className="d-runs" aria-label="Discovery runs">
      <div className="d-runs__head"><span>Runs</span><span className="c-faint">{runs.length}</span></div>
      <ul>
        {runs.map((r) => (
          <li key={r.id}>
            <button type="button" className={cx("d-runrow", open === r.id && "is-on")} aria-current={open === r.id ? "true" : undefined} onClick={() => onOpen(r.id)}>
              <span className="d-runrow__name">{r.name}</span>
              <span className="d-runrow__line">{runHeadline(r)}</span>
              <span className="d-runrow__meta"><RunTag run={r} />{r.finished ?? r.started ?? "not started"} · {r.by.split(" ")[0]}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="d-runs__new" onClick={onNew}><Icon name="plus" size={12} />New run</button>
    </nav>
  );
}

/* ---------------------------------------------------------------- stages */

function StageIcon({ s }: { s: StageProgress }) {
  if (s.state === "done") return <Icon name="check" size={12} />;
  if (s.state === "failed") return <Icon name="alert" size={12} />;
  if (s.state === "paused") return <Icon name="clock" size={12} />;
  if (s.state === "running") return <span className="d-live" aria-hidden="true" />;
  return <span className="d-stage__wait" aria-hidden="true" />;
}
const STATE_WORD: Record<StageProgress["state"], string> = { waiting: "waiting", running: "running", done: "done", paused: "paused", failed: "stopped" };

/** Five stages, left to right. Each only processes what the stage before it finished. */
export function StageStrip({ run }: { run: Run }) {
  const pct = overallPercent(run);
  const live = run.status === "running" || run.status === "paused";
  return (
    <div className="d-stages">
      <ol className="d-stages__list">
        {STAGES.map((m, i) => {
          const s = run.stages[m.id];
          const pv = s.total ? Math.round((s.done / s.total) * 100) : s.total === 0 ? 0 : s.state === "done" ? 100 : s.state === "running" ? undefined : 0;
          return (
            <li key={m.id} className={cx("d-stage", `is-${s.state}`)}>
              <span className="d-stage__top"><span className="d-stage__icon"><StageIcon s={s} /></span><span className="d-stage__label">{i + 1} · {m.label}</span>
                <span className="l-sr">, {STATE_WORD[s.state]}</span></span>
              <span className="d-stage__n c-num">{s.state === "waiting" ? "—" : f(s.done)}{s.total !== null && s.state !== "waiting" && <span className="c-faint"> / {f(s.total)}</span>}</span>
              <Progress value={s.state === "waiting" ? 0 : pv} label={`${m.label}: ${s.state === "waiting" ? "waiting" : `${f(s.done)}${s.total ? ` of ${f(s.total)}` : ""} ${m.unit}`}`} tone={s.state === "failed" ? "error" : undefined} />
              <span className="d-stage__prov c-mono">{m.provider}</span>
            </li>
          );
        })}
      </ol>
      {live && <p className="d-stages__sum c-muted"><span className="c-num c-strong">{pct}%</span> · {run.status === "paused" ? "reading and scoring continue; finding people waits" : `${etaText(((100 - pct) / 100) * 30)} left`} · {f(run.credits.used)} of ~{f(run.credits.estimate)} credits used</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- the run */

export type RunAction = "pause" | "cancel" | "resume" | "retry-timeouts" | "segment" | "open-companies" | "edit" | "widen" | "unqueue";

function Criteria({ run }: { run: Run }) {
  const c = run.criteria;
  const bits = [c.industries.join(", "), c.countries.join(", "), `${c.sizes.join(", ")} people`];
  return (
    <p className="d-criteria">
      {bits.map((b) => <span key={b} className="c-chip">{b}</span>)}
      <span className="c-faint">up to {f(run.limit)} · people at fit ≥ {run.enrichAt}</span>
    </p>
  );
}

function StatusBanner({ run, countdown, onAction }: { run: Run; countdown?: number; onAction: (a: RunAction) => void }) {
  if (run.status === "queued") return (
    <Banner tone="info" icon="clock" title={`Queued behind ${run.after}`} action={<Button onClick={() => onAction("unqueue")}>Remove from queue</Button>}>
      Corral runs one discovery at a time per workspace, so credits and provider limits go to one run. This one starts by itself, in about 9 min.
    </Banner>
  );
  if (run.status === "paused") return (
    <Banner tone="caution" icon="clock" title={`Paused: ${run.limitedBy}'s hourly limit`}>
      Corral asked {run.limitedBy} for 400 lookups this hour, the most your plan allows. Finding people resumes by itself in <span className="c-strong c-num">{formatCountdown(countdown ?? run.resumeIn ?? 60)}</span>. Nothing is lost and no credits are spent while it waits; reading and scoring carry on.
    </Banner>
  );
  if (run.status === "failed" && run.failure) return (
    <Banner tone="error" title={run.failure.title} action={<span className="d-acts"><Button variant="ink" onClick={() => onAction("resume")}>Resume from search</Button><Button onClick={() => onAction("edit")}>Edit and run again</Button></span>}>
      {run.failure.fix}
    </Banner>
  );
  if (run.status === "partial" && run.skipped) {
    const n = run.skipped.reduce((a, [, k]) => a + k, 0);
    const retry = run.skipped.find(([k]) => k === "timeout")?.[1] ?? 0;
    return (
      <Banner tone="caution" title={`${f(n)} of ${f(run.found)} sites couldn’t be read`} action={retry ? <Button onClick={() => onAction("retry-timeouts")}>Retry the {retry} that timed out</Button> : undefined}>
        <ul className="d-skips">{run.skipped.map(([k, m]) => <li key={k}><span className="c-num">{m}</span> {SKIP_TEXT[k]}</li>)}</ul>
        Their companies are kept without a fit. Blocked sites stay unread; add a contact by hand to score them.
      </Banner>
    );
  }
  return null;
}

function Summary({ run, onAction }: { run: Run; onAction: (a: RunAction) => void }) {
  if ((run.status !== "done" && run.status !== "partial") || run.found === 0) return null;
  return (
    <div className="d-summary">
      <ul className="d-summary__nums">
        <li><span className="c-num">{f(run.found)}</span>found</li>
        <li><span className="c-num">{f(run.added)}</span>added to Companies</li>
        <li><span className="c-num">{f(run.updated)}</span>already in Corral, updated</li>
        <li><span className="c-num">{f(run.fits)}</span>fit 80+</li>
        <li><span className="c-num">{f(run.credits.used)}</span>credits used</li>
      </ul>
      <span className="d-acts"><Button onClick={() => onAction("open-companies")}>Open in Companies</Button><Button variant="primary" onClick={() => onAction("segment")}><Icon name="layers" />Make a segment from this run</Button></span>
    </div>
  );
}

function ZeroResults({ run, onAction }: { run: Run; onAction: (a: RunAction) => void }) {
  const hints = zeroResultHints(run.criteria, run.perQuery);
  return (
    <div className="d-zero">
      <EmptyState compact icon="search" title="No companies matched"
        actions={<><Button onClick={() => onAction("edit")}>Edit and run again</Button><Button variant="primary" onClick={() => onAction("widen")}>Add 201–1,000 and run again</Button></>}>
        <ul className="d-zero__hints">{hints.map((h) => <li key={h}>{h}</li>)}</ul>
      </EmptyState>
      {run.perQuery && (
        <details className="d-zero__queries">
          <summary>The {run.perQuery.length} searches and what they found</summary>
          <ul className="d-queries">{run.perQuery.map(([q, n]) => <li key={q}><span className="c-mono">{q}</span><span className="c-faint c-num">{n} results</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

const RTABS = [{ id: "all", label: "All" }, { id: "fit", label: "Fit 80+" }, { id: "needs", label: "Needs you" }] as const;

export function RunPanel({ run, results, active, onOpen, onAction, countdown, actions }: {
  run: Run; results: Result[]; active?: string; onOpen: (id: string) => void; onAction: (a: RunAction) => void; countdown?: number; actions?: ReactNode;
}) {
  const [tab, setTab] = useState<(typeof RTABS)[number]["id"]>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const needs = (r: Result) => r.enrich?.kind === "unreadable" || r.enrich?.kind === "no-people";
  const counts = { all: run.found, fit: Math.max(run.fits, results.filter((r) => r.fit >= 80).length), needs: results.filter(needs).length };
  const shown = useMemo(() => results.filter((r) => (tab === "fit" ? r.fit >= 80 : tab === "needs" ? needs(r) : true)), [results, tab]);
  const st = currentStage(run);
  const idle = run.status === "queued" || (run.status === "done" && run.found === 0);
  return (
    <section className="d-run" aria-label={run.name}>
      <header className="d-run__head">
        <div className="d-run__titles">
          <h2>{run.name}</h2>
          <p className="d-run__meta"><RunTag run={run} /><span>{run.product}</span><span>·</span><span>{run.by}</span><span>·</span><span>{run.status === "queued" ? "not started" : `started ${run.started}`}</span></p>
        </div>
        {actions && <div className="d-acts">{actions}</div>}
      </header>
      <Criteria run={run} />
      <StatusBanner run={run} countdown={countdown} onAction={onAction} />
      {!idle && <StageStrip run={run} />}
      <Summary run={run} onAction={onAction} />
      {run.status === "done" && run.found === 0 ? <ZeroResults run={run} onAction={onAction} />
        : run.status === "queued" ? <p className="d-queued c-muted">Results appear here as soon as the run starts: first the companies search finds, then each one&rsquo;s fit, people and email.</p>
        : (
          <div className="d-results l-leads">
            <div className="d-results__bar">
              <Tabs variant="pill" label="Results" value={tab} onChange={(v) => setTab(v as typeof tab)} tabs={RTABS.map((t) => ({ id: t.id, label: t.label, count: f(counts[t.id]) }))} />
              <span className="d-results__note c-faint">
                {sel.size > 0 ? <>{plural(sel.size, "company", "companies")} selected · <button type="button" className="c-link k-linkbtn" onClick={() => { setSel(new Set()); onAction("segment"); }}>Add to a segment</button></>
                  : run.status === "failed" ? `${f(run.found)} found before search stopped, not read yet`
                  : st && (run.status === "running" || run.status === "paused") ? "New rows arrive as sites are read" : "Every company here is in Companies"}
              </span>
            </div>
            <SegmentTable label={`Results: ${run.name}`} leads={shown} selected={sel} active={active} onOpen={onOpen}
              onToggle={(id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
            {shown.length < counts[tab] && <p className="l-more c-faint">Showing the first {f(shown.length)} of {f(counts[tab])}. The rest load as you scroll.</p>}
          </div>
        )}
    </section>
  );
}
