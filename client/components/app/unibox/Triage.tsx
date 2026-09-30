"use client";
/* Triage in the Unibox (M7, ENG-57): filter chips over the list, the triage menu on a thread, the keys sheet. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Thread } from "../data";
import { Kbd, Tag, cx } from "../primitives";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { useDismiss } from "../useDismiss";
import { TRIAGE, isFiltered, toggleTriage, triageCounts, triageOf, type Filters, type Triage } from "@/lib/unibox/triage";

/** Chips over the thread list: one per triage (with its count in the tab), Unread, Clear. Scrolls sideways at 390. */
export function FilterChips({ list, filters, onChange }: { list: Thread[]; filters: Filters; onChange: (f: Filters) => void }) {
  const counts = triageCounts(list);
  const unread = list.filter((t) => t.unread).length;
  return (
    <div className="u-filters" role="group" aria-label="Filter threads">
      <button type="button" className={cx("u-chip", filters.unread && "is-on")} aria-pressed={filters.unread} onClick={() => onChange({ ...filters, unread: !filters.unread })}>
        Unread<span className="u-chip__n">{unread}</span></button>
      <span className="u-filters__sep" aria-hidden="true" />
      {TRIAGE.map((d) => {
        const on = filters.triage.includes(d.id);
        if (!counts[d.id] && !on) return null;
        return <button key={d.id} type="button" className={cx("u-chip", on && "is-on")} aria-pressed={on} onClick={() => onChange(toggleTriage(filters, d.id))}>
          <span className={cx("u-chip__dot", `u-dot--${d.id}`)} aria-hidden="true" />{d.label}<span className="u-chip__n">{counts[d.id]}</span></button>;
      })}
      {isFiltered(filters) && <button type="button" className="u-chip u-chip--clear" onClick={() => onChange({ triage: [], unread: false })}><Icon name="x" size={12} />Clear</button>}
    </div>
  );
}

/** The row tag: the status, and "Handled" when Corral dealt with it on its own. */
export function RowTag({ t }: { t: Thread }) {
  return <span className="u-rowtag"><Tag status={t.status} />{t.handled && <span className="u-handledtag"><Icon name="check" size={11} />Handled by Corral</span>}</span>;
}

/**
 * The thread's triage: a button showing the status, opening a menu of the six kinds (keys 1–6),
 * each saying what Corral does next. Controlled so T can open it.
 */
export function TriageMenu({ t, open, onOpenChange, onPick }: { t: Thread; open: boolean; onOpenChange: (o: boolean) => void; onPick: (id: Triage) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useDismiss(ref, open, close);
  return (
    <div ref={ref} className="c-popwrap u-triage">
      <button type="button" className="u-triage__btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Triage: ${t.status}. Change`} onClick={() => onOpenChange(!open)}>
        <Tag status={t.status} /><Icon name="down" size={12} /></button>
      {open && <TriageList t={t} onPick={(id) => { onPick(id); onOpenChange(false); }}
        onClose={() => { onOpenChange(false); ref.current?.querySelector<HTMLButtonElement>(".u-triage__btn")?.focus(); }} />}
    </div>
  );
}

/** The open menu: mounted on open, so it starts on the current triage. ↑↓ move, ↵ or 1–6 pick, Esc closes. */
function TriageList({ t, onPick, onClose }: { t: Thread; onPick: (id: Triage) => void; onClose: () => void }) {
  const cur = triageOf(t);
  const [active, setActive] = useState(() => Math.max(0, TRIAGE.findIndex((d) => d.id === cur)));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")[active]?.focus({ preventScroll: true }); }, [active]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + TRIAGE.length) % TRIAGE.length); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else { const d = TRIAGE.find((x) => x.key === e.key); if (d) { e.preventDefault(); e.stopPropagation(); onPick(d.id); } }
  };
  return (
    <div ref={ref} role="menu" aria-label={`Triage ${t.name.split(" ")[0]}’s reply`} className="c-menu c-menu--float is-end c-pop-in u-triage__menu" onKeyDown={onKey}>
      <div className="c-menu__heading">Mark as · Corral then</div>
      {TRIAGE.map((d, i) => (
        <button key={d.id} type="button" role="menuitemradio" aria-checked={d.id === cur} tabIndex={i === active ? 0 : -1}
          className={cx("c-menu__item u-triage__item", i === active && "is-hover")} onPointerMove={() => setActive(i)} onClick={() => onPick(d.id)}>
          <span className={cx("u-chip__dot", `u-dot--${d.id}`)} aria-hidden="true" />
          <span className="c-menu__stack"><span className="c-menu__label">{d.label}{d.handled && <span className="u-triage__auto"> · handled for you</span>}</span><span className="c-menu__hint">{d.then}</span></span>
          {d.id === cur && <span className="c-menu__tick"><Icon name="check" size={13} /></span>}
          <Kbd>{d.key}</Kbd>
        </button>
      ))}
    </div>
  );
}

export const KEY_GROUPS: { title: string; keys: [string[], string][] }[] = [
  { title: "Move", keys: [[["J"], "Next thread"], [["K"], "Previous thread"], [["↵"], "Open the thread"], [["Esc"], "Back to the list (phone)"], [["⌘", "K"], "Jump to anything"]] },
  { title: "Triage", keys: [[["1"], "Interested"], [["2"], "Objection"], [["3"], "Referral"], [["4"], "Out of office"], [["5"], "Unsubscribe"], [["6"], "Bounce"], [["T"], "Open the triage menu"]] },
  { title: "Reply", keys: [[["R"], "Reply: edit Corral’s draft, or draft one"], [["⌘", "↵"], "Send"], [["⌘", "Z"], "Undo send (10 seconds)"], [["E"], "Archive"], [["H"], "Snooze until Monday"], [["?"], "This sheet"]] },
];

export function KeysSheet({ open, onClose, inline }: { open: boolean; onClose: () => void; inline?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} inline={inline} width={560} title="Keyboard shortcuts" description="Work the Unibox without the mouse. Keys don’t fire while you’re typing in a reply.">
      <div className="u-keys">
        {KEY_GROUPS.map((g) => (
          <section key={g.title} className="u-keys__group" aria-label={g.title}><h3 className="u-keys__h">{g.title}</h3>
            <dl className="u-keys__list">{g.keys.map(([k, what]) => <div key={what} className="u-keys__row"><dt>{k.map((x) => <Kbd key={x}>{x}</Kbd>)}</dt><dd>{what}</dd></div>)}</dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
