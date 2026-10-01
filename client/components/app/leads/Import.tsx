"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "../Overlays";
import { Button, Receipt, Receipts, cx } from "../primitives";
import { Icon } from "../icons";
import { RadioGroup, Select } from "../Form";
import { Banner } from "../States";
import { DropZone } from "../kb/Upload";
import { FileTile } from "../kb/parts";
import {
  DUP_POLICY, FIELDS, checkCsvFile, checkCsvShape, fieldLabel, findDuplicates, guessField, guessMapping, importPlan, mappingIssueText, mappingIssues, parseCsv, rowErrors,
  type Csv, type DupPolicy, type Existing, type Mapping, type Target,
} from "@/lib/leads/import";
import { formatBytes } from "@/lib/kb/upload";
import { errorDetail } from "@/lib/api/errors";
import type { ApiImport, ImportFileInput } from "@/lib/api/leads";
import type { ImportRunner } from "./live";

export type ImportStep = "file" | "map" | "review" | "running" | "done";
export type ImportFile = { name: string; size: number; csv: Csv; /** the file itself, for a live upload */ blob?: Blob };
export type ImportSeed = { step: ImportStep; file?: ImportFile; mapping?: Mapping; error?: { title: string; fix: string }; policy?: DupPolicy; progress?: number };

const STEPS: [ImportStep, string][] = [["file", "File"], ["map", "Columns"], ["review", "Review"]];
const TARGETS = [{ value: "skip", label: "Don't import" }, ...FIELDS.map((f) => ({ value: f.id, label: f.label, meta: f.group }))];

/**
 * Import CSV: pick a file → map columns → review duplicates and bad rows → import in the background.
 * Nothing is written until the last step; every problem says which row or column and the one fix.
 */
export function ImportDialog({ open, onClose, existing, seed = { step: "file" }, onDone, onSegment, sample, inline, runner }: {
  open: boolean; onClose: () => void; existing: Existing[]; seed?: ImportSeed; inline?: boolean;
  /** Called when the import finishes, with the summary line for the toast */ onDone?: (summary: string) => void;
  onSegment?: (importId?: string) => void; /** review/demo only: offers a sample file */ sample?: () => ImportFile;
  /** Live (ENG-81): the server's dry run for the review numbers, then the real upload and its progress. */ runner?: ImportRunner;
}) {
  const [step, setStep] = useState<ImportStep>(seed.step);
  const [file, setFile] = useState<ImportFile | undefined>(seed.file);
  const [mapping, setMapping] = useState<Mapping>(seed.mapping ?? []);
  const [error, setError] = useState(seed.error);
  const [policy, setPolicy] = useState<DupPolicy>(seed.policy ?? "fill");
  const [progress, setProgress] = useState(seed.progress ?? 0);

  const take = (f: ImportFile) => { setFile(f); setMapping(guessMapping(f.csv)); setError(undefined); setStep("map"); };
  const onFiles = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    const ok = checkCsvFile(f); if (!ok.ok) { setError(ok); return; }
    const csv = parseCsv(await f.text()); const shape = checkCsvShape(csv); if (!shape.ok) { setError(shape); return; }
    take({ name: f.name, size: f.size, csv, blob: f });
  };
  const issues = useMemo(() => mappingIssues(mapping), [mapping]);
  const local = useMemo(() => (file ? importPlan(file.csv, mapping, existing, policy) : undefined), [file, mapping, existing, policy]);
  // Live: the server's plan for this file, mapping and policy (a dry run stores nothing).
  const input = useMemo<ImportFileInput | null>(() => (runner && file ? { file: file.blob ?? csvBlob(file.csv), name: file.name, mapping, policy } : null), [runner, file, mapping, policy]);
  const [server, setServer] = useState<{ for: ImportFileInput; plan: NonNullable<typeof local> } | null>(null);
  const [finished, setFinished] = useState<ApiImport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!runner || !input || step !== "review") return;
    const c = new AbortController();
    void runner.plan(input, c.signal).then((r) => {
      if (c.signal.aborted || !r.ok) return;
      const p = r.value.plan;
      setServer({ for: input, plan: { total: p.total, create: p.create, update: p.update, skipped: p.skipped, errors: p.errors, inFile: p.inFile, existingDup: p.existing } });
    });
    return () => c.abort();
  }, [runner, input, step]);
  useEffect(() => () => abort.current?.abort(), []);
  const done = finished ? { ...local!, create: finished.created, update: finished.updated, skipped: finished.skipped, errors: finished.errors } : undefined;
  const plan = done ?? (server && server.for === input ? server.plan : local);
  const run = () => {
    setStep("running"); setProgress(0); setFailure(null);
    if (runner && input) {
      const c = new AbortController(); abort.current = c;
      void runner.run(input, (pct) => setProgress(Math.round(pct)), c.signal).then((r) => {
        if (c.signal.aborted) return;
        if (!r.ok || r.value.status === "failed") {
          setFailure(r.ok ? r.value.failure ?? r.value.note ?? "The import stopped." : errorDetail(r.error)); setStep("review"); return;
        }
        setFinished(r.value); setStep("done");
        onDone?.(`Imported ${r.value.created + r.value.updated} companies from ${file!.name}`);
      });
      return;
    }
    let p = 0; const t = setInterval(() => { p += 17; setProgress(Math.min(100, p)); if (p >= 100) { clearInterval(t); setStep("done"); onDone?.(`Imported ${plan!.create + plan!.update} companies from ${file!.name}`); } }, 260);
  };

  const title = step === "done" ? "Import finished" : step === "running" ? "Importing…" : "Import companies from CSV";
  const desc = step === "file" ? "Corral reads each company's website and scores it, the same as companies it finds itself." : file ? <><b>{file.name}</b> · {file.csv.rows.length.toLocaleString("en")} rows · {formatBytes(file.size)}</> : undefined;
  const footer = step === "file" ? <Button onClick={onClose}>Cancel</Button>
    : step === "map" ? <><span className="l-imp__why">{issues.length ? `Fix ${issues.length} ${issues.length === 1 ? "thing" : "things"} above to continue` : `${mapping.filter((m) => m !== "skip").length} of ${mapping.length} columns will be imported`}</span>
      <Button onClick={() => { setStep("file"); setFile(undefined); }}>Change file</Button><Button variant="primary" disabled={issues.length > 0} onClick={() => setStep("review")}>Continue</Button></>
    : step === "review" && plan ? <><Button onClick={() => setStep("map")}>Back</Button><Button variant="primary" disabled={plan.create + plan.update === 0} onClick={run}>{plan.update ? `Import ${plan.create}, update ${plan.update}` : `Import ${plan.create} companies`}</Button></>
    : step === "running" ? <><span className="l-imp__why">Keeps going if you close this.</span><Button onClick={onClose}>Hide</Button></>
    : <><Button onClick={onClose}>View companies</Button>{onSegment && <Button variant="primary" onClick={() => onSegment(finished?.id)}><Icon name="layers" />Make a segment from this import</Button>}</>;

  return (
    <Dialog open={open} onClose={onClose} width={step === "map" || step === "review" ? 760 : 560} inline={inline} title={title} description={desc} footer={footer}>
      {(step === "file" || step === "map" || step === "review") && (
        <ol className="l-steps" aria-label="Import steps">{STEPS.map(([s, l], i) => {
          const at = STEPS.findIndex(([x]) => x === step);
          return <li key={s} className={cx(i < at && "is-done", i === at && "is-on")} aria-current={i === at ? "step" : undefined}><span className="c-mono">{i < at ? "✓" : i + 1}</span>{l}</li>;
        })}</ol>
      )}

      {step === "file" && <>
        <DropZone onFiles={onFiles} multiple={false} accept=".csv,.tsv,.txt,text/csv" lead="Drop a CSV here, or" hint="CSV or TSV with a header row · up to 20 MB · 50,000 rows" />
        {error && <Banner tone="error" title={error.title}>{error.fix}</Banner>}
        <div className="l-imp__need">
          <span className="l-imp__label">Corral needs one of</span><span><b>Company name</b> or <b>Website</b></span>
          <span className="l-imp__label">Helps if you have</span><span>Contact name, work email, job title, country</span>
          <span className="l-imp__label">Duplicates</span><span>Matched by email, then by website. You choose what happens before anything is saved.</span>
        </div>
        {sample && <button type="button" className="c-link k-linkbtn l-imp__sample" onClick={() => take(sample())}>Try it with a sample trade-show export</button>}
      </>}

      {step === "map" && file && <>
        {issues.length > 0 && <Banner tone="error" title={`${issues.length} ${issues.length === 1 ? "problem" : "problems"} with the columns`}>
          <ul className="l-imp__issues">{issues.map((x, i) => <li key={i}>{mappingIssueText(x, file.csv.headers)}</li>)}</ul></Banner>}
        <div className="l-map" role="table" aria-label="Column mapping">
          <div className="l-map__row l-map__head" role="row"><span role="columnheader">Column in your file</span><span role="columnheader" aria-label="maps to" /><span role="columnheader">Corral field</span></div>
          {file.csv.headers.map((h, i) => {
            const t = mapping[i] ?? "skip";
            const bad = issues.some((x) => (x.kind === "twice" && x.cols.includes(i)) || (x.kind === "name-split" && ["name", "first", "last"].includes(t)));
            const samples = file.csv.rows.slice(0, 3).map((r) => r[i]).filter(Boolean);
            return (
              <div key={i} role="row" className={cx("l-map__row", t === "skip" && "is-skip", bad && "is-error")}>
                <span role="cell" className="l-map__src"><span className="c-strong">{h || `Column ${i + 1}`}</span><span className="l-map__samples c-mono">{samples.length ? samples.join(" · ") : "empty in the first rows"}</span></span>
                <span role="cell" className="l-map__arrow" aria-hidden="true"><Icon name="arrow" size={12} /></span>
                <span role="cell" className="l-map__dst"><Select label={`Map “${h}” to`} value={t} width="100%" options={TARGETS} onChange={(v) => setMapping(mapping.map((m, j) => (j === i ? (v as Target) : m)))} />
                  <span className="l-map__how">{t === "skip" ? "Not imported" : guessField(h) === t ? "Matched by name" : guessField(h, samples) === t ? "Matched by values" : "Set by you"}</span></span>
              </div>
            );
          })}
        </div>
      </>}

      {step === "review" && failure && <Banner tone="error" title="The import didn’t finish">{failure}</Banner>}
      {step === "review" && file && plan && <Review file={file} mapping={mapping} existing={existing} policy={policy} setPolicy={setPolicy} plan={plan} />}

      {step === "running" && plan && <div className="l-imp__run">
        <div className="l-imp__file"><FileTile kind="md" label="CSV" /><span><span className="c-strong">{file?.name}</span><span className="c-muted">Adding {plan.create + plan.update} companies · {progress}%</span></span></div>
        <span className="k-bar" role="progressbar" aria-label="Import progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></span>
        <p className="c-muted">Companies appear in the table as they&rsquo;re added. Corral scores each one as it reads its website, usually within a few minutes.</p>
      </div>}

      {step === "done" && plan && <div className="l-imp__done">
        <Receipts>
          <Receipt meta="scoring now">{plan.create} companies added</Receipt>
          {plan.update > 0 && <Receipt meta={DUP_POLICY[policy].label.toLowerCase()}>{plan.update} already in Corral, updated</Receipt>}
          {plan.skipped > 0 && <Receipt meta="kept the first">{plan.skipped} duplicates skipped</Receipt>}
        </Receipts>
        {plan.errors > 0 && <p className="l-imp__left"><Icon name="alert" size={12} />{plan.errors} rows weren&rsquo;t imported. <button type="button" className="c-link k-linkbtn" onClick={finished?.hasErrorsFile && runner ? () => window.open(runner.errorsUrl(finished.id), "_blank") : undefined}>Download them as CSV</button> to fix and import again.</p>}
      </div>}
    </Dialog>
  );
}

function Review({ file, mapping, existing, policy, setPolicy, plan }: {
  file: ImportFile; mapping: Mapping; existing: Existing[]; policy: DupPolicy; setPolicy: (p: DupPolicy) => void; plan: ReturnType<typeof importPlan>;
}) {
  const errs = rowErrors(file.csv, mapping);
  const dups = findDuplicates(file.csv, mapping, existing).filter((d) => d.kind === "existing");
  return (
    <div className="l-review">
      <ul className="l-review__sum">
        <li><span className="l-review__n">{plan.create}</span><span>new companies</span></li>
        <li><span className="l-review__n">{plan.existingDup}</span><span>already in Corral</span></li>
        <li><span className="l-review__n">{plan.inFile}</span><span>repeated in this file</span></li>
        <li className={cx(plan.errors > 0 && "is-error")}><span className="l-review__n">{plan.errors}</span><span>can&rsquo;t be imported</span></li>
      </ul>
      {plan.existingDup > 0 && <section className="l-review__sec"><h3>{plan.existingDup} companies are already in Corral</h3>
        <p className="c-muted">Matched by {dups.every((d) => d.by === "email") ? "email" : "email or website"}: {dups.slice(0, 4).map((d) => d.match).join(", ")}{dups.length > 4 ? ` and ${dups.length - 4} more` : ""}. Their history, status and sequences are never touched.</p>
        <RadioGroup label="Companies already in Corral" value={policy} onChange={(v) => setPolicy(v as DupPolicy)}
          options={(Object.keys(DUP_POLICY) as DupPolicy[]).map((k) => ({ value: k, label: DUP_POLICY[k].label, description: DUP_POLICY[k].help }))} /></section>}
      {plan.inFile > 0 && <p className="l-review__note"><Icon name="layers" size={12} />{plan.inFile} rows repeat an earlier row in this file (same email). Corral keeps the first one.</p>}
      {errs.length > 0 && <section className="l-review__sec"><h3>{plan.errors} rows can&rsquo;t be imported</h3>
        <p className="c-muted">The rest import without them. Fix these in your file and import it again; Corral skips what&rsquo;s already in.</p>
        <div className="l-errs" role="table" aria-label="Rows that can't be imported">
          <div className="l-errs__row l-errs__head" role="row"><span role="columnheader">Row</span><span role="columnheader">Column</span><span role="columnheader">Value</span><span role="columnheader">Problem</span></div>
          {errs.map((e, i) => <div key={i} className="l-errs__row" role="row"><span role="cell" className="c-mono">{e.row}</span><span role="cell">{fieldLabel(e.field)}</span><span role="cell" className="c-mono">{e.value || "empty"}</span><span role="cell" className="l-errs__msg">{e.message}</span></div>)}
        </div>
        <button type="button" className="c-link k-linkbtn l-review__dl">Download these {plan.errors} rows</button></section>}
    </div>
  );
}

/** A parsed file back to CSV, for a live import of a file that came without its bytes. */
function csvBlob(csv: Csv): Blob {
  const q = (c: string) => (/[",\n;\t]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return new Blob([[csv.headers, ...csv.rows].map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
}
