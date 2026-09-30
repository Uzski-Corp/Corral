"use client";
/* /styleguide: M3 lead table, lead detail, status tags, segment builder, CSV import (ENG-53). Every piece live. */
import { useState, type ReactNode } from "react";
import {
  AppDemo, EMAIL_STATUSES, EXISTING, ImportDialog, LEAD_ROWS, LEAD_STATUSES, LeadDetail, STATUS_HELP, SegmentBuilder, StatusMenu, Tag, ToastProvider, importSeed, newRule,
} from "@/components/app";
import type { LeadsReviewState } from "@/lib/leads/state";
import type { Match, Rule } from "@/lib/leads/segment";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};
const lead = (id: string) => LEAD_ROWS.find((l) => l.id === id)!;

export function LeadTableDemo() {
  return (
    <div className="sg-shells">
      <div><Label>1440 · 3 selected, the bulk bar · click a company to open its detail · sort from any header</Label>
        <div className="sg-shell sg-shell--full sg-shell--kb"><AppDemo frame="contained" hotkeys={false} initialView="companies" leads="selected" /></div></div>
      <div className="sg-shells__row">
        <div><Label>390 · rows become two lines</Label><div className="sg-shell sg-shell--phone"><AppDemo frame="contained" hotkeys={false} initialView="companies" /></div></div>
        <div><Label>large selection · the banner, then the confirm</Label><div className="sg-shell sg-m3-mid"><AppDemo frame="contained" hotkeys={false} initialView="companies" leads="select-all" /></div></div>
      </div>
    </div>
  );
}

export function StatusTagsDemo() {
  return (
    <div className="sg-m3-tags">
      <div className="sg-card c-app"><Label>lead status · set by Corral from replies, or by you</Label>
        <ul className="sg-m3-taglist">{LEAD_STATUSES.map((s) => <li key={s}><Tag status={s} /><span>{STATUS_HELP[s]}</span></li>)}</ul></div>
      <div className="sg-card c-app"><Label>email status · from verification and bounces</Label>
        <ul className="sg-m3-taglist">{EMAIL_STATUSES.map((s) => <li key={s}><Tag status={s} /><span>{STATUS_HELP[s]}</span></li>)}</ul>
        <Label>the tag is the control · click to change</Label>
        <div className="sg-m3-menu"><StatusMenu label="Status for Kilima Dairies" value="Interested" onChange={noop} defaultOpen /></div></div>
    </div>
  );
}

export function LeadDetailDemo() {
  return (
    <div className="sg-m3-details">
      {(["kilima", "kilimaltd", "nyeri"] as const).map((id) => (
        <div key={id}><Label>{id === "kilima" ? "in a sequence, replied" : id === "kilimaltd" ? "possible duplicate, still scoring" : "unsubscribed: can't be enrolled"}</Label>
          <div className="sg-m3-detail c-app"><ToastProvider><LeadDetail lead={lead(id)} onClose={noop} onStatus={noop} onEnroll={noop} onMerge={noop} onKeepBoth={noop} /></ToastProvider></div></div>
      ))}
    </div>
  );
}

function BuilderFrame({ label, initial, name }: { label: string; initial: () => Rule[]; name?: string }) {
  const [rules, setRules] = useState(initial);
  const [match, setMatch] = useState<Match>("all");
  const [n, setN] = useState(name);
  return <div><Label>{label}</Label><div className="sg-m3-builder c-app"><SegmentBuilder rules={rules} onRules={setRules} match={match} onMatch={setMatch} leads={LEAD_ROWS} name={n} onName={n === undefined ? undefined : setN} onSave={noop} onCancel={noop} saveLabel={n === undefined ? "Save changes" : "Save segment"} /></div></div>;
}
export function BuilderDemo() {
  return (
    <div className="sg-kb">
      <BuilderFrame label="editing a saved segment · live count on the right" initial={() => [{ ...newRule("fit"), value: 80 }, { ...newRule("country"), value: ["Kenya", "Uganda", "Tanzania"] }, { ...newRule("industry"), value: ["Dairy", "Seafood", "Beverages", "Bakery"] }]} />
      <BuilderFrame label="new segment · unfinished rules are ignored and named" name="Quality leads" initial={() => [{ ...newRule("fit"), value: "120" }, { ...newRule("title"), value: "quality" }, { ...newRule("reply"), value: [] }]} />
      <BuilderFrame label="nothing matches · the tightest rule and what loosening it gives" initial={() => [{ ...newRule("fit"), value: 95 }, { ...newRule("country"), value: ["Kenya", "Uganda"] }, { ...newRule("industry"), value: ["Seafood"] }]} />
    </div>
  );
}

function ImportFrame({ state, label }: { state: LeadsReviewState; label: string }) {
  return <div><Label>{label}</Label><div className="sg-kb__dialog sg-m3-imp"><ImportDialog open inline onClose={noop} existing={EXISTING} seed={importSeed(state)} onSegment={noop} /></div></div>;
}
export function ImportDemo() {
  return (
    <div className="sg-kb">
      <div className="sg-kb__row sg-kb__row--top">
        <ImportFrame state="import" label="1 · file · what Corral needs, before anything is picked" />
        <ImportFrame state="import-file-error" label="1 · a file it can't read, and the one fix" />
      </div>
      <ImportFrame state="import-map-errors" label="2 · columns · guessed by name and values; problems block Continue and say why" />
      <ImportFrame state="import-review" label="3 · review · duplicates get a policy, bad rows are listed by spreadsheet row" />
      <div className="sg-kb__row sg-kb__row--top">
        <ImportFrame state="import-running" label="importing · keeps going if closed" />
        <ImportFrame state="import-done" label="done · receipts, the rows left behind, and a segment from the import" />
      </div>
    </div>
  );
}

const STATES: [string, string, string][] = [
  ["companies", "", "live: Fit 80+, sortable, selectable, detail on click"], ["companies", "loading", "skeleton rows at 40px"], ["companies", "error", "couldn’t load, retry"],
  ["companies", "empty", "first run: import or find"], ["companies", "no-results", "filters match nothing, with the loosening hint"], ["companies", "partial", "212 of 1,284 still scoring"],
  ["companies", "selected", "3 selected: the bulk bar"], ["companies", "select-all", "all 1,284 selected"], ["companies", "bulk-confirm", "large enroll: what gets skipped"],
  ["companies", "bulk-running", "large enroll in the background"], ["companies", "status-menu", "set status for a selection"], ["companies", "detail", "Kilima Dairies open"],
  ["companies", "duplicate", "possible duplicate, merge or keep both"], ["companies", "import", "import: pick a file"], ["companies", "import-file-error", "not a CSV"],
  ["companies", "import-map", "mapping, all guessed"], ["companies", "import-map-errors", "no company column, two emails, split names"], ["companies", "import-review", "duplicates and bad rows"],
  ["companies", "import-running", "importing"], ["companies", "import-done", "summary + segment from import"],
  ["segments", "", "a saved segment (its rules as chips)"], ["segments", "builder", "edit rules, live count"], ["segments", "builder-empty", "rules that match nothing"], ["segments", "builder-error", "unfinished and bad rules"],
];
export function LeadStatesDemo() {
  return (
    <div className="sg-card c-app sg-m3-states"><Label>every state · /app?view=companies|segments&amp;state=</Label>
      <ul className="sg-anatomy">{STATES.map(([v, s, d]) => <li key={v + s}><a className="c-link" href={`/app?view=${v}${s ? `&state=${s}` : ""}`}><code>{v}{s ? ` · ${s}` : ""}</code></a> · {d}</li>)}</ul>
    </div>
  );
}
