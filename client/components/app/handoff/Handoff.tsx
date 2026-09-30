"use client";
/* Handoffs in the thread and on the lead (M8, ENG-58): the Cal.com meeting as an event in the thread, the
   three handoffs (meeting, deal, follow-up) as steps, and the two things that need a person: Phoenix refusing
   the deal, and Phoenix already having the company. */
import { useState, type ReactNode } from "react";
import { Avatar, Button, Monogram, Receipt, Receipts, cx } from "../primitives";
import { Icon } from "../icons";
import { RadioGroup } from "../Form";
import { useToast } from "../Toaster";
import { MEETING_WORD, type DealState, type MeetingStatus, type NurtureState } from "@/lib/handoff/handoff";
import type { HandoffModel } from "./data";

const HEADLINE: Record<MeetingStatus, (first: string) => string> = {
  booked: (f) => `${f} booked a meeting`, rescheduled: (f) => `${f} moved the meeting`, cancelled: (f) => `${f} cancelled the meeting`, "no-show": () => "Nobody from Nyota joined",
};
const MEET_TONE: Record<MeetingStatus, string> = { booked: "live", rescheduled: "live", cancelled: "neutral", "no-show": "caution" };
const DEAL_WORD: Record<DealState, string> = { pushed: "Deal opened", updated: "Deal updated", retrying: "Retrying", failed: "Not sent", duplicate: "Needs you", off: "Not connected" };
const DEAL_TONE: Record<DealState, string> = { pushed: "positive", updated: "positive", retrying: "caution", failed: "negative", duplicate: "caution", off: "neutral" };
const NURTURE_WORD: Record<NurtureState, string> = { scheduled: "Scheduled", moved: "Moved", stopped: "Stopped", paused: "Held", waiting: "Waiting", off: "Off" };
const NURTURE_TONE: Record<NurtureState, string> = { scheduled: "positive", moved: "positive", stopped: "neutral", paused: "neutral", waiting: "caution", off: "neutral" };

export const Tile = ({ label, small }: { label: string; small?: boolean }) => <span className={cx("h-tile", small && "h-tile--sm")} aria-hidden="true">{label}</span>;
export const Pill = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={cx("h-pill", `is-${tone}`)}>{children}</span>;

/** The meeting, as an event in the thread (and, compact, on the lead). */
export function MeetingCard({ h, compact }: { h: HandoffModel; compact?: boolean }) {
  const m = h.meeting;
  const gone = m.status === "cancelled" || m.status === "no-show";
  return (
    <section className={cx("h-meet", `is-${m.status}`, compact && "is-compact")} aria-label={`Meeting: ${MEETING_WORD[m.status].toLowerCase()}`}>
      <header className="h-meet__head">
        <Tile label="Ca" />
        <span className="h-meet__src"><span className="c-strong">{HEADLINE[m.status](m.by.split(" ")[0])}</span><span className="c-faint">Cal.com · {m.received}</span></span>
        <Pill tone={MEET_TONE[m.status]}>{MEETING_WORD[m.status]}</Pill>
      </header>
      <div className="h-meet__when"><Icon name="cal" size={14} />
        <span className={cx("h-meet__time", gone && "is-gone")}>{gone ? m.was : m.when}</span>
        {m.status === "rescheduled" && <span className="h-meet__was">was <s>{m.was}</s></span>}
      </div>
      <p className="h-meet__meta">{m.title} · {m.where} · host {m.host}</p>
      {!compact && <ul className="h-meet__guests" aria-label="Guests">
        {m.guests.map((g) => <li key={g.email}>{g.avatar ? <Avatar id={g.avatar} size={20} /> : <Monogram name={g.name} email={g.email} size={20} />}
          <span className="c-strong">{g.name}</span><span className="c-faint">{g.role}{g.note ? ` · ${g.note}` : ""}</span></li>)}
      </ul>}
      {m.reason && <blockquote className="h-meet__reason">“{m.reason}”<span className="c-faint"> · {m.by}, in Cal.com</span></blockquote>}
      {m.marked && <p className="h-meet__note"><Icon name="alert" size={12} />{m.marked}</p>}
      {!compact && <Receipts>{h.receipts.map(([a, b]) => <Receipt key={a} meta={b}>{a}</Receipt>)}</Receipts>}
    </section>
  );
}

/** The three handoffs as steps: the meeting (Cal.com), the deal (Phoenix ERP), the follow-up (AutoSend). */
export function HandoffSteps({ h }: { h: HandoffModel }) {
  const m = h.meeting; const d = h.deal; const n = h.nurture;
  const rows: [string, string, string, string, ReactNode][] = [
    ["Ca", "Cal.com", MEETING_WORD[m.status], MEET_TONE[m.status], m.status === "cancelled" || m.status === "no-show" ? `Was ${m.was}` : m.when.replace(" EAT", "")],
    ["Px", "Phoenix ERP", DEAL_WORD[d.state], DEAL_TONE[d.state], d.id ? <><span className="c-mono">{d.id}</span> · {d.stage}</> : d.state === "duplicate" ? "Nyota is already in Phoenix" : "Not in Phoenix yet"],
    ["As", "AutoSend", NURTURE_WORD[n.state], NURTURE_TONE[n.state], <>{n.journey}{n.when && (n.state === "scheduled" || n.state === "moved" || n.state === "waiting") ? ` · ${n.when}` : ""}</>],
  ];
  return (
    <ol className="h-steps" aria-label="Handoffs">
      {rows.map(([tile, name, word, tone, line]) => (
        <li key={name}><Tile label={tile} small /><span className="h-steps__txt"><span className="h-steps__top"><span className="c-strong">{name}</span><Pill tone={tone}>{word}</Pill></span><span className="h-steps__line">{line}</span></span></li>
      ))}
    </ol>
  );
}

/** Rail section in the Unibox. */
export function HandoffRail({ h }: { h: HandoffModel }) {
  return (
    <div className="c-rail__sec h-rail"><span className="c-rail__label">Handoffs</span>
      <HandoffSteps h={h} />
      <p className="h-rail__foot c-faint">{h.deal.note}</p>
      <a className="c-link h-rail__link" href="/app?view=settings">Integrations</a>
    </div>
  );
}

/** What needs a person: Phoenix refused the deal, Phoenix already has the company, AutoSend isn’t there. */
export function HandoffProblems({ h, lead }: { h: HandoffModel; lead?: boolean }) {
  const toast = useToast();
  const [choice, setChoice] = useState("add");
  const [done, setDone] = useState<string | null>(null);
  const d = h.deal;
  if (done) return <p className="h-done" role="status"><Icon name="check" size={12} />{done}</p>;
  if (d.state === "failed" && d.error) return (
    <div className="h-problem is-negative" role="alert"><Icon name="alert" size={13} />
      <div><b>Not in Phoenix yet: {d.error.code} {d.error.text}.</b> {d.error.why} <span className="c-faint">({d.error.tries})</span></div>
      <div className="h-problem__acts"><a className="c-btn c-btn--primary" href="/app?view=settings&state=error">Update the secret</a>
        <Button variant="quiet" onClick={() => toast({ tone: "error", children: "Phoenix still says 401. Update the secret first.", meta: "nothing was sent twice" })}>Try again now</Button></div>
    </div>
  );
  if (d.state === "duplicate" && d.dup) {
    const x = d.dup;
    return (
      <div className="h-problem is-caution h-dup" role="group" aria-label="Phoenix already has this company"><Icon name="users" size={13} />
        <div><b>Phoenix already has {x.account} <span className="c-mono">({x.accountId})</span>.</b> It has an open deal, <span className="c-mono">{x.deal}</span> “{x.dealName}”, owned by {x.owner}, at {x.stage}, last touched {x.touched}. Corral won’t choose for you.</div>
        <div className="h-dup__pick"><RadioGroup label="What to do in Phoenix" value={choice} onChange={setChoice} options={[
          { value: "add", label: `Add this meeting to ${x.deal}`, description: `Same website (nyota.co.tz) and still open. ${x.owner} gets a note.` },
          { value: "new", label: `Open a new deal under ${x.accountId}`, description: "Two deals for Nyota, both open. Pick this if they’re separate projects." },
          { value: "skip", label: "Don’t send it to Phoenix", description: "The meeting and the thread carry on; Phoenix never hears about it." }]} /></div>
        <div className="h-problem__acts"><Button variant="primary" onClick={() => setDone(choice === "add" ? `Added to ${x.deal}. ${x.owner} was told in Phoenix.` : choice === "new" ? `Opened a new deal under ${x.accountId}.` : "Not sent to Phoenix. You can send it later from the lead.")}>
          {choice === "skip" ? "Keep it out of Phoenix" : "Send to Phoenix"}</Button></div>
      </div>
    );
  }
  if (h.nurture.state === "waiting") return (
    <div className="h-problem is-caution" role="status"><Icon name="mail" size={13} />
      <div><b>{h.nurture.journey} can’t go: AutoSend isn’t connected.</b> {lead ? "It was due" : "It’s due"} {h.nurture.when}. Corral won’t send it from your cold mailboxes, where a reminder with an unsubscribe link would hurt their reputation.</div>
      <div className="h-problem__acts"><a className="c-btn" href="/app?view=settings&state=connect-autosend">Connect AutoSend</a></div>
    </div>
  );
  return null;
}

/** On the lead detail: the meeting, the three handoffs, and anything that needs you. */
export function HandoffSection({ h }: { h: HandoffModel }) {
  return (
    <section className="l-sec h-lead" aria-label="Meeting and handoffs"><h3>Meeting and handoffs</h3>
      <MeetingCard h={h} compact />
      <HandoffProblems h={h} lead />
      <HandoffSteps h={h} />
      <p className="h-lead__note c-faint">{h.deal.note} {h.nurture.note}</p>
    </section>
  );
}
