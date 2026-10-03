"use client";
import type { ReactNode } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { Banner } from "../States";
import { Select } from "../Form";
import {
  CONDITION_HINT, CONDITION_SHORT, EXITS, gateText, pct, stepDays, subjectOf, summaryOf, tokensIn, varDef,
  type Condition, type Gate, type Issue, type Step,
} from "@/lib/sequences/sequence";
import type { SeqStatus, Sequence } from "./data";
import { StatusTag } from "../StatusTag";
import type { StatusKind } from "@/lib/status/tags";
import { ArrowsClockwise, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";

const f = (n: number) => n.toLocaleString("en-US");

/* ---------------------------------------------------------------- status (M13: the shared StatusTag, lib/status/tags.ts) */
export function seqStatusKind(status: SeqStatus, queue?: Sequence["queue"]): StatusKind {
  switch (status) {
    case "launching": return "checking";
    case "queued": return queue?.reason === "mailbox" ? "waiting-mailbox" : "queued";
    case "running": return "live";
    default: return status;
  }
}
export function SeqTag({ status, queue }: { status: SeqStatus; queue?: Sequence["queue"] }) {
  return <StatusTag kind={seqStatusKind(status, queue)} />;
}

/** Subject or body with its variables shown as tokens. */
export function TokenText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let i = 0;
  tokensIn(text).forEach((tk, n) => {
    if (tk.at > i) out.push(text.slice(i, tk.at));
    out.push(<span key={n} className={cx("q-tok", !varDef(tk.key) && "is-bad")}>{tk.key}{tk.fallback && <span className="q-tok__fb"> | {tk.fallback}</span>}</span>);
    i = tk.at + tk.raw.length;
  });
  if (i < text.length) out.push(text.slice(i));
  return <>{out}</>;
}

/* ---------------------------------------------------------------- list */
export function SeqList({ list, open, onOpen, onNew }: { list: Sequence[]; open: string | null; onOpen: (id: string) => void; onNew: () => void }) {
  return (
    <nav className="d-runs q-list" aria-label="Sequences">
      <div className="d-runs__head"><span>Sequences</span><span className="c-faint">{list.length}</span></div>
      <ul>
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" className={cx("d-runrow", open === s.id && "is-on")} aria-current={open === s.id ? "true" : undefined} onClick={() => onOpen(s.id)}>
              <span className="d-runrow__name">{s.name}</span>
              <span className="d-runrow__line">{summaryOf(s.steps)} · {s.run ? `${f(s.run.enrolled)} enrolled, ${pct(s.run.replied, s.run.enrolled)} replied` : s.audience.count ? `${f(s.audience.count)} companies` : "No audience yet"}</span>
              <span className="d-runrow__meta"><SeqTag status={s.status} queue={s.queue} />{s.updated} · {s.by.split(" ")[0]}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="d-runs__new" onClick={onNew}><Icon name="plus" size={12} />New sequence</button>
    </nav>
  );
}

/* ---------------------------------------------------------------- the waits and conditions between steps */
const WAITS = [1, 2, 3, 4, 5, 7, 10, 14];
export function GateRow({ gate, editable, onChange, openCondition, n }: {
  gate: Gate; editable: boolean; onChange?: (g: Gate) => void; openCondition?: boolean; n: number;
}) {
  if (!editable) return <div className="q-gate"><span className="q-gate__ic"><Icon name="clock" size={12} /></span><span>{gateText(gate)}</span></div>;
  return (
    <div className="q-gate q-gate--edit" role="group" aria-label={`Before step ${n}`}>
      <span className="q-gate__ic"><Icon name="clock" size={12} /></span>
      <span className="q-gate__w">Wait</span>
      <Select label={`Wait before step ${n}`} width={104} value={String(gate.wait)} onChange={(v) => onChange?.({ ...gate, wait: Number(v) })}
        options={WAITS.map((d) => ({ value: String(d), label: `${d} ${d === 1 ? "day" : "days"}` }))} />
      <span className="q-gate__w">then send</span>
      <Select label={`Send step ${n}`} width={176} menuWidth={288} defaultOpen={openCondition} value={gate.cond} onChange={(v) => onChange?.({ ...gate, cond: v as Condition, otherwise: v === "no-reply" ? undefined : gate.otherwise ?? "stop" })}
        options={(Object.keys(CONDITION_SHORT) as Condition[]).map((c) => ({ value: c, label: CONDITION_SHORT[c], meta: c === "no-reply" ? "default" : undefined, hint: CONDITION_HINT[c] }))} />
      {gate.cond !== "no-reply" && <>
        <span className="q-gate__w">otherwise</span>
        <Select label={`Everyone else at step ${n}`} width={148} value={gate.otherwise ?? "stop"} onChange={(v) => onChange?.({ ...gate, otherwise: v as Gate["otherwise"] })}
          options={[{ value: "stop", label: "Stop" }, { value: "skip", label: "Skip this step" }]} />
      </>}
      {CONDITION_HINT[gate.cond] && <p className="q-gate__note">{CONDITION_HINT[gate.cond]}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- steps */
function firstLine(body: string) { return body.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" "); }

export function StepList({ seq, active, issues, onOpen, onGate, onAdd, openCondition }: {
  seq: Sequence; active?: number; issues: Issue[]; onOpen: (i: number) => void; onGate?: (i: number, g: Gate) => void; onAdd?: () => void; openCondition?: number;
}) {
  const days = stepDays(seq.steps);
  const editable = seq.status === "draft";
  return (
    <section className="q-steps" aria-label="Steps">
      <ol className="q-steps__list">
        {seq.steps.map((s, i) => {
          const mine = issues.filter((x) => x.step === i + 1);
          return (
            <li key={s.id} className="q-steps__item">
              {s.gate && <GateRow n={i + 1} gate={s.gate} editable={editable} onChange={(g) => onGate?.(i, g)} openCondition={openCondition === i} />}
              <StepCard step={s} steps={seq.steps} i={i} day={days[i]} on={active === i} issues={mine.length} onOpen={() => onOpen(i)} />
            </li>
          );
        })}
      </ol>
      {editable && onAdd && <button type="button" className="q-add" onClick={onAdd}><Icon name="plus" size={12} />Add a step</button>}
      <div className="q-exits">
        <p className="q-exits__h">At any step</p>
        <ul>{EXITS.map((e) => <li key={e.on}><b>{e.on}</b> {e.then}</li>)}</ul>
      </div>
    </section>
  );
}

function StepCard({ step: s, steps, i, day, on, issues, onOpen }: { step: Step; steps: Step[]; i: number; day: number; on: boolean; issues: number; onOpen: () => void }) {
  const st = s.stats;
  return (
    <button type="button" className={cx("q-step", on && "is-on", issues > 0 && "has-issue")} aria-current={on ? "step" : undefined} onClick={onOpen}>
      <span className="q-step__top"><span className="q-step__n">Step {i + 1}</span><span className="c-faint">Day {day} · {s.thread === "new" || i === 0 ? "New thread" : "Reply in thread"}</span>
        {issues > 0 && <span className="q-step__issue"><Icon name="alert" size={11} />{issues} to fix</span>}</span>
      <span className="q-step__subj"><TokenText text={subjectOf(steps, i) || "No subject"} /></span>
      <span className="q-step__body"><TokenText text={firstLine(s.body) || "Empty"} /></span>
      {st && st.sent > 0 && <span className="q-step__stats c-num"><span>Sent {f(st.sent)}</span><span>Opened {pct(st.opened, st.sent)}</span><span>Replied {pct(st.replied, st.sent)}</span>
        {st.due ? <span className="q-step__due">{st.due} due next</span> : null}</span>}
      {st && st.sent === 0 && <span className="q-step__stats c-faint">Nothing sent yet</span>}
    </button>
  );
}

/* ---------------------------------------------------------------- header, run numbers, banners */
export function SeqHeader({ seq, actions }: { seq: Sequence; actions: ReactNode }) {
  return (
    <div className="d-run__head">
      <div className="d-run__titles">
        <h2>{seq.name}</h2>
        <p className="d-run__meta"><SeqTag status={seq.status} queue={seq.queue} /><span>{summaryOf(seq.steps)}</span><span aria-hidden="true">·</span>
          <span>{seq.audience.count ? `${f(seq.audience.count)} companies in ${seq.audience.label}` : "No audience yet"}</span><span aria-hidden="true">·</span><span>{seq.window}</span></p>
      </div>
      <div className="d-acts">{actions}</div>
    </div>
  );
}

export function RunNumbers({ seq }: { seq: Sequence }) {
  const r = seq.run; if (!r) return null;
  const cells: [string, string, string?][] = [
    ["Enrolled", f(r.enrolled)], ["Still in it", f(r.active)], ["Replied", f(r.replied), pct(r.replied, r.enrolled)],
    ["Meetings", f(r.meetings)], ["Bounced", f(r.bounced), pct(r.bounced, r.enrolled)], ["Unsubscribed", f(r.unsubscribed)],
  ];
  return (
    <div className="q-nums">
      <dl className="q-nums__list">{cells.map(([k, v, p]) => <div key={k}><dt>{k}</dt><dd className="c-num">{v}{p && <span className="c-faint"> {p}</span>}</dd></div>)}</dl>
      {r.next && seq.status === "running" && <p className="q-next"><Icon name="clock" size={12} />Next: {r.next}</p>}
    </div>
  );
}

/** Resume lives in the header, where Pause was. */
export function PausedBanner({ seq }: { seq: Sequence }) {
  const p = seq.paused; if (!p) return null;
  return (
    <Banner tone="caution" icon="clock" title={`Paused by ${p.by} · ${p.at}`}>
      {p.note && <>“{p.note}” </>}{p.held} emails that came due wait here; nothing sends until you resume, and then they go out over the next morning, not all at once. Replies still arrive in the Unibox.
    </Banner>
  );
}

export function IssuesBanner({ issues, onFix }: { issues: Issue[]; onFix: (step: number) => void }) {
  if (!issues.length) return null;
  return (
    <div className="c-banner c-banner--error q-issues" role="alert">
      <Icon name="alert" />
      <div className="c-banner__txt">
        <b>Can&rsquo;t launch yet: {issues.length === 1 ? "1 thing" : `${issues.length} things`} to fix</b>
        <ul className="q-issues__list">{issues.map((x, i) => (
          <li key={i}><span><span className="c-strong">{x.title}.</span> {x.fix}</span><Button size="sm" variant="quiet" onClick={() => onFix(x.step)}>Fix in step {x.step}</Button></li>
        ))}</ul>
      </div>
    </div>
  );
}

const LAUNCH_STAGES = ["Re-checking 9 emails older than 90 days", "Filling every variable for 82 companies", "Scheduling across the pool, 2–7 minutes apart"];
/** Cancel launch lives in the header, where Launch was. */
export function Launching({ seq }: { seq: Sequence }) {
  const at = seq.launch?.stage ?? 0;
  return (
    <section className="q-launching" aria-label="Launching">
      <div role="status" className="q-launching__top"><span className="d-live" aria-hidden="true" /><span className="c-strong">Launching to 82 companies</span><span className="c-faint">Nothing has been sent yet.</span></div>
      <ol className="q-launching__list">{LAUNCH_STAGES.map((s, i) => (
        <li key={s} className={cx(i < at && "is-done", i === at && "is-now")}>
          <span className="q-launching__ic" aria-hidden="true">{i < at ? <Icon name="check" size={12} /> : i === at ? <span className="d-live" /> : <span className="d-stage__wait" />}</span>
          <span>{s}</span><span className="c-faint">{i < at ? (i === 0 ? "9 of 9 still good" : "Done") : i === at ? "46 of 82" : "Waiting"}</span>
        </li>))}
      </ol>
      <p className="c-faint q-launching__note">The first emails go out Thursday from 08:10 their time. You can close this page.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- M13 (gap 5): after the checks, never an endless "launching" */
export const LAUNCH_COPY = {
  mailbox: "Connect a mailbox to start sending.", connect: "Connect mailbox",
  window: (first?: string) => `First emails go out ${first ?? "in the next send window"}.`,
  sending: (sent: number, total: number) => `${f(sent)} of ${f(total)} first emails sent.`,
  failed: "Sending stopped.", retry: "Try again", nothing: "Nothing has been sent.",
} as const;
const TRACK: { id: "queued" | "sending" | "live"; label: string }[] = [{ id: "queued", label: "Queued" }, { id: "sending", label: "Sending" }, { id: "live", label: "Live" }];

/** Queued (waiting for a mailbox or the window) → Sending → Live, or Failed. One tag, one line, one action, and where it is on the way. */
export function LaunchState({ seq, onConnect, onRetry }: { seq: Sequence; onConnect?: () => void; onRetry?: () => void }) {
  const st = seq.status;
  if (st !== "queued" && st !== "sending" && st !== "failed") return null;
  const at = st === "queued" ? 0 : 1;
  const waitingMailbox = st === "queued" && seq.queue?.reason === "mailbox";
  const line = waitingMailbox ? LAUNCH_COPY.mailbox
    : st === "queued" ? LAUNCH_COPY.window(seq.queue?.first)
    : st === "sending" ? LAUNCH_COPY.sending(seq.sending?.sent ?? 0, seq.sending?.total ?? seq.audience.count)
    : seq.failure?.line ?? LAUNCH_COPY.failed;
  const action = waitingMailbox && onConnect ? <Button variant="primary" onClick={onConnect}><EnvelopeSimple size={14} />{LAUNCH_COPY.connect}</Button>
    : st === "failed" && onRetry ? <Button variant="primary" onClick={onRetry}><ArrowsClockwise size={14} />{LAUNCH_COPY.retry}</Button> : null;
  return (
    <section className={cx("q-launch", `is-${st}`, waitingMailbox && "is-mailbox")} aria-label="Launch status">
      <div className="q-launch__top" role="status">
        <span className="u-sr">{seqStatusKind(st, seq.queue) === "waiting-mailbox" ? "Waiting for mailbox" : st}: </span>
        <span className="q-launch__line">{line}</span>
        {action && <span className="q-launch__act">{action}</span>}
      </div>
      <ol className="q-track" aria-label="Launch progress">{TRACK.map((x, i) => (
        <li key={x.id} className={cx(i < at && "is-done", i === at && (st === "failed" ? "is-bad" : "is-now"))} aria-current={i === at ? "step" : undefined}>
          <span className="q-track__dot" aria-hidden="true" />{x.label}</li>))}</ol>
      {st === "sending" && seq.sending && <span className="q-launch__meter" aria-hidden="true"><span style={{ width: `${Math.round((seq.sending.sent / Math.max(1, seq.sending.total)) * 100)}%` }} /></span>}
      {st === "failed" && seq.failure?.detail && <span className="c-mono q-launch__detail">{seq.failure.detail}</span>}
    </section>
  );
}
