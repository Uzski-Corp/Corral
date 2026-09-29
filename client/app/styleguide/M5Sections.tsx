"use client";
/* /styleguide: M5 fit score, the bar in every state and the panel that explains a score (ENG-55). Every piece live. */
import type { ReactNode } from "react";
import { DEMO_TODAY_M4, FitBar, FitReasoning, KILIMA_FIT, LEAD_ROWS, SegmentTable, fitStatusFor } from "@/components/app";
import { barOf, type FitStatus } from "@/lib/fit/score";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};
const lead = (id: string) => LEAD_ROWS.find((l) => l.id === id)!;

const STATES: [string, string][] = [
  ["fit", "Kilima open: six checks, each with its evidence and the KB line it's measured against"],
  ["fit-scoring", "rescoring: pages read, checks ticking, the last score stays in use"],
  ["fit-none", "queued and no-website rows; Score it now or set it yourself"],
  ["fit-low", "one page read: a floor, a ceiling, and what's missing"],
  ["fit-changed", "up 26 since the last score, and why"],
  ["fit-override", "you set 83, Corral scored 61; go back to Corral's"],
  ["fit-disagree", "you said it's wrong; Rescore now re-reads with your note"],
  ["fit-error", "scoring failed twice; the last score stands, Try again"],
];

const TABLE: [string, Parameters<typeof fitStatusFor>[1]][] = [
  ["kilima", "fit"], ["tamu", "fit-scoring"], ["savanna", "fit-none"], ["mara", "fit-none"], ["zanzibar", "fit-low"], ["nyota", "fit-changed"], ["bahari", "fit-override"], ["kigali", "fit-error"],
];

export function FitBarDemo() {
  const rows: [string, ReactNode][] = [
    ["scored", <FitBar key="a" value={94} />],
    ["below the bar", <FitBar key="b" value={64} />],
    ["low confidence", <FitBar key="c" value={53} confidence="low" />],
    ["changed", <FitBar key="d" value={84} delta={26} />],
    ["changed, down", <FitBar key="e" value={81} delta={-9} />],
    ["yours", <FitBar key="f" value={83} by="you" />],
    ["scoring", <FitBar key="g" value={0} state="scoring" />],
    ["rescoring", <FitBar key="h" value={86} state="scoring" text="Rescoring" />],
    ["not scored", <FitBar key="i" value={0} state="none" />],
    ["couldn't score", <FitBar key="j" value={0} state="error" />],
    ["failed, last kept", <FitBar key="k" value={85} state="error" />],
  ];
  return (
    <div className="sg-m5-bars">
      <div className="sg-card c-app"><Label>states · default size</Label>
        <dl className="sg-m5-bar-list">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
      <div className="sg-card c-app"><Label>sizes · default · md · lg</Label>
        <div className="sg-m5-sizes"><FitBar value={94} /><FitBar value={94} size="md" /><FitBar value={94} size="lg" /></div>
        <Label>rules</Label>
        <ul className="sg-anatomy">
          <li>A plain <code>value</code> renders exactly as the existing bar: same classes, same accessible name.</li>
          <li>Motion only while scoring, and none under reduced motion.</li>
          <li>Low confidence outlines the segments; the number still shows, because it&rsquo;s a floor.</li>
          <li>The arrow is the change since the last score, shown until the next one.</li>
          <li>Yours: the pen marks a number you set; Corral&rsquo;s own score is one click away.</li>
        </ul></div>
      <div className="sg-card c-app sg-m5-wide"><Label>in the Companies table · short labels keep the column&rsquo;s width</Label>
        <div className="sg-m5-table"><SegmentTable label="Fit in the table" leads={TABLE.map(([id]) => lead(id))} selected={new Set()} onToggle={noop}
          fitOf={(l) => { const st = fitStatusFor(l, TABLE.find(([id]) => id === l.id)![1]); return st ? barOf(st, true) : { value: l.fit }; }} /></div></div>
    </div>
  );
}

const Panel = ({ label, status, company, domain }: { label: string; status: FitStatus; company: string; domain: string }) => (
  <div className="sg-card c-app sg-m5-panel"><Label>{label}</Label>
    <FitReasoning status={status} company={company} domain={domain} today={DEMO_TODAY_M4}
      onRescore={noop} onOverride={noop} onClearOverride={noop} onDisagree={noop} onOpenField={noop} onAddField={noop} /></div>
);

export function FitReasoningDemo() {
  const p = (id: string, s: Parameters<typeof fitStatusFor>[1], label: string) => {
    const l = lead(id); return <Panel key={s} label={label} status={fitStatusFor(l, s)} company={l.company} domain={l.domain} />;
  };
  return (
    <div className="sg-m5">
      <div className="sg-m5-panels">
        <Panel label="scored · high confidence" status={{ kind: "scored", score: KILIMA_FIT }} company="Kilima Dairies" domain="kilima.co.ke" />
        {p("zanzibar", "fit-low", "low confidence · a floor, what's missing")}
        {p("nyota", "fit-changed", "changed since last time")}
        {p("bahari", "fit-override", "your override")}
        {p("rift", "fit-disagree", "you disagreed")}
        {p("tamu", "fit-scoring", "rescoring")}
        {p("savanna", "fit-none", "not scored yet")}
        {p("kigali", "fit-error", "error · last score stands")}
      </div>
      <div className="sg-card c-app"><Label>every state · /app?view=companies&amp;state=</Label>
        <ul className="sg-anatomy">{STATES.map(([s, d]) => <li key={s}><a className="c-link" href={`/app?view=companies&state=${s}`}><code>{s}</code></a> · {d}</li>)}</ul></div>
    </div>
  );
}
