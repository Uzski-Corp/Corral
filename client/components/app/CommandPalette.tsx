"use client";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Kbd, cx } from "./primitives";
import { Skeleton } from "./States";
import { useFocusTrap } from "./useFocusTrap";

export type Command = {
  id: string; label: string; group: string; keywords?: string; icon?: IconName; lead?: ReactNode; sub?: ReactNode; meta?: ReactNode; kbd?: string;
  run: () => void;
};

const match = (c: Command, q: string) => {
  const hay = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};
function Hl({ text, q }: { text: string; q: string }) {
  const w = q.trim().split(/\s+/)[0];
  const i = w ? text.toLowerCase().indexOf(w.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<b>{text.slice(i, i + w.length)}</b>{text.slice(i + w.length)}</>;
}

/**
 * ⌘K. Empty query: Recent, Navigate, Actions. Typing: local commands filter instantly;
 * companies and contacts come from search (skeleton while it runs); nothing found shows the
 * empty state plus one fallback ("Find companies matching …"). ↑↓ move, ↵ runs, Esc clears then closes.
 */
export function CommandPalette({ open, onClose, commands, recent, entities, fallback, latency = 420, inline, defaultQuery = "", forceLoading, entityCount = "1,284 companies" }: {
  open: boolean; onClose: () => void; commands: Command[]; recent: Command[]; entities: Command[]; fallback?: (q: string) => Command;
  latency?: number; inline?: boolean; defaultQuery?: string; forceLoading?: boolean; entityCount?: string;
}) {
  const [q, setQ] = useState(defaultQuery);
  const [settled, setSettled] = useState(defaultQuery);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(panelRef, open && !inline);

  // Focus the search on open; give focus back to whatever opened the palette on close.
  useEffect(() => {
    if (!open || inline) return;
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => { prev?.focus?.(); };
  }, [open, inline]);
  useEffect(() => { const t = setTimeout(() => setSettled(q), q.trim() ? latency : 0); return () => clearTimeout(t); }, [q, latency]);

  const query = q.trim();
  const loading = forceLoading || (query !== "" && settled !== q);
  const groups = useMemo(() => {
    if (!query) return [["Recent", recent], ["Navigate", commands.filter((c) => c.group === "Navigate")], ["Actions", commands.filter((c) => c.group === "Actions")]] as [string, Command[]][];
    const local = commands.filter((c) => match(c, query));
    const found = loading ? [] : entities.filter((c) => match(c, query));
    const out: [string, Command[]][] = [];
    const byGroup = (arr: Command[]) => arr.reduce<Record<string, Command[]>>((a, c) => ((a[c.group] ??= []).push(c), a), {});
    Object.entries(byGroup(found)).forEach((g) => out.push(g));
    Object.entries(byGroup(local)).forEach((g) => out.push(g));
    return out;
  }, [query, commands, recent, entities, loading]);
  const flat = groups.flatMap(([, cs]) => cs);
  const empty = !!query && !loading && flat.length === 0;
  const fb = query && fallback && !loading ? fallback(query) : null;
  const items = fb ? [...flat, fb] : flat;
  const cur = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => { list.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" }); }, [cur]);
  if (!open) return null;

  const run = (c?: Command) => { if (!c) return; c.run(); if (!inline) onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((cur + 1) % Math.max(1, items.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((cur - 1 + items.length) % Math.max(1, items.length)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[cur]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (q) { setQ(""); setActive(0); } else onClose(); }
  };
  let n = -1;
  const row = (c: Command) => {
    n += 1; const i = n;
    return (
      <div key={c.id} id={`${id}-${i}`} role="option" aria-selected={i === cur} className={cx("c-cmd__item", i === cur && "is-active")}
        onPointerMove={() => setActive(i)} onClick={() => run(c)}>
        <span className="c-cmd__lead">{c.lead ?? (c.icon && <Icon name={c.icon} />)}</span>
        <span className="c-cmd__label"><span className="c-cmd__txt"><Hl text={c.label} q={query} /></span>{c.sub && <span className="c-cmd__sub">{c.sub}</span>}</span>
        {c.meta && <span className="c-cmd__meta">{c.meta}</span>}
        {c.kbd && <span className="c-cmd__kbd">{c.kbd.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
        {i === cur && !c.kbd && <span className="c-cmd__enter"><Kbd>↵</Kbd></span>}
      </div>
    );
  };

  const panel = (
    <div ref={panelRef} className={cx("c-cmd", !inline && "c-pop-in")} role="dialog" aria-modal={!inline} aria-label="Command menu" onKeyDown={onKey}>
      <div className="c-cmd__search">
        <Icon name="search" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search companies, people, or type a command"
          role="combobox" aria-expanded aria-controls={`${id}-l`} aria-activedescendant={items.length ? `${id}-${cur}` : undefined} autoComplete="off" spellCheck={false} />
        {loading ? <span className="c-cmd__status"><span className="c-spin" />Searching</span> : <Kbd>esc</Kbd>}
      </div>
      <div className="c-cmd__list" id={`${id}-l`} role="listbox" ref={list}>
        {groups.map(([g, cs]) => cs.length > 0 && <div key={g} role="group" aria-label={g}><div className="c-cmd__group">{g}</div>{cs.map(row)}</div>)}
        {loading && (
          <div role="status" aria-label="Searching companies and people">
            <div className="c-cmd__group">Companies and people <span className="c-faint">· searching {entityCount}</span></div>
            {[148, 116, 172].map((w, i) => <div key={w} className="c-cmd__item c-cmd__item--skel"><span className="c-cmd__lead"><Skeleton w={20} h={20} r={i === 2 ? 10 : 5} /></span><Skeleton w={w} /><span style={{ flex: 1 }} /><Skeleton w={58} h={12} r={2} /></div>)}
          </div>
        )}
        {empty && (
          <div className="c-cmd__empty">
            <span className="c-strong">No results for “{query}”</span>
            <span>Try a company name, a domain like <span className="c-mono">kilima.co.ke</span>, a person, or a command such as “new segment”.</span>
          </div>
        )}
        {fb && <div role="group" aria-label="Search the market">{flat.length > 0 && <div className="c-cmd__group">Search the market</div>}{row(fb)}</div>}
      </div>
      <div className="c-cmd__foot">
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span><span><Kbd>↵</Kbd> to open</span><span><Kbd>esc</Kbd> {q ? "to clear" : "to close"}</span>
        <span style={{ flex: 1 }} /><span className="c-faint">{entityCount} · 3,902 people</span>
      </div>
    </div>
  );
  if (inline) return panel;
  return <div className="c-scrim c-scrim--cmd c-app" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>{panel}</div>;
}
