"use client";
import { enrichBusy, enrichLabel, fitPending, type EnrichState } from "@/lib/discovery/run";
import { formatAge, shortAge } from "@/lib/discovery/provenance";
import type { FitBarMeta } from "@/lib/fit/score";
import { useState } from "react";
import { LEADS, type Lead } from "./data";
import { Avatar, Button, Check, FitBar, Logo, Monogram, Tag, cx } from "./primitives";
import { FilterBar } from "./Filters";
import { Sidebar } from "./Sidebar";
import { Icon } from "./icons";
import type { Sort, SortKey } from "@/lib/leads/segment";

const HEADERS: [string, SortKey][] = [["Company", "company"], ["Decision-maker", "person"], ["Fit", "fit"], ["Email", "email"], ["Reply", "reply"], ["Last touch", "last"]];

/**
 * The lead table (M1 look, M3 behaviour). Every M3 prop is optional, so the M1 uses stay as they were:
 * `sort` + `onSort` make headers sortable (aria-sort), `allChecked` + `onToggleAll` add the header checkbox,
 * `onOpen` makes rows open the lead detail (`active` marks the open one).
 */
export function SegmentTable({ leads = LEADS, selected, onToggle, limit, hover, label = "Segment: Food & Beverage, East Africa", sort, onSort, allChecked, onToggleAll, onOpen, active, fitOf, fitLabel = "Fit · ColdTrace" }: {
  leads?: Lead[]; selected: Set<string>; onToggle?: (id: string) => void; limit?: number; hover?: string; label?: string;
  sort?: Sort; onSort?: (key: SortKey) => void; allChecked?: boolean | "mixed"; onToggleAll?: () => void; onOpen?: (id: string) => void; active?: string;
  /** M5: how each row's fit bar is marked (scoring, not scored, low confidence, changed, yours, error). */
  fitOf?: (l: Lead) => { value: number } & FitBarMeta;
  /** The fit column names the product it scores against. Signed in: the real product, or plain "Fit" without one. */
  fitLabel?: string;
}) {
  return (
    <div className={cx("c-table", onOpen && "c-table--open")} role="table" aria-label={label}>
      {/* ARIA table: every row owns columnheader/cell children, so the grid-laid spans keep their look. */}
      <div className="c-tr c-thead" role="row">
        <span role="columnheader" aria-label="Select">{onToggleAll && <Check on={allChecked === true} mixed={allChecked === "mixed"} onChange={onToggleAll} label="Select all rows" />}</span>
        {HEADERS.map(([h0, key]) => {
          const h = key === "fit" ? fitLabel : h0;
          const on = sort?.key === key;
          if (!onSort) return <span key={h} role="columnheader">{h}</span>;
          return (
            <span key={h} role="columnheader" aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
              <button type="button" className={cx("c-sort", on && "is-on")} onClick={() => onSort(key)}>{h}<Icon name={on ? (sort!.dir === "asc" ? "up" : "down") : "sort"} size={12} /></button>
            </span>
          );
        })}
      </div>
      {leads.slice(0, limit).map((l) => {
        const on = selected.has(l.id);
        return (
          <div key={l.id} role="row" onClick={onOpen ? () => onOpen(l.id) : undefined}
            className={cx("c-tr", on && "is-selected", hover === l.id && "is-hover", active === l.id && "is-active", l.fit < 80 && !l.scoring && !enrichBusy(l.enrich) && !on && "is-dim")}>
            <span role="cell"><Check on={on} onChange={() => onToggle?.(l.id)} label={`Select ${l.company}`} /></span>
            <span role="cell" className="c-cell"><Logo company={l.company} />
              {onOpen ? <button type="button" className="c-strong c-rowlink" onClick={(e) => { e.stopPropagation(); onOpen(l.id); }}>{l.company}</button> : <span className="c-strong">{l.company}</span>}
              <span className="c-mono">{l.domain}</span>{l.dupOf && <span className="c-dupmark">Duplicate?</span>}</span>
            <span role="cell" className="c-cell">{l.person ? <>{l.avatar ? <Avatar id={l.avatar} /> : <Monogram name={l.person} />}<span className="c-strong">{l.person}</span><span className="c-muted">{l.title}</span></>
              : <EnrichNote e={l.enrich} slot="person" />}</span>
            <span role="cell">{l.scoring || fitPending(l.enrich) ? <FitBar value={0} state="scoring" text={l.scoring ? "Scoring" : enrichLabel(l.enrich) ?? "Scoring"} />
              : l.enrich?.kind === "unreadable" ? <EnrichNote e={l.enrich} slot="fit" /> : fitOf ? <FitBar {...fitOf(l)} /> : <FitBar value={l.fit} />}</span>
            <span role="cell">{l.enrich && l.enrich.kind !== "done" && l.enrich.kind !== "stale" ? <EnrichNote e={l.enrich} slot="email" />
              : <span className="c-cell c-cell--tight"><Tag status={l.email} />{l.enrich?.kind === "stale" && <StaleMark days={l.enrich.days} />}</span>}</span>
            <span role="cell"><Tag status={l.reply} /></span>
            <span role="cell" className="c-muted">{l.last}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Full segment view: sidebar, toolbar, filters and a live table (select rows, open the filter menu). */
export function SegmentWindow({ limit = 8, className, sidebar = true }: { limit?: number; className?: string; sidebar?: boolean }) {
  const [selected, setSelected] = useState(() => new Set(["kilima", "pwani", "savanna"]));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className={cx("c-win", className)} aria-label="Corral app: segment view">
      {sidebar && <Sidebar />}
      <div className="c-main">
        <div className="c-toolbar">
          <div className="c-crumbs"><span>Segments</span><span className="c-sep">/</span><b>Food &amp; Beverage · East Africa</b><span className="c-faint">48 companies</span></div>
          <div className="c-actions"><Button>Export</Button>
            <Button variant="primary" disabled={selected.size === 0}>{selected.size ? `Enroll ${selected.size} in sequence` : "Select to enroll"}</Button></div>
        </div>
        <FilterBar />
        <SegmentTable selected={selected} onToggle={toggle} limit={limit} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ M4 enrichment cells
   What a row shows while Corral is still finding the value, or why there isn't one. Quiet text,
   never a spinner per cell: the run panel carries the motion. */
function EnrichNote({ e, slot }: { e?: EnrichState; slot: "person" | "fit" | "email" }) {
  const k = e?.kind;
  const busy = (slot === "person" && k === "finding") || (slot === "email" && k === "verifying");
  const text = slot === "person"
    ? k === "finding" ? "Finding people" : k === "no-people" ? "No one found" : k === "below-bar" ? "Not looked up" : k === "unreadable" ? "—" : "Waits for fit"
    : slot === "fit" ? "Couldn’t read site"
    : k === "verifying" ? "Verifying" : "—";
  const warn = (slot === "fit" && k === "unreadable") || (slot === "person" && k === "no-people");
  return <span className={cx("c-enrich", busy && "is-busy", warn && "is-warn")} title={slot === "person" && k === "below-bar" ? enrichLabel(e) ?? undefined : undefined}>{busy && <span className="c-enrich__dot" aria-hidden="true" />}{text}</span>;
}

/** Contact details past their freshness window: a caution clock with the age ("4mo"). */
export function StaleMark({ days }: { days: number }) {
  return <span className="c-stale" role="img" aria-label={`Checked ${formatAge(days)}`} title={`Checked ${formatAge(days)}`}><Icon name="clock" size={11} />{shortAge(days)}</span>;
}

