"use client";
import type { ReactNode } from "react";
import { FAILURE, SKIP, STAGES, overallPercent, recoveryOf, skippedPages, stageLabel, triedLabel, type SkipReason, type Stage } from "@/lib/kb/upload";
import { Icon } from "../icons";
import { Button, cx } from "../primitives";
import { Banner } from "../States";
import { citedBy, PASSAGES, type KSection, type Source } from "./data";
import { FileTile, PassageItem, PersonMark, Progress, byName, kindMeta } from "./parts";

/* One step of the reading pipeline, as a receipt: what happened, with the fact that proves it. */
type Step = { stage: Stage; state: "done" | "live" | "warn" | "fail" | "todo"; text: string; meta?: string; pct?: number };

export function pipelineSteps(src: Source): Step[] {
  const st = src.status;
  const url = src.kind === "url";
  const facts: Record<Stage, [string, string?]> = {
    upload: url ? [`Fetched ${src.host}`, src.added] : [src.by.unknown ? "Uploaded by a teammate" : `Uploaded by ${byName(src.by)}`, `${src.meta.split(" · ").pop()} · ${src.added}`],
    scan: url ? ["Checked · public page, no login wall"] : ["Checked · no macros, no embedded files, not encrypted"],
    parse: url ? [`Read ${src.meta.split(" · ")[0].toLowerCase()}`] : [`Read ${src.meta.split(" · ")[0]}`],
    chunk: [src.passages ? `Split into ${src.passages} passages` : "Split into passages", "~400 words each"],
    embed: ["Searchable", src.updated],
  };
  const at = st.s === "processing" ? st.stage : st.s === "failed" ? st.at : null;
  return STAGES.map((stage) => {
    const i = STAGES.indexOf(stage);
    const [text, meta] = facts[stage];
    if (st.s === "ready") return { stage, state: "done", text, meta };
    if (st.s === "partial") return stage === "parse"
      ? { stage, state: "warn", text: st.total !== undefined && st.read !== undefined ? `Used ${st.read} of ${st.total} ${st.unit}` : "Read the first part", meta: `skipped ${st.skipped}` }
      : { stage, state: "done", text, meta };
    const j = STAGES.indexOf(at!);
    if (i < j) return { stage, state: "done", text, meta };
    if (i > j) return { stage, state: "todo", text: stageLabel(stage, src.kind, "done") };
    if (st.s === "failed") return { stage, state: "fail", text: `Stopped at ${stageLabel(stage, src.kind).toLowerCase()}`,
      meta: st.failure === "interrupted" ? (st.at === "upload" ? "file not stored" : (st.attempts ?? 0) > 1 ? `${triedLabel(st.attempts)!.toLowerCase()}` : "stopped") : st.failure === "unreadable" ? (st.note ? "took too long" : "file damaged") : FAILURE[st.failure].title.replace(/^This (PDF|file) is /, "").toLowerCase() };
    return { stage, state: "live", text: stageLabel(stage, src.kind), meta: (st.attempts ?? 0) > 1 ? `try ${st.attempts} · retrying after a hiccup` : st.note, pct: st.pct };
  });
}

const STEP_ICON = { done: "check", live: "clock", warn: "alert", fail: "x", todo: "check" } as const;

export function SourceDetail({ src, knowledge, onBack, onAction, onJump, passages: given }: {
  src: Source; knowledge?: KSection[]; onBack?: () => void;
  onAction?: (id: string, a: "reread" | "replace" | "remove") => void; onJump?: (itemId: string) => void;
  /** The source's first passages (the API's); defaults to the sample passages. */
  passages?: { loc: string | null; ordinal?: number; text: string }[];
}) {
  const st = src.status;
  const used = citedBy(src.id, knowledge);
  const passages: { loc: string | null; ordinal?: number; text: string }[] = given ?? PASSAGES[src.id] ?? [];
  const steps = pipelineSteps(src);
  return (
    <aside className="k-detail" aria-label={`${src.name} details`}>
      {onBack && <button type="button" className="c-ux__back" onClick={onBack}><Icon name="back" />All sources</button>}
      <header className="k-detail__head">
        <FileTile kind={src.kind} size={36} host={src.host} />
        <div className="k-detail__titles">
          <h2>{src.name}</h2>
          <p>{kindMeta(src)}</p>
        </div>
      </header>

      {st.s === "partial" && <PartialBanner src={src} onAction={onAction} />}
      {st.s === "failed" && <FailedBanner src={src} onAction={onAction} />}

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
            {passages.map((p, i) => <PassageItem key={`${p.loc}-${i}`} loc={p.loc} ordinal={p.ordinal ?? i} text={p.text} />)}
          </ul>
        </section>
      )}

      <footer className="k-detail__foot">
        <span className={cx("k-by", src.by.unknown && "is-anon")}><PersonMark by={src.by} /><span>Added by {src.by.unknown ? "a teammate" : src.by.name}<em>{src.added}</em></span></span>
        <div className="k-detail__acts">
          {(st.s === "failed" || st.s === "partial") && src.kind !== "url"
            ? <Button onClick={() => onAction?.(src.id, "replace")}><Icon name="upload" />{st.s === "failed" && recoveryOf(st.failure, st.at) === "retry" ? "Replace instead" : "Replace file"}</Button>
            : <Button disabled={st.s === "processing"} onClick={() => onAction?.(src.id, "reread")}><Icon name="refresh" />{src.kind === "url" ? "Re-read" : "Read again"}</Button>}
          <Button variant="quiet" className="k-danger" onClick={() => onAction?.(src.id, "remove")}>Remove</Button>
        </div>
      </footer>
    </aside>
  );
}

type OnAction = ((id: string, a: "reread" | "replace" | "remove") => void) | undefined;

/* partial (M10b, reasons from 2f66f91): how much was used and how much skipped, as numbers and as a page
   strip, and why, from `skipped_reason`. Each reason names its own fix:
   scanned → a text version (no OCR yet) · size-limit → split it · unreadable (web) → re-read · mixed → both. */
function PartialBanner({ src, onAction }: { src: Source; onAction: OnAction }) {
  const st = src.status;
  if (st.s !== "partial") return null;
  const counted = st.total !== undefined && st.read !== undefined;
  const gone = counted ? st.total! - st.read! : 0;
  const pages = counted ? skippedPages(st.skipped, st.total) : null;
  const fix = SKIP[st.reason].fix;
  const title = counted ? `${st.read} of ${st.total} ${st.unit} used · ${gone} skipped` : "Partly read · the end was skipped";
  const one = gone === 1;
  const body: Record<SkipReason, ReactNode> = {
    scanned: <>Corral skipped {st.skipped}. {one ? "It’s a scanned image" : "They’re scanned images"} with no text layer, and Corral can’t read text inside images yet. Upload a version with selectable text, exported from the original rather than scanned, to include {one ? "it" : "them"}.</>,
    "size-limit": counted
      ? <>Corral reads up to {st.read} {st.unit} of one file, so it stopped there and skipped {st.skipped}. Split the file into parts, replace this one with the first part, and add the rest.</>
      : <>This file has more text than Corral reads from one file, so it stopped partway and skipped the end of the document. Split it into parts, replace this one with the first part, and add the rest.</>,
    unreadable: <>{one ? "One page" : `${gone} pages`} in this section didn’t load or had no text, so Corral skipped {one ? "it" : "them"}: <span className="c-mono">{st.skipped}</span>. It uses the other {st.read}. Re-read to try again, or add {one ? "that page" : "those pages"} on {one ? "its" : "their"} own.</>,
    mixed: <>Corral skipped {st.skipped} for two reasons: some are scanned images with no text layer, and the rest are past the most Corral reads from one file. Upload a text version, split into parts, to include them.</>,
  };
  const action = fix === "reread" ? <Button onClick={() => onAction?.(src.id, "reread")}><Icon name="refresh" />Re-read</Button>
    : <Button onClick={() => onAction?.(src.id, "replace")}><Icon name="upload" />{fix === "text-version" ? "Upload a text version" : "Replace with the first part"}</Button>;
  return (
    <div className="k-partial">
      <Banner tone="caution" title={title} action={action}>{body[st.reason]}</Banner>
      {pages && pages.length > 0 && <PageStrip total={st.total!} skipped={pages} why={st.reason} />}
    </div>
  );
}

/** Ticks for the page strip: one per page up to 76, then one per few pages (a tick is "part" when only some
 *  of its pages were skipped), so a 620-page manual still fits the 380 rail. */
export function pageTicks(total: number, skipped: number[], max = 76): ("on" | "off" | "part")[] {
  const off = new Set(skipped);
  const per = Math.max(1, Math.ceil(total / max));
  const out: ("on" | "off" | "part")[] = [];
  for (let start = 1; start <= total; start += per) {
    let n = 0, k = 0;
    for (let p = start; p < start + per && p <= total; p++, k++) if (off.has(p)) n++;
    out.push(n === 0 ? "on" : n === k ? "off" : "part");
  }
  return out;
}

/** One tick per page (or per few): ink for pages Corral used, hatched caution for the ones it skipped. */
export function PageStrip({ total, skipped, why }: { total: number; skipped: number[]; why?: SkipReason }) {
  const off = new Set(skipped.filter((p) => p >= 1 && p <= total));
  const used = total - off.size;
  return (
    <figure className="k-pages" aria-label={`${used} pages used, ${off.size} skipped`}>
      <span className="k-pages__strip" aria-hidden="true">
        {pageTicks(total, [...off]).map((t, i) => <span key={i} className={cx("k-pages__p", t !== "on" && `is-${t}`)} />)}
      </span>
      <figcaption className="k-pages__key">
        <span><i className="k-pages__sw" aria-hidden="true" />{used} used</span>
        <span><i className="k-pages__sw is-off" aria-hidden="true" />{off.size} skipped{why ? ` · ${SKIP[why].key}` : ""}</span>
        <span className="c-mono">p.1–{total}</span>
      </figcaption>
    </figure>
  );
}

/* failed: the failure's title and fix, the one recovery, and for unreadable / interrupted the detail
   the server sends (failure, failure_stage, note, processed_at), so support and the user see the same thing. */
function FailedBanner({ src, onAction }: { src: Source; onAction: OnAction }) {
  const st = src.status;
  if (st.s !== "failed") return null;
  const f = FAILURE[st.failure];
  const rec = recoveryOf(st.failure, st.at);
  const lost = st.failure === "interrupted" && st.at === "upload";
  const tried = triedLabel(st.attempts);
  const retried = (st.attempts ?? 0) > 1;
  const body = st.failure === "unreadable" && st.note ? `${st.note} Save a fresh copy or export it as PDF, then replace it.`
    : lost ? "The file didn’t reach storage, so there’s nothing to try again. Upload it again."
    : st.failure === "interrupted" && tried ? (retried
      ? `Corral ${tried!.toLowerCase()} and couldn’t finish, so nothing from it is searchable yet. Your file is kept.`
      : "Corral stopped partway through reading it, so nothing from it is searchable yet. Your file is kept.")
    : f.fix;
  const action = rec === "retry"
    ? <Button variant="primary" onClick={() => onAction?.(src.id, "reread")}><Icon name="refresh" />Try again</Button>
    : rec === "replace" ? <Button onClick={() => onAction?.(src.id, "replace")}><Icon name="upload" />{lost ? "Upload again" : "Replace file"}</Button>
    : <Button onClick={() => onAction?.(src.id, "remove")}>Remove</Button>;
  const detailed = st.failure === "interrupted" || st.failure === "unreadable";
  return (
    <div className="k-failed">
      <Banner tone="error" title={f.title} action={action}>
        {body}{st.failure === "interrupted" ? "" : " Corral isn’t using anything from it."}
      </Banner>
      {detailed && (
        <details className="k-why" open={st.failure === "interrupted"}>
          <summary>What happened</summary>
          <dl>
            <div><dt>Stopped at</dt><dd>{stageLabel(st.at, src.kind)} <span className="c-mono">{st.at}</span></dd></div>
            {st.note && <div><dt>Reason</dt><dd>{st.note.replace(/'/g, "’")}</dd></div>}
            {st.failure === "interrupted" && !lost && <div><dt>Tries</dt><dd>{retried ? `${tried}, waiting longer between each, then stopped.` : tried ? `${tried}. This kind of stop isn’t retried on its own.` : "Corral retried on its own until it ran out of tries."}</dd></div>}
            {st.failure === "unreadable" && <div><dt>Likely cause</dt><dd>{st.note ? "A very large or complex file. Corral stops reading one that takes too long." : "The file is damaged or isn’t really a " + (src.kind === "docx" ? "Word document" : src.kind === "md" ? "text file" : "PDF") + "."}</dd></div>}
            {src.kind !== "url" && <div><dt>Your file</dt><dd>{lost ? "Not stored. Upload it again." : st.failure === "interrupted" ? "Kept. You won’t need to upload it again." : "Kept, but unusable. Replacing swaps it in place."}</dd></div>}
            {st.when && <div><dt>Last try</dt><dd>{st.when}</dd></div>}
          </dl>
          <p className="k-why__code c-mono">failure: {st.failure} · failure_stage: {st.at}</p>
        </details>
      )}
    </div>
  );
}
