"use client";
import { useRef, useState, type ReactNode } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { FormField, Select, TextInput, Textarea } from "../Form";
import { DropdownMenu } from "../Overlays";
import { Tabs } from "../Tabs";
import { DEMO_TODAY_M4 } from "../discovery/data";
import { SOURCE, ageDays, formatAge } from "@/lib/discovery/provenance";
import { VARIABLES, render, stepDays, subjectOf, tokensIn, varDef, type Issue, type Part, type Recipient, type Step, type VarKey, type VarValue } from "@/lib/sequences/sequence";
import { COPILOT, MISSING_WHY, RECIPIENTS, type Copilot, type Sequence } from "./data";
import { TokenText } from "./Steps";

const UNSUB_LINE = "\n\nNot useful? {{unsubscribe_link}}";
export const stripCites = (s: string) => s.replace(/\[\d+\]/g, "");
const srcWord = (v: VarValue) => (v.kind === "mailbox" ? "Mailbox" : v.kind === "corral-link" ? "Corral" : SOURCE[v.kind].short);

/* ---------------------------------------------------------------- the editor */
export function StepEditor({ seq, i, onClose, onChange, preview, onPreview, copilot, onCopilot, tried, issues }: {
  seq: Sequence; i: number; onClose: () => void; onChange: (s: Step) => void;
  preview: string; onPreview: (id: string) => void; copilot: boolean; onCopilot: (open: boolean) => void;
  tried: boolean; issues: Issue[];
}) {
  const s = seq.steps[i];
  const day = stepDays(seq.steps)[i];
  const editable = seq.status === "draft";
  const [pane, setPane] = useState<"write" | "preview">("write");
  const wrap = useRef<HTMLDivElement>(null);
  const r = RECIPIENTS.find((x) => x.id === preview) ?? RECIPIENTS[0];
  const body = copilot ? stripCites(COPILOT.body) : s.body;
  const subject = copilot && s.thread === "new" ? COPILOT.subject : subjectOf(seq.steps, i);
  const bodyIssue = tried ? issues.find((x) => x.kind !== "subject") : undefined;

  const insert = (k: VarKey) => {
    const el = wrap.current?.querySelector("textarea"); const tok = `{{${k}}}`;
    const at = el ? el.selectionStart : s.body.length;
    onChange({ ...s, body: s.body.slice(0, at) + tok + s.body.slice(el ? el.selectionEnd : at) });
  };
  const addFallback = (k: VarKey) => onChange({ ...s, body: s.body.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), `{{${k} | your cold rooms}}`) });
  const addUnsub = () => onChange({ ...s, body: s.body.trimEnd() + UNSUB_LINE });

  return (
    <section className="q-ed" data-pane={pane} aria-label={`Step ${i + 1}`}>
      <div className="q-ed__head">
        <button type="button" className="q-ed__back" onClick={onClose}><Icon name="back" />All steps</button>
        <h3>Step {i + 1}</h3><span className="c-faint">Day {day} · {s.thread === "new" || i === 0 ? "New thread" : "Reply in the same thread"}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="c-iconbtn q-ed__x" aria-label="Close step" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="q-ed__tabs"><Tabs variant="pill" label="Step editor" value={pane} onChange={(v) => setPane(v as "write" | "preview")} tabs={[{ id: "write", label: "Write" }, { id: "preview", label: `Preview as ${r.person.split(" ")[0]}` }]} /></div>
      <div className="q-ed__cols">
        <div className="q-ed__write">
          {copilot ? <CopilotPanel c={COPILOT} onUse={() => { onChange({ ...s, subject: s.thread === "new" ? COPILOT.subject : s.subject, body: stripCites(COPILOT.body) }); onCopilot(false); }} onKeep={() => onCopilot(false)} /> : <>
            {s.thread === "new" || i === 0
              ? <FormField label="Subject"><TextInput value={s.subject} disabled={!editable} onChange={(e) => onChange({ ...s, subject: e.target.value })} /></FormField>
              : <div className="c-field"><span className="c-field__top"><span className="q-lab">Subject</span></span><p className="q-re"><TokenText text={subjectOf(seq.steps, i)} /><span className="c-faint"> · same thread as step 1</span></p></div>}
            <FormField label="Message" error={bodyIssue ? `${bodyIssue.title}. ${bodyIssue.fix}` : undefined}
              action={editable ? <span className="q-tools">
                <DropdownMenu align="start" width={300} label="Insert variable" items={[{ heading: "Insert at the cursor" }, ...VARIABLES.map((v) => ({ label: v.label, meta: <span className="c-mono">{v.key}</span>, onSelect: () => insert(v.key) }))]}
                  trigger={(tp) => <button type="button" className="c-btn c-btn--quiet" {...tp}><span className="q-brace" aria-hidden="true">{"{ }"}</span>Insert variable</button>} />
                <Button variant="quiet" onClick={() => onCopilot(true)}><Icon name="bolt" />Draft with Corral</Button></span> : undefined}>
              <div ref={wrap}><Textarea rows={13} value={s.body} disabled={!editable} onChange={(e) => onChange({ ...s, body: e.target.value })} /></div>
            </FormField>
          </>}
          <VarChecks s={copilot ? { ...s, subject, body } : s} seq={seq} tried={tried} onFallback={editable && !copilot ? addFallback : undefined} onUnsub={editable && !copilot ? addUnsub : undefined} />
        </div>
        <div className="q-ed__preview">
          <Preview subject={subject} body={body} r={r} onPreview={onPreview} audience={seq.audience.count} tried={tried} />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- variables in this step, and the unsubscribe check */
function VarChecks({ s, seq, tried, onFallback, onUnsub }: { s: Step; seq: Sequence; tried: boolean; onFallback?: (k: VarKey) => void; onUnsub?: () => void }) {
  const toks = tokensIn(`${s.subject}\n${s.body}`);
  const keys = [...new Map(toks.map((t) => [t.key, t])).values()].filter((t) => t.key !== "unsubscribe_link");
  const hasUnsub = /\{\{\s*unsubscribe_link/.test(s.body);
  const n = seq.audience.count;
  return (
    <div className="q-checks">
      <p className="q-lab">In this step</p>
      <ul>
        {keys.map((t) => {
          const def = varDef(t.key); const miss = def ? seq.missing[def.key] ?? 0 : 0;
          const bad = !def || (miss > 0 && !t.fallback);
          return (
            <li key={t.key} className={cx(bad && (tried ? "is-error" : "is-warn"))}>
              <span className="q-tok">{t.key}</span>
              <span className="q-checks__t">{!def ? "Not a variable" : miss === 0 ? `Filled for all ${n}` : t.fallback ? `Empty for ${miss} of ${n}; they get “${t.fallback}”` : `Empty for ${miss} of ${n}`}</span>
              {def && miss > 0 && !t.fallback && onFallback && <Button size="sm" variant="quiet" onClick={() => onFallback(def.key)}>Add a fallback</Button>}
            </li>
          );
        })}
        <li className={cx(!hasUnsub && (tried ? "is-error" : "is-warn"))}>
          <span className="q-tok">unsubscribe_link</span>
          <span className="q-checks__t">{hasUnsub ? "One-click unsubscribe, required in every email" : "Missing: every email needs one"}</span>
          {!hasUnsub && onUnsub && <Button size="sm" variant="quiet" onClick={onUnsub}>Add it</Button>}
        </li>
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- preview against a real company */
function Frag({ p }: { p: Part }) {
  if (p.t === "text") return <>{p.text}</>;
  if (p.t === "var") return <span className="q-var">{p.text}</span>;
  if (p.t === "fallback") return <span className="q-var is-fb">{p.text}</span>;
  if (p.t === "missing") return <span className="q-var is-missing">[{p.key}]</span>;
  return <span className="q-var is-missing">[{p.key}?]</span>;
}
export function Preview({ subject, body, r, onPreview, audience, tried }: { subject: string; body: string; r: Recipient; onPreview?: (id: string) => void; audience: number; tried?: boolean }) {
  const sp = render(subject, r); const bp = render(body, r);
  const parts = [...sp, ...bp];
  const missing = [...new Set(parts.filter((p) => p.t === "missing").map((p) => (p as { key: VarKey }).key))];
  const fb = [...new Set(parts.filter((p) => p.t === "fallback").map((p) => (p as { key: VarKey }).key))];
  const used = [...new Map(parts.filter((p): p is Extract<Part, { t: "var" }> => p.t === "var").map((p) => [p.key, p])).values()];
  return (
    <div className="q-pv">
      <div className="q-pv__pick">
        {onPreview ? <FormField label="Preview as"><Select value={r.id} onChange={onPreview} options={RECIPIENTS.map((x) => ({ value: x.id, label: `${x.person} · ${x.company}` }))} /></FormField>
          : <p className="q-lab">Preview as {r.person} · {r.company}</p>}
        <span className="c-faint">One of {audience} companies. Every email is filled in for its own company before it sends.</span>
      </div>
      <article className="q-mail" aria-label={`Email to ${r.person}`}>
        <dl className="q-mail__hd">
          <div><dt>From</dt><dd>Tomás Ibarra <span className="c-mono">tomas@coldtrace.io</span></dd></div>
          <div><dt>To</dt><dd>{r.person} <span className="c-mono">{r.email}</span></dd></div>
          <div><dt>Subject</dt><dd className="c-strong">{sp.map((p, k) => <Frag key={k} p={p} />)}</dd></div>
        </dl>
        <div className="q-mail__body">{bp.map((p, k) => <Frag key={k} p={p} />)}</div>
      </article>
      {missing.length > 0 && (
        <p className={cx("q-pv__miss", tried ? "is-error" : "is-warn")} role={tried ? "alert" : undefined}><Icon name="alert" size={12} />
          <span>{r.person.split(" ")[0]} would get {missing.map((k) => `[${k}]`).join(", ")}. {MISSING_WHY[r.id]?.[missing[0]] ?? "Corral has no value for this company."} Add a fallback or leave these companies out.</span></p>
      )}
      {fb.length > 0 && <p className="q-pv__fb c-faint">{r.company} has no {fb.map((k) => `{{${k}}}`).join(", ")}, so the fallback is used.</p>}
      <div className="q-src">
        <p className="q-lab">Where these came from</p>
        <ul>{used.map((p) => (
          <li key={p.key}><span className="q-tok">{p.key}</span><span className="q-src__v">{p.text}</span>
            <span className="c-faint">{srcWord(p.src)} · {p.src.what}{p.src.at ? ` · ${formatAge(ageDays(p.src.at, DEMO_TODAY_M4))}` : ""}</span></li>
        ))}</ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Corral's draft, citing the knowledge base */
function Cited({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = []; let i = 0;
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    out.push(<TokenText key={`t${i}`} text={text.slice(i, m.index)} />);
    out.push(<sup key={`c${m.index}`} className="q-cite"><a href={`#q-cite-${m[1]}`} aria-label={`Knowledge line ${m[1]}`}>{m[1]}</a></sup>);
    i = (m.index ?? 0) + m[0].length;
  }
  out.push(<TokenText key="end" text={text.slice(i)} />);
  return out;
}
export function CopilotPanel({ c, onUse, onKeep }: { c: Copilot; onUse: () => void; onKeep: () => void }) {
  return (
    <section className="q-cop" aria-label="Corral's draft">
      <div className="q-cop__head"><Icon name="bolt" /><span className="c-strong">Corral&rsquo;s draft</span><span className="c-faint">from {c.cites.length} lines of the ColdTrace Sensors knowledge base</span></div>
      <p className="q-cop__subj"><span className="q-lab">Subject</span> <TokenText text={c.subject} /></p>
      <div className="q-cop__body"><Cited text={c.body} /></div>
      <p className="c-faint q-cop__note">{c.notes}</p>
      <div className="q-cop__sec">
        <p className="q-lab">Every claim, and the line it came from</p>
        <ol className="q-cop__cites">{c.cites.map((x) => (
          <li key={x.n} id={`q-cite-${x.n}`}><span className="q-cop__n">{x.n}</span>
            <span><span className="c-strong">{x.section}</span> “{x.text}”<span className="c-faint q-cop__src">{x.sources.join(" · ")}{x.by === "you" ? " · written by you" : ""}</span></span></li>))}</ol>
      </div>
      <div className="q-cop__sec">
        <p className="q-lab">Left out, and why</p>
        <ul className="q-cop__left">{c.left.map((x) => <li key={x.what}><span className="c-strong">{x.what}.</span> {x.why}{x.action && <> <a className="c-link" href="/app/knowledge?state=conflict">{x.action}</a></>}</li>)}</ul>
        <p className="c-faint q-cop__rules"><Icon name="check" size={12} />Checked against Never say: {c.rules.map((r) => r[0].toLowerCase() + r.slice(1)).join("; ")}.</p>
      </div>
      <div className="c-actions"><Button variant="primary" onClick={onUse}>Use this draft</Button><Button variant="quiet" onClick={onKeep}>Keep mine</Button></div>
    </section>
  );
}
