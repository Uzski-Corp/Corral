import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./icons";
import { LOGOS, type CompanyName } from "./data";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/* Buttons: one action colour, near-black second, quiet third */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ink" | "quiet"; size?: "sm" | "lg"; kbd?: string;
};
export function Button({ variant = "default", size = "sm", kbd, className, children, ...rest }: BtnProps) {
  return (
    <button type="button" className={cx("c-btn", variant !== "default" && `c-btn--${variant}`, size === "lg" && "c-btn--lg", className)} {...rest}>
      {children}{kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}
export const Kbd = ({ children }: { children: ReactNode }) => <span className="c-kbd">{children}</span>;

/* Status tags: 50 fill / 200 border / 600 text */
export const STATUS = {
  Interested: "t-pos", Replied: "t-pos", Verified: "t-pos", "Meeting booked": "t-info",
  Objection: "t-warn", "Catch-all": "t-warn", "Not interested": "t-neg", Disqualified: "t-neg", Bounced: "t-neg",
  "Not contacted": "t-neu", Contacted: "t-neu", OOO: "t-neu", Referral: "t-ref",
} as const;
export type Status = keyof typeof STATUS;
export const Tag = ({ status }: { status: Status }) => <span className={cx("c-tag", STATUS[status])}>{status}</span>;

/* Fit bar — the signature. Ten segments; blue from 80, grey below. */
export function FitBar({ value, size }: { value: number; size?: "md" | "lg" }) {
  const on = Math.round(value / 10);
  return (
    <span className={cx("c-fit", value < 80 && "c-fit--low", size && `c-fit--${size}`)} role="img" aria-label={`Fit ${value} of 100`}>
      <span className="c-fit__bar">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < on ? "on" : undefined} />)}</span>
      <span className="c-fit__n">{value}</span>
    </span>
  );
}

export function Avatar({ id, size = 20, alt = "" }: { id: string; size?: 20 | 24 | 28 | 36 | 48; alt?: string }) {
  // Plain img: tiny, fixed-size, already optimised 240px JPGs. Film-graded Open Range treatment on every route.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cx("c-av", size !== 20 && `c-av--${size}`)} src={`/corral/app/av-${id}.jpg`} alt={alt} width={size} height={size} loading="lazy" />;
}

/** Initials from a display name ("Tomás Ibarra" -> "TI"), falling back to an email's local part. */
export function initialsOf(name: string, email?: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = (email ?? "").split("@")[0].replace(/[^\p{L}\p{N}]/gu, "");
  return (local.slice(0, 2) || "?").toUpperCase();
}

/**
 * Avatar for people without a picture: initials on the neutral token tint
 * (neutral-200 fill, neutral-600 initials, 6.08:1). Same box as <Avatar>, so rows never shift.
 * Also the fallback when a remote picture fails to load.
 */
export function Monogram({ name, email, size = 20, label }: { name: string; email?: string; size?: 20 | 24 | 28 | 36 | 48; label?: string }) {
  return (
    <span className={cx("c-av c-mono-av", size !== 20 && `c-av--${size}`)} style={{ fontSize: Math.round(size * 0.42) }}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{initialsOf(name, email)}</span>
  );
}

export function Logo({ company }: { company: CompanyName }) {
  const [bg, fg, l] = LOGOS[company];
  return <span className="c-logo" style={{ background: bg, color: fg }} aria-hidden="true">{l}</span>;
}

/* Receipts: AI shows its work instead of sparkles */
export function Receipt({ children, meta, live }: { children: ReactNode; meta?: ReactNode; live?: boolean }) {
  return <div className={cx("c-receipt", live && "is-live")}><Icon name="check" size={12} /><span>{children}</span>{meta && <em>{meta}</em>}</div>;
}
export const Receipts = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx("c-receipts", className)}>{children}</div>;

export function Chip({ children, add, open, onClick }: { children: ReactNode; add?: boolean; open?: boolean; onClick?: () => void }) {
  return <button type="button" className={cx("c-chip", add && "c-chip--add", open && "is-open")} onClick={onClick} aria-expanded={open}>{add && <Icon name="plus" size={12} />}{children}</button>;
}

export function Check({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label: string }) {
  return <button type="button" role="checkbox" aria-checked={on} aria-label={label} className={cx("c-check", on && "is-on")} onClick={() => onChange?.(!on)} />;
}
export const Toggle = ({ on }: { on?: boolean }) => <span className={cx("c-toggle", on && "is-on")} role="switch" aria-checked={!!on} />;

export function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange?: (v: string) => void; label?: string }) {
  if (!onChange) return <span className="c-seg">{options.map((o) => <span key={o} className={o === value ? "is-on" : undefined}>{o}</span>)}</span>;
  return (
    <span className="c-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? "is-on" : undefined} onClick={() => onChange(o)}>{o}</button>)}
    </span>
  );
}

export function Input({ icon, children, state, placeholder }: { icon?: IconName; children?: ReactNode; state?: "focus" | "error"; placeholder?: string }) {
  return (
    <div className={cx("c-input", state && `is-${state}`, !children && "is-placeholder")}>
      {icon && <Icon name={icon} />}<span>{children ?? placeholder}</span>{state === "focus" && <span className="c-caret" />}
    </div>
  );
}
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="c-field"><label>{label}</label>{children}{hint && <span className="c-field__hint">{hint}</span>}</div>;
}

export type ToastProps = {
  icon?: IconName; children: ReactNode; meta?: ReactNode; tone?: "default" | "success" | "error";
  action?: { label: string; onClick: () => void }; onClose?: () => void;
};
/** Ink toast: one line, optional meta, at most one action. Success/error only tint the icon. */
export function Toast({ icon, children, meta, tone = "default", action, onClose }: ToastProps) {
  const ic: IconName = icon ?? (tone === "error" ? "alert" : tone === "success" ? "check" : "cal");
  return (
    <div className={cx("c-toast", tone !== "default" && `c-toast--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon name={ic} /><span>{children}</span>{meta && <span className="c-muted">{meta}</span>}
      {action && <button type="button" className="c-toast__action" onClick={() => { action.onClick(); onClose?.(); }}>{action.label}</button>}
      {onClose && <button type="button" className="c-toast__x" aria-label="Dismiss" onClick={onClose}><Icon name="x" size={12} /></button>}
    </div>
  );
}
