"use client";
import { useMemo } from "react";
import { Button, Segmented, cx } from "../primitives";
import { Icon } from "../icons";
import { Select, TextInput } from "../Form";
import { MultiPick } from "./parts";
import { OP_LABEL, RULE_FIELDS, describeRule, filterLeads, ruleIssue, type LeadLike, type Match, type Rule, type RuleField } from "@/lib/leads/segment";

let rid = 0;
export const newRule = (field: RuleField = "country"): Rule => {
  const f = RULE_FIELDS[field];
  return { id: `r${++rid}`, field, op: f.ops[0], value: f.kind === "number" ? 80 : f.kind === "set" ? [] : "" };
};

/** Loosen the tightest number rule until something matches; returns the hint, or null. */
export function loosenHint(leads: LeadLike[], rules: Rule[], match: Match): string | null {
  const fit = rules.find((r) => r.field === "fit" && r.op === "gte" && !ruleIssue(r));
  if (!fit) return null;
  for (let v = Number(fit.value) - 5; v >= 50; v -= 5) {
    const n = filterLeads(leads, rules.map((r) => (r.id === fit.id ? { ...r, value: v } : r)), match).length;
    if (n) return `Fit ≥ ${fit.value} is the tightest rule. At ≥ ${v}, ${n} ${n === 1 ? "company matches" : "companies match"}.`;
  }
  return null;
}

/**
 * Segment builder: rules on the left, the live count on the right. Rules are the same model as the
 * filter chips on Companies, so "Save as segment" and "Edit rules" are one component.
 */
export function SegmentBuilder({ rules, onRules, match, onMatch, leads, name, onName, onSave, onCancel, saveLabel = "Save segment", total, preview }: {
  rules: Rule[]; onRules: (r: Rule[]) => void; match: Match; onMatch: (m: Match) => void; leads: LeadLike[];
  name?: string; onName?: (n: string) => void; onSave: () => void; onCancel: () => void; saveLabel?: string; total?: number;
  /** Live (ENG-81): the API's count and first matches for these rules, instead of filtering `leads`. */ preview?: { count: number; peek: LeadLike[] };
}) {
  const local = useMemo(() => filterLeads(leads, rules, match), [leads, rules, match]);
  const hits = preview ? { length: preview.count, slice: (a: number, b: number) => preview.peek.slice(a, b) } : local;
  const issues = rules.filter((r) => ruleIssue(r)).length;
  const put = (id: string, patch: Partial<Rule>) => onRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const hint = hits.length === 0 ? loosenHint(leads, rules, match) : null;
  const canSave = !issues && hits.length > 0 && (name === undefined || name.trim().length > 0);
  return (
    <section className="l-builder" aria-label="Segment rules">
      <div className="l-builder__main">
        {onName && <label className="l-builder__name"><span className="l-sr">Segment name</span>
          <input value={name} onChange={(e) => onName(e.target.value)} placeholder="Name this segment" aria-invalid={name !== undefined && !name.trim() || undefined} /></label>}
        <div className="l-builder__match">Companies that match
          <Segmented label="Match" options={["all", "any"]} value={match} onChange={(v) => onMatch(v as Match)} /> of these rules</div>
        <ol className="l-rules">
          {rules.map((r, i) => {
            const f = RULE_FIELDS[r.field], issue = ruleIssue(r);
            return (
              <li key={r.id} className={cx("l-rule", issue && "is-error")}>
                <span className="l-rule__n c-mono" aria-hidden="true">{i === 0 ? "Where" : match === "all" ? "and" : "or"}</span>
                <Select label={`Rule ${i + 1} field`} value={r.field} width={210} options={Object.entries(RULE_FIELDS).map(([k, v]) => ({ value: k, label: v.label }))}
                  onChange={(v) => { const nr = newRule(v as RuleField); put(r.id, { field: nr.field, op: nr.op, value: nr.value }); }} />
                {f.ops.length > 1 ? <Select label={`Rule ${i + 1} condition`} value={r.op} width={128} options={f.ops.map((o) => ({ value: o, label: OP_LABEL[o] }))} onChange={(v) => put(r.id, { op: v as Rule["op"] })} />
                  : <span className="l-rule__op">{OP_LABEL[r.op]}</span>}
                <span className="l-rule__v">
                  {f.kind === "number" ? <TextInput aria-label={`Rule ${i + 1} value`} inputMode="numeric" value={String(r.value)} invalid={!!issue} onChange={(e) => put(r.id, { value: e.target.value.replace(/[^\d]/g, "") })} suffix="/ 100" />
                    : f.kind === "text" ? <TextInput aria-label={`Rule ${i + 1} value`} value={String(r.value)} invalid={!!issue} placeholder="e.g. quality" onChange={(e) => put(r.id, { value: e.target.value })} />
                    : <MultiPick label={`Rule ${i + 1} values`} values={r.value as string[]} options={f.options!} invalid={!!issue} onChange={(v) => put(r.id, { value: v })} />}
                </span>
                <button type="button" className="c-iconbtn" aria-label={`Remove rule: ${describeRule(r)}`} onClick={() => onRules(rules.filter((x) => x.id !== r.id))}><Icon name="x" size={12} /></button>
                {issue && <span className="l-rule__err" role="alert"><Icon name="alert" size={12} />{issue}</span>}
              </li>
            );
          })}
        </ol>
        <button type="button" className="c-btn c-btn--quiet l-builder__add" onClick={() => onRules([...rules, newRule()])}><Icon name="plus" />Add rule</button>
      </div>
      <aside className="l-builder__side" aria-live="polite">
        <span className="l-builder__label">Matches now</span>
        <span className={cx("l-builder__count", hits.length === 0 && "is-zero")}>{hits.length.toLocaleString("en")}</span>
        <span className="l-builder__of">{total ? `of ${total.toLocaleString("en")} companies` : "companies"}{issues ? ` · ${issues} unfinished ${issues === 1 ? "rule is" : "rules are"} ignored` : ""}</span>
        {hits.length === 0 && <p className="l-builder__hint">{hint ?? "No company matches every rule. Remove one, or switch to any."}</p>}
        {hits.length > 0 && <ul className="l-builder__peek" aria-label="First matches">{hits.slice(0, 4).map((l) => <li key={l.id}><span>{l.company}</span><span className="c-mono">{l.fit || "—"}</span></li>)}</ul>}
        <p className="l-builder__live">Segments stay live: companies join and leave as Corral re-scores them.</p>
        <div className="l-builder__acts">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!canSave} onClick={onSave} aria-describedby={!canSave ? "l-save-why" : undefined}>{saveLabel}</Button>
        </div>
        {!canSave && <span id="l-save-why" className="l-builder__why">{issues ? `Finish ${issues} ${issues === 1 ? "rule" : "rules"} to save` : hits.length === 0 ? "A segment needs at least one match" : "Name the segment to save"}</span>}
      </aside>
    </section>
  );
}
