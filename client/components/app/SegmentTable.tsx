"use client";
import { useState } from "react";
import { LEADS, type Lead } from "./data";
import { Avatar, Button, Check, FitBar, Logo, Tag, cx } from "./primitives";
import { FilterBar } from "./Filters";
import { Sidebar } from "./Sidebar";

const HEADERS = ["Company", "Decision-maker", "Fit · ColdTrace", "Email", "Reply", "Last touch"];

export function SegmentTable({ leads = LEADS, selected, onToggle, limit, hover }: {
  leads?: Lead[]; selected: Set<string>; onToggle?: (id: string) => void; limit?: number; hover?: string;
}) {
  return (
    <div className="c-table" role="table" aria-label="Segment: Food & Beverage, East Africa">
      {/* ARIA table: every row owns columnheader/cell children, so the grid-laid spans keep their look. */}
      <div className="c-tr c-thead" role="row">
        <span role="columnheader" aria-label="Select" />
        {HEADERS.map((h) => <span key={h} role="columnheader">{h}</span>)}
      </div>
      {leads.slice(0, limit).map((l) => {
        const on = selected.has(l.id);
        return (
          <div key={l.id} role="row" className={cx("c-tr", on && "is-selected", hover === l.id && "is-hover", l.fit < 80 && !on && "is-dim")}>
            <span role="cell"><Check on={on} onChange={() => onToggle?.(l.id)} label={`Select ${l.company}`} /></span>
            <span role="cell" className="c-cell"><Logo company={l.company} /><span className="c-strong">{l.company}</span><span className="c-mono">{l.domain}</span></span>
            <span role="cell" className="c-cell"><Avatar id={l.avatar} /><span className="c-strong">{l.person}</span><span className="c-muted">{l.title}</span></span>
            <span role="cell"><FitBar value={l.fit} /></span><span role="cell"><Tag status={l.email} /></span><span role="cell"><Tag status={l.reply} /></span>
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
