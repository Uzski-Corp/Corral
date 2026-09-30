/**
 * SourceOut (lib/api/kb.ts) → Bau's `Source` (components/app/kb/data.ts), so the knowledge-base
 * components render API data exactly as they render the sample data. Pure, and pinned by map.test.ts.
 *
 * - processing: `stage` + `stage_pct` + `note`. A queued source (`attempts` 0) has no stage yet; it
 *   shows the first stage the worker runs (files are checked first, web pages fetched first).
 * - partial: `pages_read`/`pages_total`/`skipped`/`note`, and `skipped_reason` picks the copy
 *   (scanned → "Upload a text version", size-limit → "Split it", unreadable web pages → "Re-read").
 *   `mixed` has no design yet, so it falls back to reading the note, as before the field existed.
 * - failed: `failure`, `failure_stage` → at, `note`, `processed_at` → when ("Today, 09:14").
 * - meta: "38 pages · 11 MB" for files ("11 MB" when the page count isn't known), "1 page" or
 *   "Whole section · 40 pages" for web pages. The "re-read weekly" in Bau's sample meta is left out
 *   because the API doesn't re-read on a schedule yet.
 */
import type { ApiSource, SkipReason } from "../api/kb";
import { agoLabel, dayLabel, momentLabel, parseTime } from "../time";
import { formatBytes, partialReason, type PartialReason } from "./upload";
import type { Source, SourceStatus } from "@/components/app/kb/data";

export type Person = { id: string; name: string };
export type MapContext = {
  now: Date;
  /** The signed-in person, so their sources say "Added by <you>". */
  me?: Person;
  /** Other people we know the names of (none yet: there's no members endpoint). */
  people?: readonly Person[];
};

/** Who added it: the signed-in person, someone we know, or "a teammate" (no members endpoint yet). */
export const TEAMMATE = "a teammate";

export function reasonOf(reason: SkipReason | null, note: string | undefined, kind: Source["kind"]): PartialReason {
  if (reason === "scanned") return "scanned";
  if (reason === "size-limit") return "limit";
  if (reason === "unreadable") return "pages";
  return partialReason(note, kind);
}

export function hostOf(url: string | null): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

export function metaOf(s: ApiSource): string {
  if (s.kind === "url") {
    const pages = s.pagesTotal ? plural(s.pagesTotal, "page") : undefined;
    return s.scope === "section" ? ["Whole section", pages].filter(Boolean).join(" · ") : pages ?? "1 page";
  }
  return [s.pagesTotal ? plural(s.pagesTotal, "page") : undefined, s.byteSize ? formatBytes(s.byteSize) : undefined].filter(Boolean).join(" · ");
}

export function statusOf(s: ApiSource, now: Date): SourceStatus {
  const note = s.note ?? undefined;
  if (s.status === "ready") return { s: "ready" };
  if (s.status === "processing") {
    const stage = s.stage ?? (s.kind === "url" ? "upload" : "scan");
    return { s: "processing", stage, pct: s.stage ? Math.min(100, Math.max(0, s.stagePct)) : 0, ...(note ? { note } : {}) };
  }
  if (s.status === "partial") {
    const total = s.pagesTotal ?? 0;
    return {
      s: "partial", read: s.pagesRead ?? 0, total, unit: "pages", note: note ?? "", skipped: s.skipped ?? "",
      why: reasonOf(s.skippedReason, note, s.kind),
    };
  }
  const when = parseTime(s.processedAt);
  return {
    s: "failed", failure: s.failure ?? "interrupted", at: s.failureStage ?? s.stage ?? "upload",
    ...(note ? { note } : {}), ...(when ? { when: momentLabel(when, now) } : {}),
  };
}

export function byOf(userId: string | null, ctx: MapContext): Source["by"] {
  if (userId && ctx.me?.id === userId) return { name: ctx.me.name };
  const known = userId ? ctx.people?.find((p) => p.id === userId) : undefined;
  return { name: known?.name ?? TEAMMATE };
}

export function toSource(s: ApiSource, ctx: MapContext): Source {
  const created = parseTime(s.createdAt) ?? ctx.now;
  const updated = parseTime(s.processedAt) ?? parseTime(s.updatedAt) ?? created;
  return {
    id: s.id, name: s.name, kind: s.kind, host: s.kind === "url" ? hostOf(s.url) : undefined,
    meta: metaOf(s), passages: s.passageCount, cited: 0,
    by: byOf(s.addedByUserId, ctx), added: dayLabel(created, ctx.now), updated: agoLabel(updated, ctx.now),
    status: statusOf(s, ctx.now), attempts: s.attempts,
  };
}

/** Newest first, the order the API returns and the sample data uses. */
export function toSources(list: readonly ApiSource[], ctx: MapContext): Source[] {
  return list.filter((s) => !s.deletedAt).map((s) => toSource(s, ctx));
}
