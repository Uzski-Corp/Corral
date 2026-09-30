"use client";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Kbd, cx } from "./primitives";
import { useDismiss } from "./useDismiss";
import { useFocusTrap } from "./useFocusTrap";

/* ------------------------------------------------------------------ Dialog
   Modal for one decision. Title 16/24 Medium, body 14/20, footer right-aligned:
   quiet/default cancel on the left of the one primary action.                */
export function Dialog({ open, onClose, title, description, children, footer, width = 440, inline, tone }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode;
  footer?: ReactNode; width?: number; /** render in place (styleguide) instead of fixed to the viewport */ inline?: boolean;
  tone?: "danger";
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, open && !inline);
  useEffect(() => {
    if (!open || inline) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("input:not([readonly]), textarea");
    (first ?? box.current)?.focus();
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [open, inline, onClose]);
  if (!open) return null;
  return (
    <div className={cx("c-scrim c-app", inline && "c-scrim--inline")} onPointerDown={(e) => { if (e.target === e.currentTarget && !inline) onClose(); }}>
      <div ref={box} role="dialog" tabIndex={-1} aria-modal={!inline} aria-labelledby={`${id}-t`} className={cx("c-dialog c-pop-in", tone === "danger" && "c-dialog--danger")} style={{ width }}>
        <div className="c-dialog__head">
          <div className="c-dialog__titles"><h2 id={`${id}-t`}>{title}</h2>{description && <p>{description}</p>}</div>
          <button type="button" data-close className="c-iconbtn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children && <div className="c-dialog__body">{children}</div>}
        {footer && <div className="c-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Dropdown menu */
export type MenuEntry =
  | { label: string; icon?: IconName; kbd?: string; meta?: ReactNode; lead?: ReactNode; checked?: boolean; danger?: boolean; disabled?: boolean; onSelect?: () => void }
  | { heading: string }
  | "separator";
const isItem = (e: MenuEntry): e is Extract<MenuEntry, { label: string }> => typeof e === "object" && "label" in e;

export function MenuList({ items, active, setActive, onPick, className, style, label }: {
  items: MenuEntry[]; active: number; setActive: (i: number) => void; onPick: (i: number) => void;
  className?: string; style?: CSSProperties; label?: string;
}) {
  return (
    <div role="menu" aria-label={label} className={cx("c-menu c-pop-in", className)} style={style}>
      {items.map((e, i) => {
        if (e === "separator") return <div key={i} className="c-menu__sep" role="separator" />;
        if (!isItem(e)) return <div key={i} className="c-menu__heading">{e.heading}</div>;
        return (
          <button key={i} type="button" role={e.checked !== undefined ? "menuitemcheckbox" : "menuitem"} aria-checked={e.checked} disabled={e.disabled}
            className={cx("c-menu__item", i === active && "is-hover", e.danger && "is-danger")}
            onPointerMove={() => setActive(i)} onClick={() => onPick(i)}>
            {e.lead}{e.icon && <Icon name={e.icon} />}<span className="c-menu__label">{e.label}</span>
            {e.meta && <span className="c-menu__meta">{e.meta}</span>}
            {e.checked && <span className="c-menu__tick"><Icon name="check" size={13} /></span>}
            {e.kbd && <Kbd>{e.kbd}</Kbd>}
          </button>
        );
      })}
    </div>
  );
}

/** Keyboard-first dropdown. ↑↓ move, ↵ picks, Esc closes. Positioned under its trigger. */
export function DropdownMenu({ trigger, items, align = "start", width = 220, defaultOpen = false, label, side = "bottom" }: {
  trigger: (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  items: MenuEntry[]; align?: "start" | "end"; width?: number; defaultOpen?: boolean; label?: string; side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const firstItem = items.findIndex(isItem);
  const [active, setActive] = useState(defaultOpen ? firstItem : -1);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setActive(-1); }, []);
  useDismiss(ref, open, close);
  const step = (d: 1 | -1) => {
    const n = items.length; let i = active;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; const e = items[i]; if (isItem(e) && !e.disabled) break; }
    setActive(i);
  };
  const pick = (i: number) => { const e = items[i]; if (isItem(e) && !e.disabled) { e.onSelect?.(); close(); } };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) { setOpen(true); setActive(firstItem); } else step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (open) step(-1); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); pick(active); }
  };
  return (
    <div ref={ref} className="c-popwrap" onKeyDown={onKeyDown}>
      {trigger({ onClick: () => (open ? close() : (setOpen(true), setActive(firstItem))), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && <MenuList label={label} items={items} active={active} setActive={setActive} onPick={pick}
        className={cx("c-menu--float", align === "end" && "is-end", side === "top" && "is-top")} style={{ width }} />}
    </div>
  );
}

/* ----------------------------------------------------------------- Tooltip
   Dark, 12px, 400ms delay. Only for icon-only controls and truncated text; never for sentences. */
export function Tooltip({ label, kbd, side = "top", open: forced, children }: { label: string; kbd?: string; side?: "top" | "bottom" | "right"; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const show = () => { clearTimeout(t.current); t.current = setTimeout(() => setOpen(true), 400); };
  const hide = () => { clearTimeout(t.current); setOpen(false); };
  useEffect(() => () => clearTimeout(t.current), []);
  const visible = forced ?? open;
  return (
    <span className="c-tipwrap" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} aria-describedby={visible ? id : undefined}>
      {children}
      {visible && <span role="tooltip" id={id} className={cx("c-tip", `c-tip--${side}`)}>{label}{kbd && <span className="c-tip__kbd">{kbd}</span>}</span>}
    </span>
  );
}
