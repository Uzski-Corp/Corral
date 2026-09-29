import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./primitives";

/* Skeletons: the shape of what is coming, in surface-sunken, with a slow 1.4s sheen.
   Match the real row heights (40 table, 72 thread) so nothing jumps when data lands. */
export const Skeleton = ({ w = "100%", h = 10, r = 4, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) =>
  <span className="c-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;

const WIDTHS = [[132, 86, 150], [104, 70, 120], [148, 92, 136], [120, 64, 158], [96, 80, 110], [140, 74, 128], [112, 90, 146], [126, 68, 118]];
export function SkeletonTable({ rows = 6, label = "Loading companies" }: { rows?: number; label?: string }) {
  return (
    <div className="c-table" role="status" aria-label={label}>
      <div className="c-tr c-thead"><span /><span>Company</span><span>Decision-maker</span><span>Fit</span><span>Email</span><span>Reply</span><span>Last touch</span></div>
      {Array.from({ length: rows }, (_, i) => { const [a, b, c] = WIDTHS[i % WIDTHS.length]; return (
        <div key={i} className="c-tr c-tr--skel">
          <span><Skeleton w={12} h={12} r={4} /></span>
          <span className="c-cell"><Skeleton w={20} h={20} r={5} /><Skeleton w={a} /></span>
          <span className="c-cell"><Skeleton w={20} h={20} r={10} /><Skeleton w={c} /></span>
          <span><Skeleton w={58} h={12} r={2} /></span><span><Skeleton w={b - 20} h={22} r={6} /></span><span><Skeleton w={b} h={22} r={6} /></span><span><Skeleton w={44} /></span>
        </div>); })}
    </div>
  );
}
export function SkeletonThreads({ rows = 5 }: { rows?: number }) {
  return (
    <div className="c-skel-threads" role="status" aria-label="Loading conversations">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="c-skel-thread"><Skeleton w={28} h={28} r={14} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 3 }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}><Skeleton w={WIDTHS[i][0] - 20} /><Skeleton w={28} /></span>
            <Skeleton w={WIDTHS[i][1]} h={8} /><Skeleton w="88%" h={8} /><Skeleton w={72} h={22} r={6} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const Spinner = ({ size = 14 }: { size?: number }) => <span className="c-spin" style={{ width: size, height: size }} aria-hidden="true" />;

/* Empty state: says what this place is for, then the one way to fill it.
   art="range" drops a small crop of the Open Range image world into the UI (brand inside product). */
export function EmptyState({ icon, title, children, actions, art, compact }: { icon?: IconName; title: ReactNode; children?: ReactNode; actions?: ReactNode; art?: "range" | "grass"; compact?: boolean }) {
  return (
    <div className={cx("c-empty", compact && "c-empty--compact")}>
      {art ? <span className={cx("c-empty__art", `c-empty__art--${art}`)} aria-hidden="true" /> : icon && <span className="c-empty__ic"><Icon name={icon} size={16} /></span>}
      <div className="c-empty__txt"><p className="c-strong">{title}</p>{children && <p>{children}</p>}</div>
      {actions && <div className="c-actions">{actions}</div>}
    </div>
  );
}

/* Error state: what failed, whether anything was lost, and the retry. Technical detail in mono, last. */
export function ErrorState({ title, children, detail, actions }: { title: ReactNode; children?: ReactNode; detail?: string; actions?: ReactNode }) {
  return (
    <div className="c-empty c-empty--error" role="alert">
      <span className="c-empty__ic"><Icon name="alert" size={16} /></span>
      <div className="c-empty__txt"><p className="c-strong">{title}</p>{children && <p>{children}</p>}</div>
      {actions && <div className="c-actions">{actions}</div>}
      {detail && <span className="c-mono">{detail}</span>}
    </div>
  );
}

/* Banner: inline, full-width message at the top of a form or panel. */
export function Banner({ tone = "info", title, children, action, icon }: { tone?: "info" | "error" | "caution" | "success"; title?: ReactNode; children?: ReactNode; action?: ReactNode; icon?: IconName }) {
  const ic: IconName = icon ?? (tone === "success" ? "check" : tone === "info" ? "mail" : "alert");
  return (
    <div className={cx("c-banner", `c-banner--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon name={ic} /><div className="c-banner__txt">{title && <b>{title}</b>}{children && <span>{children}</span>}</div>{action}
    </div>
  );
}
