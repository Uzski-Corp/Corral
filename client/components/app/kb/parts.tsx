"use client";
import { useEffect, useId, useState } from "react";
import { FAILURE, STAGES, overallPercent, stageLabel, type SourceKind } from "@/lib/kb/upload";
import { cleanPassage, passageLabel } from "@/lib/kb/passages";
import { Icon } from "../icons";
import { Avatar, Monogram, cx } from "../primitives";
import type { Source, SourceStatus } from "./data";

/* File tile: the format, set in mono on a paper-coloured tile. Neutral on purpose: status colour
   stays reserved for things that need you, so a list of forty PDFs reads calm.
   A web source keeps that same tile and shows the site's favicon, so a crawled host is
   recognisable at a glance. No favicon, or it fails to load: the globe.            */
const TILE: Record<SourceKind, string> = { pdf: "PDF", docx: "DOC", md: "MD", url: "" };
const ICON = { 20: 11, 28: 14, 36: 16 } as const;

/** A public hostname, or nothing. Favicon requests only go out for this shape. */
export function faviconHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const h = host.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h)) return undefined;
  return h;
}

/** Google's favicon service reads the site's own icon, including pages we crawled. */
export function faviconSrc(host: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

function SiteMark({ host, icon }: { host: string; icon: number }) {
  const [off, setOff] = useState(false);
  if (off) return <Icon name="globe" size={icon} />;
  // Arbitrary crawled hosts: next/image can't whitelist them. The tile stays the globe if this fails.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={faviconSrc(host)} alt="" width={icon} height={icon} referrerPolicy="no-referrer" onError={() => setOff(true)} />;
}

/** `label` overrides the format text (e.g. "KEY" for a file Corral can't read). `host` draws a web source's favicon. */
export function FileTile({ kind, size = 28, label, host }: { kind: SourceKind; size?: 20 | 28 | 36; label?: string; host?: string }) {
  const icon = ICON[size];
  const site = kind === "url" ? faviconHost(host) : undefined;
  return (
    <span className={cx("k-tile", `k-tile--${kind}`, size !== 28 && `k-tile--${size}`, site && "k-tile--mark")} aria-hidden="true">
      {label ? label.slice(0, 4) : site ? <SiteMark host={site} icon={icon} /> : kind === "url" ? <Icon name="globe" size={icon} /> : TILE[kind]}
    </span>
  );
}
export const kindLabel = (k: SourceKind) => (k === "url" ? "Web page" : k === "md" ? "Markdown" : k.toUpperCase());
/** "PDF · 18 pages · 4.2 MB"; a meta that already names its kind ("Markdown · 6.2 KB") isn't said twice. */
export const kindMeta = (s: Pick<Source, "kind" | "meta">) => (s.meta.startsWith(kindLabel(s.kind)) ? s.meta : [kindLabel(s.kind), s.meta].filter(Boolean).join(" · "));

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
        <span className="k-state__line"><span>{stageLabel(st.stage, src.kind)}{(st.attempts ?? 0) > 1 && <span className="k-state__try"> · try {st.attempts}</span>}</span><span className="c-mono">{pct}%</span></span>
        {!compact && <Progress value={pct} label={`${src.name}: ${stageLabel(st.stage, src.kind)}, ${pct}%`} />}
      </span>
    );
  }
  if (st.s === "partial") return <span className="k-state is-caution"><Icon name="alert" size={12} />Partly read{st.total !== undefined ? <> · {st.read} of {st.total} {st.unit}</> : " · end skipped"}</span>;
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

/* ------------------------------------------------------------ people (M11, gap 6)
   Who added a source. A known person gets their photo or initials; someone we can't name yet (no members
   endpoint) gets a neutral outlined person mark and "Teammate": deliberate, not an error. The same slot
   takes a name and photo later without the row moving. */
export const byName = (by: Source["by"], form: "first" | "full" = "first") => (by.unknown ? "Teammate" : form === "first" ? by.name.split(" ")[0] : by.name);
export function PersonMark({ by }: { by: Source["by"] }) {
  if (by.avatar) return <Avatar id={by.avatar} />;
  if (by.unknown) return <span className="c-av c-mono-av c-mono-av--off k-anon" aria-hidden="true"><Icon name="user" size={11} /></span>;
  return <Monogram name={by.name} />;
}

/* ------------------------------------------------------------ passages (M11, gaps 12–13)
   A short locator ("p. 14") sits in the narrow column. A markdown heading label goes on its own mono line
   above the passage: one line with an ellipsis, the whole heading on hover and on keyboard focus. The text
   is the server's with the markdown markers taken out; headings inside it render as light run-in headings. */
/** `inert`: inside another control (a search result button), so the heading is a plain title, not a stop. */
export function PassageLabel({ loc, ordinal, inert }: { loc: string | null; ordinal: number; inert?: boolean }) {
  const l = passageLabel(loc, ordinal);
  const [open, setOpen] = useState(false);
  const id = useId();
  if (l.kind === "short") return <span className="c-mono k-ploc">{l.text}</span>;
  if (inert) return <span className="k-phead" title={l.text}><span className="k-phead__txt">{l.text}</span></span>;
  return (
    <span className="k-phead" tabIndex={0} aria-describedby={open ? id : undefined} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <span className="k-phead__txt">{l.text}</span>
      {open && <span role="tooltip" id={id} className="k-phead__tip">{l.text}</span>}
    </span>
  );
}
export function PassageText({ text, loc, clamp = true }: { text: string; loc?: string | null; clamp?: boolean }) {
  const blocks = cleanPassage(text, loc ?? undefined);
  return (
    <div className={cx("k-ptext", clamp && "is-clamped")}>
      {blocks.map((b, i) => ("h" in b ? <b key={i} className="k-ptext__h">{b.h}</b> : <p key={i}>{b.p}</p>))}
    </div>
  );
}
export function PassageItem({ loc, ordinal, text }: { loc: string | null; ordinal: number; text: string }) {
  const heading = passageLabel(loc, ordinal).kind === "heading";
  return (
    <li className={cx(heading && "is-heading")}>
      <PassageLabel loc={loc} ordinal={ordinal} />
      <PassageText text={text} loc={loc} />
    </li>
  );
}
