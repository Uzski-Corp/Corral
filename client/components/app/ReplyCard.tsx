import { Button, cx } from "./primitives";

/** Copilot draft. The draft is plain text you own: edit, send, or archive. */
export function ReplyCard({ paragraphs, from = "tomas@coldtrace.io · pool 3 of 6", focus, highlight }: {
  paragraphs: string[]; from?: string; focus?: boolean; highlight?: string;
}) {
  return (
    <div className={cx("c-reply", focus && "is-focus")}>
      <div className="c-reply__head"><span className="c-strong">Draft reply</span><span className="c-muted" style={{ fontSize: 12.5 }}>from {from}</span></div>
      <div className="c-reply__body">
        {paragraphs.map((p, i) => {
          if (highlight && p.includes(highlight)) {
            const [a, b] = p.split(highlight);
            return <p key={i}>{a}<mark>{highlight}</mark>{b}</p>;
          }
          return <p key={i}>{p}</p>;
        })}
      </div>
      <div className="c-reply__foot"><Button variant="primary" kbd="⌘↵">Send reply</Button><Button>Edit</Button><span style={{ flex: 1 }} /><span className="c-mono">E archive · S snooze</span></div>
    </div>
  );
}
