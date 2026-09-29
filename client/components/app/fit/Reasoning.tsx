"use client";
/* "Why it scored 94": the fit score explained as evidence (M5, ENG-55). Each check is a claim, what
   Corral found, the source it read (M4 provenance) and the knowledge-base line it measured against.
   No charts: points are shown as "25 of 25", in the margin. */
import { useId, useState, type ReactNode } from "react";
import { Button, cx } from "../primitives";
import { Icon, type IconName } from "../icons";
import { Banner } from "../States";
import { FormField, Textarea, TextInput } from "../Form";
import { ageDays, formatAge, SOURCE, type ProvField } from "@/lib/discovery/provenance";
import {
  VERDICT_WORD, ceilingOf, changeOf, confidence, overrideIssue, shownValue, summaryLine,
  type FitCheck, type FitEvidence, type FitScore, type FitStatus, type Verdict,
} from "@/lib/fit/score";
import { KILIMA_FIT, FIT_PRODUCT } from "./data";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MON[m - 1]} ${d}`; };

const VICON: Record<Verdict, IconName> = { met: "check", partly: "check", missed: "x", unknown: "help" };

export type FitActions = {
  onRescore?: () => void;
  onOverride?: (value: number, note: string) => void;
  onClearOverride?: () => void;
  onDisagree?: (note: string) => void;
  /** Open this field's row in "Where this data came from" (M4). */
  onOpenField?: (f: ProvField) => void;
  onAddField?: (f: ProvField) => void;
};

export function FitReasoning({ status, company, domain, today, initialForm, busy, ...a }: {
  status: FitStatus; company: string; domain: string; today: Date; initialForm?: "override" | "disagree"; busy?: boolean;
} & FitActions) {
  const hid = useId();
  const [form, setForm] = useState<"override" | "disagree" | null>(initialForm ?? null);
  const s = status.kind === "scored" ? status.score : null;
  const title = status.kind === "scoring" ? (status.last ? "Rescoring" : "Scoring")
    : status.kind === "none" ? "Not scored yet"
    : status.kind === "error" ? (status.last ? `Last score: ${shownValue(status.last)}` : "Not scored yet")
    : s!.override ? `Why Corral scored ${s!.value}` : `Why it scored ${s!.value}`;
  return (
    <section className="l-sec f-why" aria-labelledby={hid}>
      <div className="f-why__hd">
        <h3 id={hid}>{title}</h3>
        {a.onRescore && (status.kind === "scored" || status.kind === "error") && (
          <Button onClick={a.onRescore} disabled={busy}><Icon name="refresh" />{busy ? "Rescoring…" : status.kind === "error" ? "Try again" : "Rescore"}</Button>)}
      </div>

      {status.kind === "scoring" && <Scoring st={status} domain={domain} />}
      {status.kind === "none" && <NoneYet st={status} company={company} onRescore={a.onRescore} onSet={a.onOverride && (() => setForm("override"))} />}
      {status.kind === "error" && <>
        <Banner tone="error" title={`Couldn't score ${company}`}>
          The scoring model didn&rsquo;t answer{status.tries > 1 ? `, ${status.tries === 2 ? "twice" : `${status.tries} times`}` : ""}. Nothing changed: {status.last
            ? <>the last score, <b>{shownValue(status.last)}</b> from {fmtDay(status.last.at)}, still stands.</> : <>there&rsquo;s no score yet, so {company} stays out of fit filters.</>}
        </Banner>
        <p className="f-why__code c-mono c-faint">{status.code} · {status.at}</p>
        {status.last && <Checks s={status.last} today={today} {...a} dim />}
      </>}
      {s && <Scored s={s} today={today} domain={domain} {...a} />}

      {(status.kind === "scored" || (status.kind === "none" && form)) && (a.onOverride || a.onDisagree) && (
        <Disagree form={form} setForm={setForm} s={s} onOverride={a.onOverride} onDisagree={a.onDisagree} />)}
    </section>
  );
}

function Scored({ s, today, domain, ...a }: { s: FitScore; today: Date; domain: string } & FitActions) {
  const c = confidence(s);
  const ch = changeOf(s);
  const age = ageDays(s.at, today);
  return <>
    {s.override && (
      <Banner tone="info" icon="pen" title={`You set this to ${s.override.value}`}
        action={a.onClearOverride && <Button onClick={a.onClearOverride}>Use Corral&rsquo;s {s.value}</Button>}>
        {s.override.note && <>&ldquo;{s.override.note}&rdquo; </>}{s.override.by}, {fmtDay(s.override.at)}. Your number is used for sorting, filters and segments until you clear it. Corral keeps its own score below and keeps it current.
      </Banner>)}
    {s.disagree && (
      <Banner tone="caution" icon="alert" title="You said this score is wrong"
        action={a.onRescore && <Button onClick={a.onRescore}>Rescore now</Button>}>
        &ldquo;{s.disagree.note}&rdquo; {s.disagree.by}, {fmtDay(s.disagree.at)}. Corral re-reads {domain} with your note on the next rescore. The score stays as it is until then.
      </Banner>)}
    {c.level === "low" && !s.override && (
      <Banner tone="caution" icon="help" title="Low confidence">
        {c.reason}. Checks without evidence count as zero, so {s.value} is a floor: it could reach {ceilingOf(s)} if they hold. Adding what&rsquo;s missing settles it.
      </Banner>)}

    <p className="f-why__sum">{summaryLine(s)}</p>
    <p className="f-why__meta c-faint">
      Scored {formatAge(age)} · read {s.pages} {s.pages === 1 ? "page" : "pages"} of <span className="c-mono">{domain}</span> · measured against {s.kbLines} lines of the {FIT_PRODUCT} knowledge base · {c.level} confidence
    </p>

    {ch && (
      <div className="f-change">
        <p className="f-change__hd"><span className="c-num">{ch.delta > 0 ? "↑" : "↓"} {ch.delta > 0 ? "Up" : "Down"} {Math.abs(ch.delta)}</span> from {ch.from} on {fmtDay(ch.at)}. What changed:</p>
        <ul>{ch.why.map((w) => <li key={w}>{w}</li>)}</ul>
      </div>)}

    <Checks s={s} today={today} {...a} />
  </>;
}

function Checks({ s, today, dim, onOpenField, onAddField }: { s: FitScore; today: Date; dim?: boolean } & FitActions) {
  const label = dim ? `The last score's checks, from ${fmtDay(s.at)}` : "Checks";
  return (<>
    {dim && <p className="f-checks__cap c-faint" aria-hidden>{label}</p>}
    <ol className={cx("f-checks", dim && "is-dim")} aria-label={label}>
      {s.checks.map((c) => <CheckRow key={c.id} c={c} today={today} onOpenField={onOpenField} onAddField={onAddField} />)}
    </ol></>
  );
}

function CheckRow({ c, today, onOpenField, onAddField }: { c: FitCheck; today: Date } & Pick<FitActions, "onOpenField" | "onAddField">) {
  return (
    <li className={cx("f-check", `is-${c.verdict}`)}>
      <span className="f-check__ic" aria-hidden="true"><Icon name={VICON[c.verdict]} size={12} /></span>
      <div className="f-check__body">
        <p className="f-check__top"><span className="c-strong">{c.label}</span>
          <span className="f-check__pts c-num"><span className="l-sr">{VERDICT_WORD[c.verdict]}, </span>{c.points} of {c.weight}</span></p>
        <p className="f-check__finding">{c.verdict === "partly" && <span className="f-check__word">Partly · </span>}{c.verdict === "missed" && <span className="f-check__word">Doesn&rsquo;t hold · </span>}{c.finding}</p>
        {c.evidence.map((e, i) => <Ev key={i} e={e} today={today} onOpenField={onOpenField} />)}
        {c.verdict === "unknown" && c.missing && onAddField && (
          <button type="button" className="c-link k-linkbtn f-check__add" onClick={() => onAddField(c.missing!.field)}>{c.missing.ask}</button>)}
        <p className="f-check__basis c-faint">Against <b>{c.basis.title}</b>: &ldquo;{c.basis.text}&rdquo;</p>
      </div>
    </li>
  );
}

function Ev({ e, today, onOpenField }: { e: FitEvidence; today: Date; onOpenField?: (f: ProvField) => void }) {
  return (
    <div className="f-ev">
      {e.quote ? <blockquote className="f-ev__q">&ldquo;{e.text}&rdquo;</blockquote> : <p className="f-ev__t">{e.text}</p>}
      <p className="f-ev__cite c-faint">
        {SOURCE[e.kind].short}{e.where !== SOURCE[e.kind].short && <> · <span className="c-mono">{e.where}</span></>} · {e.where.includes(".") ? "read" : "checked"} {formatAge(ageDays(e.at, today))}
        {e.field && onOpenField && <> · <button type="button" className="c-link k-linkbtn" onClick={() => onOpenField(e.field!)}>Where this came from</button></>}
      </p>
    </div>
  );
}

function Scoring({ st, domain }: { st: Extract<FitStatus, { kind: "scoring" }>; domain: string }) {
  const labels = (st.last ?? KILIMA_FIT).checks.map((c) => c.label);
  return <>
    <p className="f-why__sum" role="status">Reading <span className="c-mono">{domain}</span>: {st.pages} of about {st.of} pages. Then Corral checks what it read against the {FIT_PRODUCT} knowledge base.</p>
    {st.last && <p className="f-why__meta c-faint">The last score, {shownValue(st.last)} from {fmtDay(st.last.at)}, stays in use until this finishes. Usually under a minute.</p>}
    <ol className="f-checks is-pending" aria-label="Checks">
      {labels.map((l, i) => (
        <li key={l} className={cx("f-check", i < st.checked ? "is-met" : "is-wait")}>
          <span className="f-check__ic" aria-hidden="true">{i < st.checked ? <Icon name="check" size={12} /> : <span className={cx("f-dot", i === st.checked && "is-live")} />}</span>
          <div className="f-check__body"><p className="f-check__top"><span className={i < st.checked ? "c-strong" : undefined}>{l}</span>
            <span className="f-check__pts c-faint">{i < st.checked ? "Checked" : i === st.checked ? "Checking…" : "Waiting"}</span></p></div>
        </li>))}
    </ol>
  </>;
}

function NoneYet({ st, company, onRescore, onSet }: { st: Extract<FitStatus, { kind: "none" }>; company: string; onRescore?: () => void; onSet?: () => void }) {
  const body: ReactNode = st.why === "no-site"
    ? <>There&rsquo;s no website to read for {company}, so Corral has nothing to score it on. Add the website, or set the fit yourself.</>
    : <>Corral scores a company after reading its website. {company} was added {st.since ?? "recently"} and is in line; most are scored within a few minutes.</>;
  return (
    <div className="f-none">
      <p>{body}</p>
      <div className="c-actions">
        {st.why !== "no-site" && onRescore && <Button onClick={onRescore}>Score it now</Button>}
        {onSet && <Button variant="quiet" onClick={onSet}><Icon name="pen" />Set the fit myself</Button>}
      </div>
    </div>
  );
}

function Disagree({ form, setForm, s, onOverride, onDisagree }: {
  form: "override" | "disagree" | null; setForm: (f: "override" | "disagree" | null) => void; s: FitScore | null;
  onOverride?: (value: number, note: string) => void; onDisagree?: (note: string) => void;
}) {
  const [num, setNum] = useState(s?.override ? String(s.override.value) : "");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const issue = overrideIssue(num);
  if (!form) return (
    <div className="f-why__foot">
      <span className="c-faint">Not right?</span>
      {onOverride && <Button variant="quiet" onClick={() => { setNum(s?.override ? String(s.override.value) : ""); setTried(false); setForm("override"); }}><Icon name="pen" />{s?.override ? "Change your fit" : "Set the fit myself"}</Button>}
      {onDisagree && s && !s.disagree && <Button variant="quiet" onClick={() => { setNote(""); setTried(false); setForm("disagree"); }}><Icon name="alert" />Tell Corral what&rsquo;s wrong</Button>}
    </div>
  );
  if (form === "override") return (
    <form className="f-form" onSubmit={(e) => { e.preventDefault(); setTried(true); if (!issue) { onOverride?.(Number(num), note.trim()); setForm(null); } }}>
      <p className="c-strong">Set the fit yourself</p>
      <p className="c-faint">Your number replaces Corral&rsquo;s for sorting, filters and segments. Corral keeps scoring in the background, so you can go back to its number.</p>
      <FormField label="Your fit, 0–100" error={tried ? issue : undefined}>
        <TextInput inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Why" optional help="Shown to your team next to the score.">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
      <div className="c-actions"><Button variant="primary" type="submit">Use my fit</Button><Button variant="quiet" onClick={() => setForm(null)}>Cancel</Button></div>
    </form>
  );
  return (
    <form className="f-form" onSubmit={(e) => { e.preventDefault(); setTried(true); if (note.trim()) { onDisagree?.(note.trim()); setForm(null); } }}>
      <p className="c-strong">Tell Corral what&rsquo;s wrong</p>
      <FormField label="What did Corral get wrong?" error={tried && !note.trim() ? "Say what's wrong, in a sentence." : undefined}
        help="Corral re-reads the site with your note and rescores. Nothing is sent to the company.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="They rent their cold rooms; they don't run them." />
      </FormField>
      <div className="c-actions"><Button variant="primary" type="submit">Send and rescore</Button><Button variant="quiet" onClick={() => setForm(null)}>Cancel</Button></div>
    </form>
  );
}
