"use client";
import { useState } from "react";
import { LEADS, type Lead } from "./data";
import { Avatar, Button, Check, FitBar, Logo, Monogram, Tag, cx } from "./primitives";
import { FilterBar } from "./Filters";
import { Sidebar } from "./Sidebar";
import { Icon } from "./icons";
import { Skeleton } from "./States";
import type { Sort, SortKey } from "@/lib/leads/segment";

const HEADERS: [string, SortKey][] = [["Company", "company"], ["Decision-maker", "person"], ["Fit · ColdTrace", "fit"], ["Email", "email"], ["Reply", "reply"], ["Last touch", "last"]];

/**
 * The lead table (M1 look, M3 behaviour). Every M3 prop is optional, so the M1 uses stay as they were:
 * `sort` + `onSort` make headers sortable (aria-sort), `allChecked` + `onToggleAll` add the header checkbox,
 * `onOpen` makes rows open the lead detail (`active` marks the open one).
 */
export function SegmentTable({ leads = LEADS, selected, onToggle, limit, hover, label = "Segment: Food & Beverage, East Africa", sort, onSort, allChecked, onToggleAll, onOpen, active }: {
  leads?: Lead[]; selected: Set<string>; onToggle?: (id: string) => void; limit?: number; hover?: string; label?: string;
  sort?: Sort; onSort?: (key: SortKey) => void; allChecked?: boolean | "mixed"; onToggleAll?: () => void; onOpen?: (id: string) => void; active?: string;
}) {
  return (
    <div className={cx("c-table", onOpen && "c-table--open")} role="table" aria-label={label}>
      {/* ARIA table: every row owns columnheader/cell children, so the grid-laid spans keep their look. */}
      <div className="c-tr c-thead" role="row">
        <span role="columnheader" aria-label="Select">{onToggleAll && <Check on={allChecked === true} mixed={allChecked === "mixed"} onChange={onToggleAll} label="Select all rows" />}</span>
        {HEADERS.map(([h, key]) => {
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
            className={cx("c-tr", on && "is-selected", hover === l.id && "is-hover", active === l.id && "is-active", l.fit < 80 && !l.scoring && !on && "is-dim")}>
            <span role="cell"><Check on={on} onChange={() => onToggle?.(l.id)} label={`Select ${l.company}`} /></span>
            <span role="cell" className="c-cell"><Logo company={l.company} />
              {onOpen ? <button type="button" className="c-strong c-rowlink" onClick={(e) => { e.stopPropagation(); onOpen(l.id); }}>{l.company}</button> : <span className="c-strong">{l.company}</span>}
              <span className="c-mono">{l.domain}</span>{l.dupOf && <span className="c-dupmark">Duplicate?</span>}</span>
            <span role="cell" className="c-cell">{l.avatar ? <Avatar id={l.avatar} /> : <Monogram name={l.person} />}<span className="c-strong">{l.person}</span><span className="c-muted">{l.title}</span></span>
            <span role="cell">{l.scoring ? <span className="c-scoring"><Skeleton w={40} h={10} r={2} /><span>Scoring</span></span> : <FitBar value={l.fit} />}</span>
            <span role="cell"><Tag status={l.email} /></span><span role="cell"><Tag status={l.reply} /></span>
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
