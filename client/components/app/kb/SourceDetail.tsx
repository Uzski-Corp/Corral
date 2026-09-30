"use client";
import { FAILURE, STAGES, overallPercent, partialReason, recoveryOf, skippedPages, stageLabel, type Stage } from "@/lib/kb/upload";
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
    chunk: [src.passages ? `Split into ${src.passages} passages` : "Split into passages", "~400 words each"],
    embed: ["Searchable", src.updated],
  };
  const at = st.s === "processing" ? st.stage : st.s === "failed" ? st.at : null;
  return STAGES.map((stage) => {
    const i = STAGES.indexOf(stage);
    const [text, meta] = facts[stage];
    if (st.s === "ready") return { stage, state: "done", text, meta };
    if (st.s === "partial") return stage === "parse"
      ? { stage, state: "warn", text: `Used ${st.read} of ${st.total} ${st.unit}`, meta: `skipped ${st.skipped}` }
      : { stage, state: "done", text, meta };
    const j = STAGES.indexOf(at!);
    if (i < j) return { stage, state: "done", text, meta };
    if (i > j) return { stage, state: "todo", text: stageLabel(stage, src.kind, "done") };
    if (st.s === "failed") return { stage, state: "fail", text: `Stopped at ${stageLabel(stage, src.kind).toLowerCase()}`,
      meta: st.failure === "interrupted" ? (st.at === "upload" ? "file not stored" : "retries used up") : st.failure === "unreadable" ? (st.note ? "took too long" : "file damaged") : FAILURE[st.failure].title.replace(/^This (PDF|file) is /, "").toLowerCase() };
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
            {passages.map((p) => <li key={p.loc}><span className="c-mono">{p.loc}</span><p>{p.text}</p></li>)}
          </ul>
        </section>
      )}

      <footer className="k-detail__foot">
        <span className="k-by">{src.by.avatar && <Avatar id={src.by.avatar} />}<span>Added by {src.by.name}<em>{src.added}</em></span></span>
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

/* partial (M10b): how many pages were used and how many skipped, as numbers and as a page strip, and
   why. Scanned pages are images with no text layer; Corral has no OCR yet, so the fix is a text version. */
function PartialBanner({ src, onAction }: { src: Source; onAction: OnAction }) {
  const st = src.status;
  if (st.s !== "partial") return null;
  const why = partialReason(st.note, src.kind);
  const gone = st.total - st.read;
  const pages = skippedPages(st.skipped, st.total);
  const file = src.kind !== "url";
  return (
    <div className="k-partial">
      <Banner tone="caution" title={`${st.read} of ${st.total} ${st.unit} used · ${gone} skipped`}
        action={file ? <Button onClick={() => onAction?.(src.id, "replace")}><Icon name="upload" />{why === "scanned" ? "Upload a text version" : "Replace file"}</Button>
          : <Button onClick={() => onAction?.(src.id, "reread")}><Icon name="refresh" />Re-read</Button>}>
        {why === "scanned"
          ? <>Corral skipped {st.skipped}. {gone === 1 ? "It’s a scanned image" : "They’re scanned images"} with no text layer, and Corral can’t read text inside images yet. Upload a version with selectable text, exported from the original rather than scanned, to include {gone === 1 ? "it" : "them"}.</>
          : why === "limit" ? <>{st.note} Corral skipped {st.skipped}. Split it into smaller files to include the rest.</>
          : <>{st.note} Corral skipped {st.skipped}. Re-read to try them again.</>}
      </Banner>
      {pages && pages.length > 0 && <PageStrip total={st.total} skipped={pages} why={why} />}
    </div>
  );
}

/** One tick per page: ink for pages Corral used, hatched caution for the ones it skipped. */
export function PageStrip({ total, skipped, why }: { total: number; skipped: number[]; why?: "scanned" | "limit" | "pages" }) {
  const off = new Set(skipped);
  const used = total - off.size;
  return (
    <figure className="k-pages" aria-label={`${used} pages used, ${off.size} skipped`}>
      <span className="k-pages__strip" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className={cx("k-pages__p", off.has(i + 1) && "is-off")} />)}
      </span>
      <figcaption className="k-pages__key">
        <span><i className="k-pages__sw" aria-hidden="true" />{used} used</span>
        <span><i className="k-pages__sw is-off" aria-hidden="true" />{off.size} skipped{why === "scanned" ? " · images, no text" : ""}</span>
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
  const body = st.failure === "unreadable" && st.note ? `${st.note} Save a fresh copy or export it as PDF, then replace it.`
    : lost ? "The file didn’t reach storage, so there’s nothing to try again. Upload it again." : f.fix;
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
            {st.failure === "interrupted" && !lost && <div><dt>Retries</dt><dd>Corral retried on its own, waiting longer each time, until it ran out of tries.</dd></div>}
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
