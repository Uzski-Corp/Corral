"use client";
/* /styleguide: M11, the knowledge base on the real API (PR #73). Each gap Krak found while wiring, designed against
   the API's shapes: people we can't name, markdown passages, search, the first product, replace, and the copy. */
import { useState, type ReactNode } from "react";
import {
  FirstProductField, KbSearch, PassageItem, PersonMark, REVIEW_SOURCES, ReplacingCard, SOURCES, SourceList, byName, reviewSearch, sampleSearch,
  type SourceFilter,
} from "@/components/app";
import { productRows } from "@/lib/kb/products";
import { ACTION_FAILED, refusalCopy } from "@/lib/kb/upload";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};

export function KbWiringDemo() {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [name, setName] = useState("ColdTrace");
  const people = [{ name: "Tomás Ibarra", avatar: "tomas" }, { name: "Amara Njoroge" }, { name: "Teammate", unknown: true }];
  const md = REVIEW_SOURCES.warranty;
  const sources = [md, ...SOURCES.filter((s) => s.status.s === "ready").slice(0, 3)];
  const init = reviewSearch("search", [...SOURCES, md]);
  return (
    <div className="sg-m11">
      <div className="c-win c-win--flat c-app sg-kb__win"><SourceList sources={sources} filter={filter} onFilter={setFilter} onOpen={noop} /></div>
      <div className="sg-m11__row">
        <div className="sg-card c-app"><Label>added by · photo, initials, or someone we can&rsquo;t name yet</Label>
          <ul className="sg-m11__people">{people.map((p) => <li key={p.name} className="k-by"><PersonMark by={p} /><span>{byName(p)}<em>Sep 29</em></span></li>)}</ul>
          <p className="sg-m11__note">No members endpoint yet: a neutral outlined person and &ldquo;Teammate&rdquo; (&ldquo;Added by a teammate&rdquo; in the detail). A name and photo drop into the same slot.</p>
        </div>
        <div className="sg-card c-app"><Label>markdown passages · heading label (focus for the full heading), markers stripped</Label>
          <ul className="k-passages">
            <PassageItem loc="ColdTrace T4 wireless temperature sensors: warranty" ordinal={0} text={"# ColdTrace T4 wireless temperature sensors: warranty\nEvery T4 sensor carries a **three-year** warranty from the day it's installed.\n## Returns\nWe replace a failed sensor within two working days."} />
            <PassageItem loc="p.19" ordinal={2} text="Sensor battery life is five years at a 60-second reading interval." />
          </ul>
        </div>
      </div>
      <div className="c-win c-win--flat c-app sg-m11__search">
        <KbSearch search={sampleSearch([...SOURCES, md])} searchable={412} onOpen={noop} initial={init}><p className="sg-m11__note">The source list shows here when the search is cleared.</p></KbSearch>
      </div>
      <div className="sg-m11__row">
        <div className="sg-card c-app"><Label>first product · inline, prefilled, skippable</Label><FirstProductField fp={{ name, workspace: "ColdTrace", setName }} /></div>
        <div className="sg-card c-app"><Label>replace file · which source</Label><ReplacingCard src={md} /><ReplacingCard src={SOURCES[4]} /></div>
        <div className="sg-card c-app"><Label>product switcher · a count only where it&rsquo;s known</Label>
          <ul className="sg-m11__menu">{productRows([{ id: "s", name: "ColdTrace Sensors" }, { id: "g", name: "ColdTrace Gateway" }], "s", { s: 12 }).map((r) => (
            <li key={r.id} className={r.checked ? "is-on" : undefined}><span>{r.label}</span><em>{r.meta ?? ""}</em></li>))}</ul>
        </div>
      </div>
      <div className="sg-card c-app"><Label>failure copy · what&rsquo;s true now, then the way out</Label>
        <table className="sg-m11__copy"><tbody>
          {[ACTION_FAILED.reread("Pricing 2026.md"), ACTION_FAILED.remove("Pricing 2026.md"), ACTION_FAILED.restore("Pricing 2026.md")].map((c) => <tr key={c.text}><td>toast</td><td>{c.text}</td><td>{c.action}</td></tr>)}
          {(["kb_full", "url_not_public", "url_invalid", "type_mismatch"] as const).map((code) => { const r = refusalCopy(code, code.startsWith("url") ? "url" : "pdf", "This knowledge base has 200 sources."); return <tr key={code}><td><code>{code}</code></td><td><b>{r.title}.</b> {r.fix}</td><td>{r.actions.map((a) => (a === "retry" ? "Retry" : a === "replace" ? "Replace" : "Dismiss")).join(" · ")}</td></tr>; })}
          <tr><td>other · page</td><td><b>{refusalCopy(undefined, "url", "").title}.</b> + the server&rsquo;s sentence</td><td>Retry · Dismiss</td></tr>
          <tr><td>other · file</td><td><b>{refusalCopy(undefined, "pdf", "").title}.</b> + the server&rsquo;s sentence</td><td>Retry · Dismiss</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}
