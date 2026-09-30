"use client";
import { cx } from "../primitives";
import { DropdownMenu } from "../Overlays";
import { Icon } from "../icons";
import { Tabs } from "../Tabs";
import { EmptyState } from "../States";
import { Button } from "../primitives";
import type { Source } from "./data";
import { FileTile, PersonMark, SourceState, byName, isBusy, needsAttention } from "./parts";

export type SourceFilter = "all" | "files" | "web" | "attention";
export const filterSources = (list: Source[], f: SourceFilter) =>
  f === "files" ? list.filter((s) => s.kind !== "url") : f === "web" ? list.filter((s) => s.kind === "url") : f === "attention" ? list.filter(needsAttention) : list;

/* Source list: what Corral has read for this product. Exceptions sort to the top (need you, then
   still reading), everything else by recency. Two-line rows: the name people recognise, then the
   facts that let them trust it (pages, size, when it was last read).                         */
export function SourceList({ sources, filter, onFilter, selected, onOpen, onAction, onAdd }: {
  sources: Source[]; filter: SourceFilter; onFilter: (f: SourceFilter) => void; selected?: string;
  onOpen: (id: string) => void; onAction?: (id: string, action: "reread" | "replace" | "remove") => void; onAdd?: () => void;
}) {
  const rank = (s: Source) => (needsAttention(s) ? 0 : isBusy(s) ? 1 : 2);
  const list = filterSources(sources, filter).map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  const n = (f: SourceFilter) => filterSources(sources, f).length;
  const passages = sources.reduce((t, s) => t + (s.status.s === "ready" || s.status.s === "partial" ? s.passages ?? 0 : 0), 0);
  const busy = sources.filter(isBusy).length;
  return (
    <div className="k-sources">
      <div className="k-sources__head">
        <p className="k-sources__sum">
          <b>{sources.length} sources</b> · {passages.toLocaleString("en-GB")} passages Corral can search
          {busy > 0 && <> · <span className="k-sources__busy"><span className="k-live" aria-hidden="true" />{busy} being read</span></>}
        </p>
        <Tabs variant="pill" label="Filter sources" value={filter} onChange={(v) => onFilter(v as SourceFilter)} tabs={[
          { id: "all", label: "All", count: n("all") }, { id: "files", label: "Files", count: n("files") }, { id: "web", label: "Web", count: n("web") },
          { id: "attention", label: "Needs you", count: n("attention") }]} />
      </div>
      {list.length === 0 ? (
        <EmptyState compact icon={filter === "attention" ? "check" : "book"} title={filter === "attention" ? "Nothing needs you" : filter === "web" ? "No web pages yet" : "No files yet"}
          actions={filter === "attention" ? undefined : <Button onClick={onAdd}><Icon name="plus" />Add sources</Button>}>
          {filter === "attention" ? "Every source was read in full." : filter === "web" ? "Add your product pages. Corral reads each one when you add it, and again whenever you choose Re-read." : "Add your pitch deck, case studies and FAQs."}
        </EmptyState>
      ) : (
        <div className="k-srcs" role="table" aria-label="Sources">
          <div className="k-srcrow k-srcrow--head" role="row">
            <span role="columnheader" className="k-col-tile"><span className="k-sr">Type</span></span>
            <span role="columnheader">Source</span><span role="columnheader">Status</span><span role="columnheader" className="k-col-cited">Used in</span>
            <span role="columnheader" className="k-col-by">Added by</span><span role="columnheader" className="k-col-upd">Updated</span><span role="columnheader"><span className="k-sr">Actions</span></span>
          </div>
          {list.map((s) => (
            <div key={s.id} role="row" className={cx("k-srcrow", selected === s.id && "is-on", needsAttention(s) && "is-attn")}>
              <span role="cell" className="k-col-tile"><FileTile kind={s.kind} /></span>
              <span role="cell" className="k-src__name">
                <button type="button" className="k-src__open" onClick={() => onOpen(s.id)} aria-current={selected === s.id || undefined}>{s.name}</button>
                <span className="k-src__meta">{s.meta}</span>
              </span>
              <span role="cell"><SourceState src={s} /></span>
              <span role="cell" className="k-col-cited">{s.cited ? <span className="k-cited">{s.cited} {s.cited === 1 ? "line" : "lines"}</span> : <span className="k-nil">Not yet</span>}</span>
              <span role="cell" className="k-col-by"><span className={cx("k-by", s.by.unknown && "is-anon")}><PersonMark by={s.by} /><span>{byName(s.by)}<em>{s.added}</em></span></span></span>
              <span role="cell" className="k-col-upd">{s.updated}</span>
              <span role="cell" className="k-col-more">
                <DropdownMenu align="end" width={200} label={`${s.name} actions`} items={[
                  { label: "Open", icon: "arrow", onSelect: () => onOpen(s.id) },
                  { label: s.kind === "url" ? "Re-read now" : "Read again", icon: "refresh", disabled: isBusy(s), onSelect: () => onAction?.(s.id, "reread") },
                  ...(s.kind === "url" ? [] : [{ label: "Replace file", icon: "upload" as const, onSelect: () => onAction?.(s.id, "replace") }]),
                  "separator", { label: "Remove", danger: true, onSelect: () => onAction?.(s.id, "remove") }]}
                  trigger={(tp) => <button type="button" className="c-iconbtn" aria-label={`Actions for ${s.name}`} {...tp}><Icon name="more" /></button>} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
