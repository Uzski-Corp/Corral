import type { ReactNode } from "react";
import { Button, cx } from "./primitives";

/**
 * Copilot draft. The draft is plain text you own: edit, send, or archive.
 * M7 extensions (optional; the M1 markup is unchanged without them): `title` and `meta` in the head,
 * `children` replaces the paragraphs, `note` sits between body and foot, `foot` replaces the actions,
 * `tone` tints the card, `busy` marks it aria-busy (drafting), `label` names the region.
 */
export function ReplyCard({ paragraphs = [], from = "tomas@coldtrace.io · pool 3 of 6", focus, highlight, title, meta, children, note, foot, tone, busy, label }: {
  paragraphs?: string[]; from?: string; focus?: boolean; highlight?: string;
  title?: ReactNode; meta?: ReactNode; children?: ReactNode; note?: ReactNode; foot?: ReactNode; tone?: "caution" | "negative"; busy?: boolean; label?: string;
}) {
  return (
    <div className={cx("c-reply", focus && "is-focus", tone && `c-reply--${tone}`)} role={label ? "region" : undefined} aria-label={label} aria-busy={busy || undefined}>
      <div className="c-reply__head"><span className="c-strong">{title ?? "Draft reply"}</span>{meta}<span className="c-muted" style={{ fontSize: 12.5 }}>from {from}</span></div>
      {children ?? <div className="c-reply__body">
        {paragraphs.map((p, i) => {
          if (highlight && p.includes(highlight)) {
            const [a, b] = p.split(highlight);
            return <p key={i}>{a}<mark>{highlight}</mark>{b}</p>;
          }
          return <p key={i}>{p}</p>;
        })}
      </div>}
      {note}
      {foot ?? <div className="c-reply__foot"><Button variant="primary" kbd="⌘↵">Send reply</Button><Button>Edit</Button><span style={{ flex: 1 }} /><span className="c-mono">E archive · S snooze</span></div>}
    </div>
  );
}
