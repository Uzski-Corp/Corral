"use client";
/* The industry picker of the pricing gate (Bau's design: `c-input c-select` trigger, `c-menu c-pop-in` with a
   `c-cmd__search` row and `c-menu__item`s). The app's Select is for under 12 options; this is the searchable one.
   ARIA: the trigger is role=combobox (aria-expanded, aria-controls); focus moves to the search box when open and
   aria-activedescendant names the highlighted option. Arrows move, Enter picks, Esc closes (and returns to the trigger),
   typing on the closed trigger opens it with that text. */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/app/icons";
import { cx } from "@/components/app/primitives";
import { INDUSTRIES, type IndustryValue } from "@/lib/marketing/pricingIntent";
import { PRICING_GATE } from "./pricing-gate-copy";

export const filterIndustries = (query: string) => {
  const q = query.trim().toLowerCase();
  return q ? INDUSTRIES.filter((i) => i.label.toLowerCase().includes(q)) : [...INDUSTRIES];
};

export function IndustryCombobox({ id, value, onChange, invalid, describedBy, disabled }: {
  id: string; value: IndustryValue | ""; onChange: (v: IndustryValue) => void; invalid?: boolean; describedBy?: string; disabled?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const options = useMemo(() => filterIndustries(query), [query]);
  const current = INDUSTRIES.find((i) => i.value === value);

  const close = (refocus = false) => { setOpen(false); setQuery(""); if (refocus) trigger.current?.focus(); };
  // Outside click closes. Escape is handled in the search box (which holds focus while open), so it never reaches the dialog.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  useEffect(() => { if (open) search.current?.focus(); }, [open]);

  const openMenu = (text = "") => {
    if (disabled) return;
    setQuery(text);
    const at = text ? 0 : Math.max(0, INDUSTRIES.findIndex((i) => i.value === value));
    setActive(at);
    setOpen(true);
  };
  const pick = (v: IndustryValue) => { onChange(v); close(true); };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) openMenu(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") { e.preventDefault(); openMenu(e.key); }
  };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = options.length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); setActive((a) => (a + 1) % n); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); setActive((a) => (a - 1 + n) % n); }
    else if (e.key === "Enter") { e.preventDefault(); const o = options[active]; if (o) pick(o.value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close();
  };

  return (
    <div ref={wrap} className="c-popwrap" style={{ width: "100%", flexDirection: "column" }}>
      <button ref={trigger} type="button" id={id} role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={listId}
        aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-disabled={disabled || undefined}
        className={cx("c-input c-select", open && "is-focus", invalid && "is-error", !current && "is-placeholder")}
        onClick={() => (open ? close() : openMenu())} onKeyDown={onTriggerKey}>
        <span className="c-select__v">{current ? current.label : PRICING_GATE.fields.industry.placeholder}</span><Icon name="down" size={12} />
      </button>
      {open && (
        <div className="c-menu c-pop-in pg-menu">
          <div className="c-cmd__search">
            <Icon name="search" size={14} />
            <input ref={search} type="text" role="searchbox" aria-label={PRICING_GATE.fields.industry.search} placeholder={PRICING_GATE.fields.industry.search}
              value={query} autoComplete="off" spellCheck={false} aria-controls={listId} aria-activedescendant={options[active] ? `${uid}-o-${options[active].value}` : undefined}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onSearchKey} />
          </div>
          <div id={listId} role="listbox" aria-label={PRICING_GATE.fields.industry.label} className="pg-menu__list">
            {options.map((o, i) => (
              <div key={o.value} id={`${uid}-o-${o.value}`} role="option" aria-selected={o.value === value} className={cx("c-menu__item", i === active && "is-hover")}
                onPointerMove={() => setActive(i)} onClick={() => pick(o.value)}>
                <span className="c-menu__label">{o.label}</span>
                {o.value === value && <span className="c-menu__tick"><Icon name="check" size={13} /></span>}
              </div>
            ))}
          </div>
          {options.length === 0 && <div role="status" className="pg-menu__list"><div className="c-menu__item"><span className="c-menu__label">{PRICING_GATE.fields.industry.none}</span></div></div>}
        </div>
      )}
    </div>
  );
}
