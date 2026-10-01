"use client";
/* /styleguide: M4 discovery runs, run states, run setup, enrichment state and provenance (ENG-54). Every piece live. */
import { useState, type ReactNode } from "react";
import {
  AppDemo, DEMO_TODAY_M4, LEAD_ROWS, LeadDetail, ProvenanceList, RUNS, RunSetup, RunTag, SETUP_ERROR_SEED, SegmentTable, StageStrip, StaleBanner, ToastProvider,
  provOf, resultsFor, runsFor,
} from "@/components/app";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};

const STATES: [string, string][] = [
  ["", "live: the running run ticks forward, results fill in"],
  ["empty", "no runs yet: what a run does, one button"],
  ["loading", "skeleton list and panel"],
  ["error", "runs couldn’t load; nothing lost, Try again"],
  ["new", "New run open, defaults from the product's ICP"],
  ["new-error", "New run with no countries and not enough credits"],
  ["queued", "a second run waits for the first"],
  ["running", "stages moving, rows enriching in place"],
  ["done", "finished: summary, Open in Companies, Make a segment"],
  ["partial", "finished with sites it couldn’t read, by reason"],
  ["failed", "search stopped; what was found is kept, no credits spent"],
  ["rate-limited", "Hunter's hourly limit: people and verify pause, the rest continues"],
  ["zero", "nothing matched: which searches ran, what to loosen"],
  ["detail", "a result open, with where each field came from"],
];

export function DiscoveryShellDemo() {
  return (
    <div className="sg-shells">
      <div><Label>1440 · a run in progress · click a result to open it, with its provenance</Label>
        <div className="sg-shell sg-shell--full sg-shell--kb"><AppDemo frame="contained" hotkeys={false} initialView="discovery" discovery="running" /></div></div>
      <div className="sg-shells__row">
        <div><Label>390 · the run first, runs behind a back row</Label><div className="sg-shell sg-shell--phone"><AppDemo frame="contained" hotkeys={false} initialView="discovery" discovery="partial" /></div></div>
        <div className="sg-card c-app sg-m4-states"><Label>every state · /app/discovery&amp;state=</Label>
          <ul className="sg-anatomy">{STATES.map(([s, d]) => <li key={s || "live"}><a className="c-link" href={`/app/discovery${s ? `?state=${s}` : ""}`}><code>{s || "(none)"}</code></a> · {d}</li>)}</ul>
          <Label>companies, M4 states</Label>
          <ul className="sg-anatomy">
            <li><a className="c-link" href="/app/companies?state=stale"><code>companies · stale</code></a> · contact details past their window, Re-check</li>
            <li><a className="c-link" href="/app/companies?state=provenance"><code>companies · provenance</code></a> · a company open on its email&rsquo;s evidence</li>
          </ul></div>
      </div>
    </div>
  );
}

export function RunStatesDemo() {
  const paused = runsFor("rate-limited").runs[0];
  const runs = [RUNS[0], paused, RUNS[1], RUNS[2], RUNS[3], RUNS[4], RUNS[5]];
  return (
    <div className="sg-m4-runs">
      {runs.map((r, i) => (
        <div key={r.id + i} className="sg-card c-app sg-m4-run">
          <div className="sg-m4-run__hd"><b>{r.name}</b><RunTag run={r} /></div>
          <StageStrip run={r} />
        </div>
      ))}
    </div>
  );
}

export function SetupDemo() {
  return (
    <ToastProvider>
      <div className="sg-m4-setup">
        <div><Label>defaults from the product&rsquo;s ICP · estimate before anything is spent</Label><div className="c-app"><RunSetup inline open onClose={noop} onStart={noop} /></div></div>
        <div><Label>problems block Start and are named · a run already going means Queue run</Label><div className="c-app"><RunSetup inline open onClose={noop} onStart={noop} seed={SETUP_ERROR_SEED} queueBehind={RUNS[0].name} /></div></div>
      </div>
    </ToastProvider>
  );
}

export function EnrichDemo() {
  const rows = resultsFor(RUNS[0]).slice(0, 8);
  const kilima = LEAD_ROWS.find((l) => l.id === "kilima")!;
  const prov = provOf(kilima);
  const staleProv = provOf(kilima, 128);
  const [rechecking, setRechecking] = useState(false);
  return (
    <ToastProvider>
      <div className="sg-card c-app sg-m4-table"><Label>enrichment in place · quiet text where the value will be, never a spinner per cell</Label>
        <div className="d-results l-leads"><SegmentTable label="Results: Dairy & cold rooms" leads={rows} selected={new Set()} /></div></div>
      <div className="sg-m4-prov">
        <div className="sg-card c-app"><Label>provenance per field · open a row for its evidence</Label>
          <ProvenanceList list={prov} today={DEMO_TODAY_M4} initialOpen="email" /></div>
        <div className="sg-card c-app"><Label>stale · past its window, re-check before sending</Label>
          <StaleBanner list={staleProv} today={DEMO_TODAY_M4} person={kilima.person} rechecking={rechecking} onRecheck={() => { setRechecking(true); setTimeout(() => setRechecking(false), 1200); }} />
          <ProvenanceList list={staleProv} today={DEMO_TODAY_M4} initialOpen="phone" /></div>
        <div className="sg-m3-detail"><LeadDetail lead={kilima} onClose={noop} onStatus={noop} onEnroll={noop} prov={staleProv} today={DEMO_TODAY_M4}
          foundVia="Search · “dairy processor Kenya” · #3" /></div>
      </div>
    </ToastProvider>
  );
}
