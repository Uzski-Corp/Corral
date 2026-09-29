"use client";
import { useEffect } from "react";
import { FAILURE, STAGES, overallPercent, stageLabel, type SourceKind } from "@/lib/kb/upload";
import { Icon } from "../icons";
import { cx } from "../primitives";
import type { Source, SourceStatus } from "./data";

/* File tile: the format, set in mono on a paper-coloured tile. Neutral on purpose: status colour
   stays reserved for things that need you, so a list of forty PDFs reads calm.            */
const TILE: Record<SourceKind, string> = { pdf: "PDF", docx: "DOC", md: "MD", url: "" };
/** `label` overrides the format text (e.g. "KEY" for a file Corral can't read). */
export function FileTile({ kind, size = 28, label }: { kind: SourceKind; size?: 20 | 28 | 36; label?: string }) {
  return (
    <span className={cx("k-tile", `k-tile--${kind}`, size !== 28 && `k-tile--${size}`)} aria-hidden="true">
      {label ? label.slice(0, 4) : kind === "url" ? <Icon name="globe" size={size === 36 ? 16 : size === 20 ? 11 : 14} /> : TILE[kind]}
    </span>
  );
}
export const kindLabel = (k: SourceKind) => (k === "url" ? "Web page" : k === "md" ? "Markdown" : k.toUpperCase());

/** Thin progress rule. `value` undefined = indeterminate (the scan step has no percent). */
export function Progress({ value, label, tone }: { value?: number; label: string; tone?: "error" }) {
  return (
    <span className={cx("k-bar", value === undefined && "is-indet", tone && `is-${tone}`)} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span style={value === undefined ? undefined : { width: `${value}%` }} />
    </span>
  );
}

/** Status for a source row. Ready rows stay quiet ("46 passages"); only exceptions get colour. */
export function SourceState({ src, compact }: { src: Source; compact?: boolean }) {
  const st = src.status;
  if (st.s === "ready") return <span className="k-state"><span className="k-dot is-ok" aria-hidden="true" />{src.passages} passages</span>;
  if (st.s === "processing") {
    const pct = overallPercent(st.stage, st.pct);
    return (
      <span className="k-state k-state--live">
        <span className="k-state__line"><span>{stageLabel(st.stage, src.kind)}</span><span className="c-mono">{pct}%</span></span>
        {!compact && <Progress value={pct} label={`${src.name}: ${stageLabel(st.stage, src.kind)}, ${pct}%`} />}
      </span>
    );
  }
  if (st.s === "partial") return <span className="k-state is-caution"><Icon name="alert" size={12} />Partly read · {st.read} of {st.total} {st.unit}</span>;
  return <span className="k-state is-negative"><Icon name="alert" size={12} />{FAILURE[st.failure].title}</span>;
}

export const needsAttention = (s: Source) => s.status.s === "partial" || s.status.s === "failed";
export const isBusy = (s: Source) => s.status.s === "processing";

/** Advances "processing" sources through the pipeline, like ENG-66 progress events would. */
export function advance(st: SourceStatus, passages: number): { status: SourceStatus; passages?: number } {
  if (st.s !== "processing") return { status: st };
  const step = st.stage === "embed" ? 20 : st.stage === "scan" ? 50 : 14;
  const pct = st.pct + step;
  if (pct < 100) return { status: { ...st, pct, note: st.note && st.stage === "parse" ? `Page ${Math.min(40, 12 + Math.round(pct / 4))} of about 40` : st.note } };
  const next = STAGES[STAGES.indexOf(st.stage) + 1];
  if (!next) return { status: { s: "ready" }, passages };
  return { status: { s: "processing", stage: next, pct: 0, note: st.note } };
}

/** setInterval while `active`; `fn` should be stable (useCallback) or it restarts every render. */
export function useTicker(active: boolean, ms: number, fn: () => void) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [active, ms, fn]);
}
