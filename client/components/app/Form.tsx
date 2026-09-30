"use client";
import { createContext, useCallback, useContext, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type TextareaHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./primitives";
import { useDismiss } from "./useDismiss";

/* ------------------------------------------------------------- FormField
   Label 13/18 Medium · control · help 12/16 tertiary. An error replaces the help
   (never both) and says what to do next. Controls inside pick up id + aria wiring. */
type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

export function FormField({ label, help, error, optional, action, children, className }: {
  label: ReactNode; help?: ReactNode; error?: ReactNode; optional?: boolean; action?: ReactNode; children: ReactNode; className?: string;
}) {
  const id = useId();
  const msg = error ?? help;
  return (
    <FieldContext.Provider value={{ id, describedBy: msg ? `${id}-m` : undefined, invalid: !!error }}>
      <div className={cx("c-field", className)}>
        <div className="c-field__top"><label htmlFor={id}>{label}{optional && <span className="c-field__opt">Optional</span>}</label>{action}</div>
        {children}
        {msg && <span id={`${id}-m`} className={cx("c-field__hint", !!error && "is-error")}>{!!error && <Icon name="alert" size={12} />}{msg}</span>}
      </div>
    </FieldContext.Provider>
  );
}
const useField = () => useContext(FieldContext);

/* ------------------------------------------------------------- TextInput */
export function TextInput({ icon, prefix, suffix, invalid, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  icon?: IconName; prefix?: ReactNode; suffix?: ReactNode; invalid?: boolean;
}) {
  const f = useField();
  const bad = invalid ?? f?.invalid;
  return (
    <div className={cx("c-input c-input--live", bad && "is-error", rest.disabled && "is-disabled", className)}>
      {icon && <Icon name={icon} />}{prefix && <span className="c-input__affix">{prefix}</span>}
      <input id={f?.id} aria-invalid={bad || undefined} aria-describedby={f?.describedBy} {...rest} />
      {suffix && <span className="c-input__affix">{suffix}</span>}
    </div>
  );
}
export function Textarea({ rows = 3, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const f = useField();
  const bad = invalid ?? f?.invalid;
  return <div className={cx("c-input c-input--live c-input--area", bad && "is-error")}><textarea id={f?.id} rows={rows} aria-invalid={bad || undefined} aria-describedby={f?.describedBy} {...rest} /></div>;
}

/* ------------------------------------------------------------- Checkbox */
export function Checkbox({ checked, indeterminate, onChange, label, description, disabled }: {
  checked: boolean; indeterminate?: boolean; onChange?: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={cx("c-choice", disabled && "is-disabled")}>
      <button type="button" role="checkbox" aria-checked={indeterminate ? "mixed" : checked} disabled={disabled}
        className={cx("c-check", checked && !indeterminate && "is-on", indeterminate && "is-mixed")} onClick={() => onChange?.(!checked)} />
      <span className="c-choice__txt"><span>{label}</span>{description && <em>{description}</em>}</span>
    </label>
  );
}

/* ------------------------------------------------------------- Switch */
export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange?: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean;
}) {
  const sw = <button type="button" role="switch" aria-checked={checked} disabled={disabled} aria-label={typeof label === "string" ? label : undefined}
    className={cx("c-toggle", checked && "is-on")} onClick={() => onChange?.(!checked)} />;
  if (!label) return sw;
  return <label className={cx("c-choice c-choice--switch", disabled && "is-disabled")}><span className="c-choice__txt"><span>{label}</span>{description && <em>{description}</em>}</span>{sw}</label>;
}

/* ------------------------------------------------------------- RadioGroup
   list: stacked rows. cards: bordered options side by side (plans, providers). ←↑↓→ move. */
export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; lead?: ReactNode; disabled?: boolean };
export function RadioGroup({ value, onChange, options, variant = "list", label }: {
  value: string; onChange?: (v: string) => void; options: RadioOption[]; variant?: "list" | "cards"; label?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange?.(options[n].value); refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cx("c-radios", variant === "cards" && "c-radios--cards")}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={o.disabled}
            className={cx("c-radio", on && "is-on")} onClick={() => onChange?.(o.value)} onKeyDown={(e) => onKey(e, i)}>
            <span className="c-radio__dot" />{o.lead}
            <span className="c-choice__txt"><span>{o.label}</span>{o.description && <em>{o.description}</em>}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- Select
   Button + listbox. For < 12 options; beyond that use a combobox (M2). */
/** `hint`: a second line under the label, in the menu only (M7: "Opened, no reply" and Apple Mail privacy). */
export type SelectOption = { value: string; label: string; meta?: ReactNode; lead?: ReactNode; hint?: string };
export function Select({ value, onChange, options, placeholder = "Select…", width, defaultOpen = false, icon, label, menuWidth }: {
  value: string | null; onChange?: (v: string) => void; options: SelectOption[]; placeholder?: string; width?: number | string; defaultOpen?: boolean; icon?: IconName;
  /** M7: a wider menu than the trigger, for options with a `hint` */ menuWidth?: number;
  /** accessible name when there is no <FormField> label (table cells, rule rows) */ label?: string;
}) {
  const f = useField();
  const own = useId();
  const bid = f?.id ?? own;
  const [open, setOpen] = useState(defaultOpen);
  const cur = options.findIndex((o) => o.value === value);
  const [active, setActive] = useState(Math.max(0, cur));
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const sel = options[cur];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(Math.max(0, cur)); return; }
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if ((e.key === "Enter" || e.key === " ") && open) { e.preventDefault(); onChange?.(options[active].value); close(); }
  };
  return (
    <div ref={ref} className="c-popwrap" style={{ width }} onKeyDown={onKey}>
      <button type="button" id={bid} aria-haspopup="listbox" aria-expanded={open} aria-describedby={f?.describedBy} aria-label={label ? `${label}: ${sel ? sel.label : placeholder}` : undefined}
        className={cx("c-input c-select", open && "is-focus", f?.invalid && "is-error", !sel && "is-placeholder")}
        onClick={() => { setOpen((o) => !o); setActive(Math.max(0, cur)); }}>
        {icon && <Icon name={icon} />}{sel?.lead}<span className="c-select__v">{sel ? sel.label : placeholder}</span>
        {sel?.meta && <span className="c-select__meta">{sel.meta}</span>}<Icon name="down" size={12} />
      </button>
      {open && (
        <div role="listbox" aria-label={label ?? undefined} aria-labelledby={label ? undefined : bid} className="c-menu c-menu--float c-pop-in" style={{ width: menuWidth ?? "100%", minWidth: 200 }}>
          {options.map((o, i) => (
            <div key={o.value} role="option" aria-selected={o.value === value} className={cx("c-menu__item", i === active && "is-hover", o.hint && "has-hint")}
              onPointerMove={() => setActive(i)} onClick={() => { onChange?.(o.value); close(); }}>
              {o.lead}{o.hint ? <span className="c-menu__stack"><span className="c-menu__label">{o.label}</span><span className="c-menu__hint">{o.hint}</span></span> : <span className="c-menu__label">{o.label}</span>}{o.meta && <span className="c-menu__meta">{o.meta}</span>}
              {o.value === value && <span className="c-menu__tick"><Icon name="check" size={13} /></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- DatePicker
   Monday-first month grid. Past days disabled when min is set. Quick picks sit above the grid. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const formatDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function Calendar({ value, onChange, today, min, quick }: { value: Date | null; onChange: (d: Date) => void; today: Date; min?: Date; quick?: [string, Date][] }) {
  const [view, setView] = useState(() => new Date((value ?? today).getFullYear(), (value ?? today).getMonth(), 1));
  const lead = (view.getDay() + 6) % 7;
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1);
  const floor = min && new Date(min.getFullYear(), min.getMonth(), min.getDate());
  return (
    <div className="c-cal">
      {quick && <div className="c-cal__quick">{quick.map(([l, d]) => <button type="button" key={l} className={cx("c-chip", value && same(value, d) && "is-open")} onClick={() => onChange(d)}>{l}</button>)}</div>}
      <div className="c-cal__head">
        <span className="c-strong">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
        <span style={{ display: "flex", gap: 2 }}>
          <button type="button" className="c-iconbtn" aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><Icon name="back" /></button>
          <button type="button" className="c-iconbtn" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><Icon name="chev" /></button>
        </span>
      </div>
      {/* A named group of day buttons (not role="grid": a grid needs rows and gridcells, and arrow-key roving). */}
      <div className="c-cal__grid" role="group" aria-label={`${MONTHS[view.getMonth()]} ${view.getFullYear()}`}>
        {DOW.map((d) => <span key={d} className="c-cal__dow" aria-hidden="true">{d}</span>)}
        {cells.map((n, i) => {
          if (n < 1 || n > days) return <span key={i} />;
          const d = new Date(view.getFullYear(), view.getMonth(), n);
          const off = !!floor && d < floor;
          return <button type="button" key={i} disabled={off} aria-pressed={!!value && same(d, value)} aria-label={formatDate(d)}
            className={cx("c-cal__day", same(d, today) && "is-today", value && same(d, value) && "is-on")} onClick={() => onChange(d)}>{n}</button>;
        })}
      </div>
    </div>
  );
}

export function DatePicker({ value, onChange, today, min, placeholder = "Pick a date", defaultOpen = false, quick }: {
  value: Date | null; onChange?: (d: Date) => void; today: Date; min?: Date; placeholder?: string; defaultOpen?: boolean; quick?: [string, Date][];
}) {
  const f = useField();
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div ref={ref} className="c-popwrap">
      <button type="button" id={f?.id} aria-haspopup="dialog" aria-expanded={open} aria-describedby={f?.describedBy}
        className={cx("c-input c-select", open && "is-focus", !value && "is-placeholder")} onClick={() => setOpen((o) => !o)}>
        <Icon name="cal" /><span className="c-select__v">{value ? formatDate(value) : placeholder}</span><Icon name="down" size={12} />
      </button>
      {open && <div className="c-menu c-menu--float c-pop-in c-cal-pop" role="dialog" aria-label="Choose date">
        <Calendar value={value} today={today} min={min} quick={quick} onChange={(d) => { onChange?.(d); close(); }} /></div>}
    </div>
  );
}
