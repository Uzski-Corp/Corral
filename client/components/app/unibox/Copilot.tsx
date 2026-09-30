"use client";
/* Corral's draft in the reading pane (M7, ENG-57): every draft and send state, built on <ReplyCard>. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Thread } from "../data";
import { ReplyCard } from "../ReplyCard";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { DropdownMenu } from "../Overlays";
import { Skeleton, Spinner } from "../States";
import { UNDO_SECONDS, changedSentences, checksOf, marks, stripMarks, type Check, type DraftKind, type SendKind } from "@/lib/unibox/draft";
import { DISCONNECTED, LEAD_FOLLOWUP, SEND_ERROR, TEAMMATE_REPLY, type CopilotModel, type DraftModel } from "./data";
import { TeammateMessage } from "./Thread";

export type DraftActions = {
  onDraft: () => void; onStop: () => void; onSend: () => void; onEdit: () => void; onBack: () => void; onText: (s: string) => void;
  onUndo: () => void; onRetry: () => void; onReconnect: () => void; onKeepDraft: () => void;
  onDiscard: () => void; onSendAnyway: () => void; onKeepNote: () => void;
  /** M9 `conflict-lead`: Corral drafts again against both emails. */
  onRedraftBoth: () => void;
  onWriteOwn: () => void; onDraftSafe: () => void; onRedraft: (how: string) => void; onUnhandle: () => void; onTriage: () => void;
};
export type DraftProps = {
  t: Thread; model?: DraftModel; copilot?: CopilotModel; kind: DraftKind; send: SendKind; text: string; original: string;
  undoLeft: number; from: string; tried?: boolean; handledNote?: string; a: DraftActions;
};

/** The text a draft sends: its paragraphs without cite markers. */
export const draftText = (m?: DraftModel) => (m ? stripMarks(m.paras.join("\n\n")) : "");

const Keys = () => <span className="c-mono u-foot__keys">E archive · H snooze</span>;

/** Paragraphs with numbered cite markers; the low-confidence sentence marked. */
function Body({ m, gap, pre }: { m: DraftModel; gap?: string; pre: string }) {
  return (
    <div className="c-reply__body">
      {m.paras.map((p, i) => (
        <p key={i}>{marks(p).map((x, j) => typeof x === "number"
          ? <sup key={j} className="u-cite"><a href={`#${pre}-${x}`} aria-label={`Source ${x}`}>{x}</a></sup>
          : gap && x.includes(gap) ? <span key={j}>{x.split(gap)[0]}<mark className="u-gap">{gap}</mark>{x.split(gap)[1]}</span> : <span key={j}>{x}</span>)}</p>
      ))}
    </div>
  );
}

/** Every claim and the knowledge-base line it came from; what was left out. */
function Sources({ m, pre, open: o = true }: { m: DraftModel; pre: string; open?: boolean }) {
  const [open, setOpen] = useState(o);
  const id = useId();
  return (
    <div className="u-sources">
      <button type="button" className="u-sources__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)}>
        <Icon name="book" size={12} />{m.cites.length ? `${m.cites.length} ${m.cites.length === 1 ? "claim" : "claims"}, each from a knowledge-base line` : "No claims from the knowledge base"}
        <span className="u-sources__chev"><Icon name="down" size={12} /></span></button>
      {open && <div id={id} className="u-sources__body">
        {m.cites.length > 0 && <ol className="u-sources__list">{m.cites.map((c) => (
          <li key={c.n} id={`${pre}-${c.n}`}><span className="u-sources__n">{c.n}</span><span className="u-sources__txt"><span className="u-sources__sec">{c.section}</span>“{c.text}”<span className="c-mono u-sources__src">{c.source}</span></span></li>))}</ol>}
        {m.left?.map((l) => <p key={l} className="u-sources__left"><Icon name="alert" size={12} /><span>Left out. {l}</span></p>)}
        <p className="u-sources__checked"><Icon name="check" size={12} />Checked against Never say</p>
      </div>}
    </div>
  );
}

function ChecksList({ checks, tried }: { checks: Check[]; tried?: boolean }) {
  if (!checks.length) return <p className="u-checks__ok"><Icon name="check" size={12} />Checked against Never say and your prices</p>;
  return (
    <ul className="u-checks" aria-label="Before this sends">
      {checks.map((c) => <li key={c.text} className={cx(c.blocks ? "is-block" : "is-warn", tried && c.blocks && "is-tried")}><Icon name="alert" size={12} /><span>{c.text}{c.blocks && " Change it to send."}</span></li>)}
    </ul>
  );
}

function ReadyFoot({ a, sendLabel = "Send reply" }: { a: DraftActions; sendLabel?: string }) {
  return (
    <div className="c-reply__foot">
      <Button variant="primary" kbd="⌘↵" onClick={a.onSend}>{sendLabel}</Button><Button kbd="R" onClick={a.onEdit}>Edit</Button>
      <DropdownMenu side="top" width={200} label="Redraft" items={[{ heading: "Redraft it" }, ...["Shorter", "Warmer", "More direct"].map((l) => ({ label: l, onSelect: () => a.onRedraft(l) }))]}
        trigger={(tp) => <button type="button" className="c-btn c-btn--quiet" {...tp}><Icon name="refresh" />Redraft<Icon name="down" size={12} /></button>} />
      <span style={{ flex: 1 }} /><Keys />
    </div>
  );
}

/** The whole draft area for a thread: pick by send state first, then draft kind. */
export function DraftArea(p: DraftProps) {
  const { t, model, copilot, kind, send, text, original, undoLeft, from, tried, handledNote, a } = p;
  const first = t.name.split(" ")[0];
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = `cite${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  useEffect(() => { if (kind === "edited" && send === "idle") ta.current?.focus({ preventScroll: true }); }, [kind, send]);

  if (t.handled) return (
    <div className="u-handled" role="status">
      <span className="u-handled__ic"><Icon name="check" size={13} /></span>
      <div className="u-handled__txt"><b>Corral handled this</b><span>{handledNote}</span></div>
      <div className="u-handled__act"><Button onClick={a.onUnhandle}>It needs me</Button><Button variant="quiet" kbd="T" onClick={a.onTriage}>Change triage</Button></div>
    </div>
  );

  const paras = text.split(/\n{2,}/).filter(Boolean);
  const plain = <div className="c-reply__body">{paras.map((x, i) => <p key={i}>{x}</p>)}</div>;

  if (send === "undo" || send === "sending") return (
    <div className="u-sendbar" role="status" aria-live="polite">
      {send === "undo" ? <>
        <span className="u-sendbar__ring" aria-hidden="true" style={{ ["--u-left" as string]: undoLeft / UNDO_SECONDS }}><span className="c-num">{undoLeft}</span></span>
        <div className="u-sendbar__txt"><b>Sending to {first} in {undoLeft}s</b><span>from <span className="c-mono">{from}</span> · you can still take it back</span></div>
        <Button variant="primary" kbd="⌘Z" onClick={a.onUndo}>Undo</Button>
      </> : <>
        <Spinner size={16} />
        <div className="u-sendbar__txt"><b>Sending</b><span>from <span className="c-mono">{from}</span>, in this thread</span></div>
      </>}
    </div>
  );

  if (send === "failed") return (
    <ReplyCard tone="negative" title="Not sent" from={from} label="Your reply, not sent" foot={<div className="c-reply__foot"><Button variant="primary" onClick={a.onRetry}><Icon name="refresh" />Try again</Button><Button onClick={a.onEdit}>Edit</Button><span style={{ flex: 1 }} /><Keys /></div>}>
      <div className="u-sendnote is-top is-bad" role="alert"><Icon name="alert" size={13} /><div><b>Google didn’t take it at {SEND_ERROR.at}.</b> Your reply is kept here, word for word. Corral tries once more on its own in 5 minutes, or try now.
        <code className="u-code">{SEND_ERROR.code} {SEND_ERROR.text}</code></div></div>
        {plain}
      </ReplyCard>
  );

  if (send === "disconnected") return (
    <ReplyCard tone="negative" title="Can’t send yet" from={DISCONNECTED.mailbox} label="Your reply, waiting for its mailbox" foot={<div className="c-reply__foot"><Button variant="primary" onClick={a.onReconnect}>Reconnect {DISCONNECTED.mailbox.split("@")[0]}@</Button><Button onClick={a.onKeepDraft}>Keep as draft</Button><span style={{ flex: 1 }} /><Keys /></div>}>
      <div className="u-sendnote is-top is-bad" role="alert"><Icon name="alert" size={13} /><div><b>{DISCONNECTED.mailbox} is disconnected</b> ({DISCONNECTED.why} at {DISCONNECTED.since}). {first}’s thread is in that mailbox, and replies go from the mailbox the thread is in so {first} sees one conversation, not a stranger. Your reply is kept.</div></div>
        {plain}
      </ReplyCard>
  );

  if (send === "conflict") return (
    <>
      <TeammateMessage {...TEAMMATE_REPLY} />
      <ReplyCard tone="caution" title="On hold: Amara already replied" from={from} label="Your reply, on hold" foot={<div className="c-reply__foot"><Button variant="primary" onClick={a.onDiscard}>Discard mine</Button><Button onClick={a.onKeepNote}>Keep as a note for Amara</Button><Button variant="quiet" onClick={a.onSendAnyway}>Send mine too</Button></div>}>
        <div className="u-sendnote is-top is-warn" role="status"><Icon name="users" size={13} /><div><b>{TEAMMATE_REPLY.who} replied to {first} at {TEAMMATE_REPLY.at}</b>, while you were writing. Your reply is on hold so {first} doesn’t get two answers.</div></div>
        {plain}
      </ReplyCard>
    </>
  );

  if (send === "conflict-lead") {
    return (
      <ReplyCard tone="caution" title={`On hold: ${first} wrote again`} from={from} label="Your reply, on hold" foot={<div className="c-reply__foot"><Button variant="primary" onClick={a.onRedraftBoth}><Icon name="refresh" />Redraft</Button><Button onClick={a.onEdit}>Edit mine</Button><Button variant="quiet" onClick={a.onSendAnyway}>Send mine anyway</Button></div>}>
        <div className="u-sendnote is-top is-warn" role="status"><Icon name="mail" size={13} /><div><b>{first} wrote again at {LEAD_FOLLOWUP.at}</b>, while you were writing. Your reply is on hold so it answers what {LEAD_FOLLOWUP.pronoun} said. Redraft answers both emails; nothing was sent.</div></div>
        {plain}
      </ReplyCard>
    );
  }

  if (kind === "drafting") return (
    <ReplyCard title={<span className="u-live"><span className="u-live__dot" aria-hidden="true" />Corral is drafting</span>} from={from} busy label="Corral is drafting a reply"
      foot={<div className="c-reply__foot"><Button onClick={a.onStop}>Stop</Button><span style={{ flex: 1 }} /><span className="c-mono u-foot__keys">Usually 3–5 seconds</span></div>}>
      <div className="c-reply__body">
        <ol className="u-steps">
          <li className="is-done"><Icon name="check" size={12} />Read the thread: {(t.history?.length ?? 0) + 1} messages</li>
          <li className="is-live"><Spinner size={12} />Checking the knowledge base for ColdTrace Sensors</li>
          <li><span className="u-steps__wait" aria-hidden="true" />Writing, then checking against Never say</li>
        </ol>
        <div className="u-skel" aria-hidden="true"><Skeleton w="92%" /><Skeleton w="98%" /><Skeleton w="64%" /><Skeleton w="86%" style={{ marginTop: 8 }} /><Skeleton w="40%" /></div>
      </div>
    </ReplyCard>
  );

  if (kind === "refused") return (
    <ReplyCard tone="caution" title="Corral won’t draft this one" from={from} label="No draft: Never-say rules"
      foot={<div className="c-reply__foot"><Button variant="primary" onClick={a.onDraftSafe}><Icon name="bolt" />Draft without those claims</Button><Button kbd="R" onClick={a.onWriteOwn}>Write it myself</Button><span style={{ flex: 1 }} /><a className="c-link u-foot__link" href="/app?view=knowledge">Never say</a></div>}>
      <div className="c-reply__body">
        <p>{first}’s email asks for {copilot?.refused?.asks.length === 1 ? "something" : "two things"} on your Never-say list. Corral won’t write {copilot?.refused?.asks.length === 1 ? "it" : "them"}, even in a draft:</p>
        <ul className="u-refused">{copilot?.refused?.asks.map((x) => <li key={x.quote}><q>{x.quote}</q><span><Icon name="x" size={11} />{x.rule}</span></li>)}</ul>
        <p className="c-muted">Write the reply yourself, or let Corral draft one that answers what it can and says plainly what it can’t.</p>
      </div>
    </ReplyCard>
  );

  if (kind === "edited") {
    const checks = checksOf(text);
    const n = changedSentences(original, text);
    return (
      <ReplyCard focus title="Your reply" from={from} label="Your reply" meta={<span className="u-badge">{original ? `Edited by you · ${n} ${n === 1 ? "sentence" : "sentences"} changed` : "Written by you"}</span>} foot={<div className="c-reply__foot"><Button variant="primary" kbd="⌘↵" onClick={a.onSend}>Send reply</Button>{original && <Button variant="quiet" onClick={a.onBack}>Back to Corral’s draft</Button>}<span style={{ flex: 1 }} /><Keys /></div>}>
        <div className="c-reply__body"><textarea ref={ta} aria-label={`Reply to ${first}`} value={text} rows={Math.max(5, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 60)), 1))} onChange={(e) => a.onText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); a.onSend(); } }} /></div>
        <div className="u-editnote"><ChecksList checks={checks} tried={tried} />
          {original && <p className="u-editnote__txt">Cites stay with Corral’s draft; your own sentences aren’t checked against the knowledge base, only against Never say and your prices.</p>}</div>
      </ReplyCard>
    );
  }

  if ((kind === "ready" || kind === "low") && model) {
    const low = kind === "low";
    const title: ReactNode = model.to ? `Intro to ${model.to.split("@")[0].replace(/^./, (c) => c.toUpperCase())}` : "Draft reply";
    return (
      <ReplyCard tone={low ? "caution" : undefined} title={title} from={model.to ? `${from} · to ${model.to}` : from} label="Corral’s draft"
        meta={low ? <span className="u-badge is-warn">Low confidence</span> : <span className="u-badge">Corral</span>} foot={<ReadyFoot a={a} sendLabel={model.to ? "Send intro" : "Send reply"} />}>
        <Body m={model} pre={pre} gap={low ? model.gap?.sentence : undefined} />
        {low && model.gap && <div className="u-sendnote is-warn"><Icon name="alert" size={13} /><div><b>The knowledge base doesn’t answer one question, so the draft says you’ll find out.</b> {model.gap.why}
          <span className="u-sendnote__act"><a className="c-link" href="/app?view=knowledge">Add it to the knowledge base</a></span></div></div>}
        <Sources m={model} pre={pre} />
      </ReplyCard>
    );
  }

  return (
    <div className="u-nodraft">
      <span>No draft for {first} yet.</span>
      <Button variant="primary" kbd="R" onClick={a.onDraft}><Icon name="bolt" />Draft with Corral</Button><Button onClick={a.onWriteOwn}>Write it myself</Button>
    </div>
  );
}
