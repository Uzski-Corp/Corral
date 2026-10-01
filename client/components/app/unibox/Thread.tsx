"use client";
/* The thread view (M7, ENG-57): earlier messages, the reply rendered safely, sent and teammate messages,
   and the rail's fit (M5) and sequence (M6) summaries. */
import { useState } from "react";
import { LEADS, type Thread, type ThreadMsg } from "../data";
import { Avatar, FitBar, Monogram, cx } from "../primitives";
import { Icon } from "../icons";
import { scoreFor } from "../fit/data";
import { BAND_WORD, band, confidence } from "@/lib/fit/score";

/** Earlier messages, collapsed to one line each; click (or ↵) to read one in full. */
export function History({ msgs }: { msgs: ThreadMsg[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  if (!msgs.length) return null;
  return (
    <ol className="u-history" aria-label="Earlier in this thread">
      {msgs.map((m, i) => {
        const on = open.has(i);
        return (
          <li key={i} className={cx("u-msg", `u-msg--${m.from}`, on && "is-open")}>
            <button type="button" className="u-msg__head" aria-expanded={on}
              onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
              <span className="u-msg__who">{m.who}</span>{m.note && <span className="u-msg__note">· {m.note}</span>}
              <span className="u-msg__at">· {m.at}</span><span style={{ flex: 1 }} />{m.meta && <span className="u-msg__meta">{m.meta}</span>}
            </button>
            <p className="u-msg__body">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The reply itself, rendered as text (never raw HTML): quoted history folded, remote images blocked,
 * links show where they go. `safe` shows those notes (the thread state); they're always the rule.
 */
export function Message({ t, safe }: { t: Thread; safe?: boolean }) {
  const [quoted, setQuoted] = useState(false);
  const [images, setImages] = useState(false);
  const domain = t.email?.split("@")[1];
  return (
    <div className="u-reply">
      <div className="u-reply__head"><span className="c-strong">{t.sender?.name ?? t.name}</span>{(t.sender?.email ?? t.email) && <span className="c-mono u-reply__addr">{t.sender?.email ?? t.email}</span>}
        <span style={{ flex: 1 }} /><span className="c-faint">{t.time}</span><span className="u-reply__to">to {t.mailbox ?? "you"} · {t.subject}</span></div>
      <p className="c-message">{t.body}</p>
      {safe && <>
        {quoted && <blockquote className="u-quoted">On Thu 24 Sep, 08:10, Tomás Ibarra wrote: {t.history?.at(-1)?.body}</blockquote>}
        <div className="u-safe" aria-label="How this email is shown">
          <button type="button" className="u-safe__chip" aria-expanded={quoted} onClick={() => setQuoted((q) => !q)}><Icon name="more" size={12} />{quoted ? "Hide quoted text" : "Quoted text hidden"}</button>
          <button type="button" className="u-safe__chip" aria-pressed={images} onClick={() => setImages((x) => !x)}><Icon name="globe" size={12} />{images ? `Images from ${domain} shown` : `2 remote images blocked · Load from ${domain}`}</button>
          <span className="u-safe__txt">Shown as plain text. Links open in a new tab and show their real address first.</span>
        </div>
      </>}
    </div>
  );
}

/** Your reply, once sent (or sending). */
export function SentMessage({ text, at, from, pending }: { text: string; at: string; from: string; pending?: boolean }) {
  return (
    <div className={cx("u-reply u-reply--mine", pending && "is-pending")}>
      <div className="u-reply__head"><span className="c-strong">You</span><span className="c-mono u-reply__addr">{from}</span><span style={{ flex: 1 }} />
        <span className="c-faint">{pending ? "Sending…" : at}</span></div>
      {text.split(/\n{2,}/).map((p, i) => <p key={i} className="c-message">{p}</p>)}
    </div>
  );
}

/** The lead's second email, landed while you were writing (`conflict-lead`). */
export function FollowUpMessage({ who, email, at, body, avatar }: { who: string; email: string; at: string; body: string; avatar: string }) {
  return (
    <div className="u-reply u-reply--again">
      <div className="u-reply__head"><Avatar id={avatar} size={20} /><span className="c-strong">{who}</span><span className="u-againtag">Wrote again</span><span className="c-mono u-reply__addr">{email}</span><span style={{ flex: 1 }} /><span className="c-faint">{at}</span></div>
      <p className="c-message">{body}</p>
    </div>
  );
}

/** A teammate's reply in the same thread (the conflict state). */
export function TeammateMessage({ who, email, at, body }: { who: string; email: string; at: string; body: string }) {
  return (
    <div className="u-reply u-reply--team">
      <div className="u-reply__head"><Avatar id="njoroge" size={20} /><span className="c-strong">{who}</span><span className="u-teamtag">Teammate</span><span className="c-mono u-reply__addr">{email}</span><span style={{ flex: 1 }} /><span className="c-faint">{at}</span></div>
      <p className="c-message">{body}</p>
    </div>
  );
}

/** Rail: the M5 score, its confidence and the checks that carried it. */
export function FitSummary({ t }: { t: Thread }) {
  const lead = LEADS.find((l) => l.company === t.company);
  if (!lead) return <><FitBar value={t.fit} size="lg" /><span className="u-fit__line">Scored from {t.email?.split("@")[1] ?? "their site"}. Not in your companies yet.</span></>;
  const s = scoreFor(lead, t.fit);
  const c = confidence(s);
  const top = [...s.checks].sort((a, b) => b.points - a.points).slice(0, 3);
  const href = lead.id === "kilima" ? "/app/companies?state=fit" : "/app/companies";
  return (
    <>
      <FitBar value={t.fit} size="lg" />
      <span className="u-fit__line">{BAND_WORD[band(t.fit)]} · {c.level} confidence · scored {s.at === "2026-09-27" ? "Sep 27" : s.at}</span>
      <ul className="u-fit__checks">
        {top.map((k) => <li key={k.id}><Icon name={k.verdict === "met" ? "check" : "alert"} size={12} /><span>{k.finding}</span><span className="c-num u-fit__pts">+{k.points}</span></li>)}
      </ul>
      <a className="c-link u-fit__why" href={href}>Why it scored {t.fit}</a>
    </>
  );
}

/** Rail: where the reply came from in its sequence (M6), step by step. */
export function SequenceTrail({ t }: { t: Thread }) {
  const s = t.seq;
  if (!s) return <span className="c-faint">Not from a sequence</span>;
  const stopped = s.state.startsWith("Stopped");
  const href = s.id === "drip" ? "/app/sequences?state=paused" : "/app/sequences?state=running";
  const sent = (i: number) => t.history?.filter((m) => m.from === "you")[i - 1];
  return (
    <div className="u-trail">
      <span className="u-trail__name"><a className="c-link" href={href}>{s.name}</a><span className="c-faint"> · step {s.step} of {s.of}</span></span>
      <span className={cx("u-trail__state", stopped ? "is-stopped" : "is-paused")}>{s.state}</span>
      <ol className="u-trail__steps">
        {Array.from({ length: s.of }, (_, k) => k + 1).map((i) => {
          const done = i < s.step || i === s.step;
          const msg = sent(i);
          const what = i < s.step ? `Sent${msg ? ` ${msg.at.split(",")[0]}` : ""}` : i === s.step ? (t.handled ? t.status === "OOO" ? "Auto-reply" : t.status : "Replied") : stopped ? "Won’t send" : "Waits";
          return <li key={i} className={cx(done && "is-done", i === s.step && "is-here")}><span className="u-trail__dot" aria-hidden="true" /><span>Step {i}</span><span className="c-faint">{what}</span></li>;
        })}
      </ol>
    </div>
  );
}

/** Rail: the mailbox replies go from (M6 pool), and whether it can send. */
export function MailboxLine({ t, disconnected }: { t: Thread; disconnected?: boolean }) {
  if (!t.mailbox) return null;
  return (
    <div className="c-rail__sec"><span className="c-rail__label">Replies go from</span>
      <span className="u-mbox"><span className={cx("u-mbox__dot", disconnected ? "is-bad" : "is-ok")} aria-hidden="true" /><span className="c-mono">{t.mailbox}</span></span>
      <span className="c-faint u-mbox__txt">{disconnected ? "Disconnected since 06:12. Reconnect to reply." : "The mailbox this thread is in, so they see one conversation."}</span></div>
  );
}

export function Face({ t, size = 20 }: { t: Pick<Thread, "avatar" | "name" | "email">; size?: 20 | 24 | 28 }) {
  return t.avatar ? <Avatar id={t.avatar} size={size} /> : <Monogram name={t.name} email={t.email} size={size} />;
}
