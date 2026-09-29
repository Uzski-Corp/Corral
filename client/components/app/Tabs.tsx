"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./primitives";

export type TabItem = { id: string; label: ReactNode; count?: number | string };
/** line: page/section tabs under a toolbar (2px ink underline). pill: in-panel switch (same as Segmented, but interactive). ←→ move. */
export function Tabs({ tabs, value, onChange, variant = "line", label }: { tabs: TabItem[]; value: string; onChange?: (id: string) => void; variant?: "line" | "pill"; label?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    onChange?.(tabs[n].id); refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx("c-tabs", `c-tabs--${variant}`)}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1}
          className={cx("c-tab", t.id === value && "is-on")} onClick={() => onChange?.(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}{t.count !== undefined && <span className="c-tab__n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
