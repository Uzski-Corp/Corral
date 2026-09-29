"use client";
import { FAILURE, STAGES, overallPercent, stageLabel, type Stage } from "@/lib/kb/upload";
import { Icon } from "../icons";
import { Avatar, Button, cx } from "../primitives";
import { Banner } from "../States";
import { citedBy, PASSAGES, type KSection, type Source } from "./data";
import { FileTile, Progress, kindLabel } from "./parts";

/* One step of the reading pipeline, as a receipt: what happened, with the fact that proves it. */
type Step = { stage: Stage; state: "done" | "live" | "warn" | "fail" | "todo"; text: string; meta?: string; pct?: number };

export function pipelineSteps(src: Source): Step[] {
  const st = src.status;
  const url = src.kind === "url";
  const facts: Record<Stage, [string, string?]> = {
    upload: url ? [`Fetched ${src.host}`, src.added] : [`Uploaded by ${src.by.name.split(" ")[0]}`, `${src.meta.split(" · ").pop()} · ${src.added}`],
    scan: url ? ["Checked · public page, no login wall"] : ["Checked · no macros, no embedded files, not encrypted"],
    parse: url ? [`Read ${src.meta.split(" · ")[0].toLowerCase()}`] : [`Read ${src.meta.split(" · ")[0]}`],
    chunk: [`Split into ${src.passages ?? "—"} passages`, "~400 words each"],
    embed: ["Searchable", src.updated],
  };
  const at = st.s === "processing" ? st.stage : st.s === "failed" ? st.at : null;
  return STAGES.map((stage) => {
    const i = STAGES.indexOf(stage);
    const [text, meta] = facts[stage];
    if (st.s === "ready") return { stage, state: "done", text, meta };
    if (st.s === "partial") return stage === "parse"
      ? { stage, state: "warn", text: `Read ${st.read} of ${st.total} ${st.unit}`, meta: `skipped ${st.skipped}` }
      : { stage, state: "done", text, meta };
    const j = STAGES.indexOf(at!);
    if (i < j) return { stage, state: "done", text, meta };
    if (i > j) return { stage, state: "todo", text: stageLabel(stage, src.kind, "done") };
    if (st.s === "failed") return { stage, state: "fail", text: `Stopped at ${stageLabel(stage, src.kind).toLowerCase()}`, meta: FAILURE[st.failure].title.replace(/^This (PDF|file) is /, "").toLowerCase() };
    return { stage, state: "live", text: stageLabel(stage, src.kind), meta: st.note, pct: st.pct };
  });
}

const STEP_ICON = { done: "check", live: "clock", warn: "alert", fail: "x", todo: "check" } as const;

export function SourceDetail({ src, knowledge, onBack, onAction, onJump }: {
  src: Source; knowledge?: KSection[]; onBack?: () => void;
  onAction?: (id: string, a: "reread" | "replace" | "remove") => void; onJump?: (itemId: string) => void;
}) {
  const st = src.status;
  const used = citedBy(src.id, knowledge);
  const passages = PASSAGES[src.id] ?? [];
  const steps = pipelineSteps(src);
  return (
    <aside className="k-detail" aria-label={`${src.name} details`}>
      {onBack && <button type="button" className="c-ux__back" onClick={onBack}><Icon name="back" />All sources</button>}
      <header className="k-detail__head">
        <FileTile kind={src.kind} size={36} />
        <div className="k-detail__titles">
          <h2>{src.name}</h2>
          <p>{kindLabel(src.kind)} · {src.meta}</p>
        </div>
      </header>

      {st.s === "partial" && (
        <Banner tone="caution" title={`Partly read: ${st.read} of ${st.total} ${st.unit} are searchable.`}
          action={<Button onClick={() => onAction?.(src.id, "replace")}>Replace file</Button>}>
          {st.note} Corral skipped {st.skipped}. Add a version with selectable text to include them.
        </Banner>
      )}
      {st.s === "failed" && (
        <Banner tone="error" title={FAILURE[st.failure].title}
          action={<Button onClick={() => onAction?.(src.id, FAILURE[st.failure].action === "retry" ? "reread" : "replace")}>{FAILURE[st.failure].action === "retry" ? "Try again" : "Replace file"}</Button>}>
          {FAILURE[st.failure].fix} Corral isn&rsquo;t using anything from it.
        </Banner>
      )}

      <section className="k-detail__sec" aria-labelledby={`${src.id}-p`}>
        <h3 id={`${src.id}-p`}>Reading</h3>
        <ol className="k-steps">
          {steps.map((s) => (
            <li key={s.stage} className={cx("k-step", `is-${s.state}`)}>
              <span className="k-step__ic" aria-hidden="true"><Icon name={STEP_ICON[s.state]} size={11} /></span>
              <span className="k-step__txt">
                <span>{s.text}{s.meta && <em>{s.meta}</em>}</span>
                {s.state === "live" && <Progress value={overallPercent(s.stage, s.pct ?? 0) } label={`${s.text}, ${overallPercent(s.stage, s.pct ?? 0)}% overall`} />}
              </span>
              <span className="k-sr">{s.state === "todo" ? "not started" : s.state === "live" ? "in progress" : s.state === "warn" ? "partly done" : s.state === "fail" ? "failed" : "done"}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="k-detail__sec" aria-labelledby={`${src.id}-u`}>
        <h3 id={`${src.id}-u`}>Used in knowledge <span className="k-count">{used.length}</span></h3>
        {used.length ? (
          <ul className="k-used">
            {used.slice(0, 4).map(({ section, item }) => (
              <li key={item.id}><button type="button" onClick={() => onJump?.(item.id)}><em>{section}</em><span>{item.q ?? item.body}</span></button></li>
            ))}
          </ul>
        ) : <p className="k-nil">{st.s === "ready" || st.s === "partial" ? "Nothing cites it yet. Corral still searches it when writing replies." : "Corral drafts knowledge from it once it's searchable."}</p>}
      </section>

      {passages.length > 0 && (
        <section className="k-detail__sec" aria-labelledby={`${src.id}-x`}>
          <h3 id={`${src.id}-x`}>Passages <span className="k-count">{passages.length} of {src.passages}</span></h3>
          <ul className="k-passages">
            {passages.map((p) => <li key={p.loc}><span className="c-mono">{p.loc}</span><p>{p.text}</p></li>)}
          </ul>
        </section>
      )}

      <footer className="k-detail__foot">
        <span className="k-by">{src.by.avatar && <Avatar id={src.by.avatar} />}<span>Added by {src.by.name}<em>{src.added}</em></span></span>
        <div className="k-detail__acts">
          {(st.s === "failed" || st.s === "partial") && src.kind !== "url"
            ? <Button onClick={() => onAction?.(src.id, "replace")}><Icon name="upload" />Replace file</Button>
            : <Button disabled={st.s === "processing"} onClick={() => onAction?.(src.id, "reread")}><Icon name="refresh" />{src.kind === "url" ? "Re-read" : "Read again"}</Button>}
          <Button variant="quiet" className="k-danger" onClick={() => onAction?.(src.id, "remove")}>Remove</Button>
        </div>
      </footer>
    </aside>
  );
}
