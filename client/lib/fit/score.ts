/**
 * Fit scoring (M5, ENG-55). A fit score is the sum of a few weighted checks, each measured against a
 * line of the product's knowledge base and backed by evidence Corral read (M4 provenance). Nothing
 * here is a model: it is the shape the API returns and the words the panel says about it.
 */
import type { ProvField, SourceKind } from "@/lib/discovery/provenance";

export type Verdict = "met" | "partly" | "missed" | "unknown";

/** One piece of evidence behind a check: what Corral read, where, and when. */
export type FitEvidence = {
  kind: SourceKind;
  /** A short quote or finding, in the source's words where there is one. */
  text: string;
  quote?: boolean;
  /** Page, file or provider record ("kilima.co.ke/about", "Dropcontact"). */
  where: string;
  at: string; // ISO date
  /** Links the check to a field's provenance row (M4). */
  field?: ProvField;
};

/** The knowledge-base line a check is measured against (M2 sections). */
export type FitBasis = { section: "who" | "pains" | "proof" | "never"; title: string; text: string };

export type FitCheck = {
  id: string;
  /** What Corral checked, as a claim: "Runs three or more cold rooms". */
  label: string;
  weight: number;
  verdict: Verdict;
  points: number;
  /** One line: what Corral found, or why it found nothing. */
  finding: string;
  evidence: FitEvidence[];
  basis: FitBasis;
  /** For `unknown`: the field that would settle it, so the panel can offer "Add it". */
  missing?: { field: ProvField; ask: string };
};

export type FitChange = { at: string; value: number; why: string[] };

export type FitScore = {
  product: string;
  value: number;
  at: string;
  checks: FitCheck[];
  /** Pages of the company's site read for this score, and KB lines it was measured against. */
  pages: number;
  kbLines: number;
  /** Earlier scores, newest first. */
  history?: FitChange[];
  /** The user's own number: used for sorting, filters and segments until cleared. */
  override?: { value: number; by: string; at: string; note?: string };
  /** The user says the score is wrong but hasn't set one: Corral re-reads with the note. */
  disagree?: { by: string; at: string; note: string };
};

/** What the bar and the panel can be doing. `scored` carries a FitScore. */
export type FitStatus =
  | { kind: "scored"; score: FitScore }
  | { kind: "scoring"; pages: number; of: number; checked: number; last?: FitScore }
  | { kind: "none"; why: "queued" | "no-site" | "new"; since?: string }
  | { kind: "error"; code: string; at: string; tries: number; last?: FitScore };

/** The score is the sum of the checks' points (weights add up to 100). */
export function scoreOf(checks: FitCheck[]): number {
  return Math.round(checks.reduce((s, c) => s + c.points, 0));
}

export type Band = "strong" | "possible" | "weak";
export const band = (v: number): Band => (v >= 80 ? "strong" : v >= 60 ? "possible" : "weak");
export const BAND_WORD: Record<Band, string> = { strong: "Strong fit", possible: "Possible fit", weak: "Weak fit" };

export type Confidence = { level: "high" | "medium" | "low"; unknown: FitCheck[]; unknownWeight: number; reason: string };

/**
 * How much the score can be trusted: the share of the weight that has evidence, and how much of the
 * site Corral could read. Low when a quarter of the points rest on nothing, or when it read under 3 pages.
 */
export function confidence(s: FitScore): Confidence {
  const unknown = s.checks.filter((c) => c.verdict === "unknown");
  const unknownWeight = unknown.reduce((a, c) => a + c.weight, 0);
  const level = unknownWeight >= 25 || s.pages < 3 ? "low" : unknownWeight >= 10 || s.pages < 8 ? "medium" : "high";
  const parts: string[] = [];
  if (unknown.length) parts.push(`${unknown.length} of ${s.checks.length} checks have no evidence (${unknownWeight} of 100 points)`);
  if (s.pages < 3) parts.push(s.pages === 1 ? "Corral could only read one page" : `Corral could only read ${s.pages} pages`);
  return { level, unknown, unknownWeight, reason: parts.join("; ") };
}

/** The number the product uses: yours if you set one, else Corral's. */
export const shownValue = (s: FitScore) => s.override?.value ?? s.value;

/** What changed since the previous score, if it moved. */
export function changeOf(s: FitScore): { from: number; to: number; delta: number; at: string; why: string[] } | null {
  const prev = s.history?.[0];
  if (!prev || prev.value === s.value) return null;
  return { from: prev.value, to: s.value, delta: s.value - prev.value, at: prev.at, why: s.history![0].why };
}

/** The line that leads the panel: the band, then the two heaviest checks that held, as found. */
export function summaryLine(s: FitScore): string {
  const held = [...s.checks].filter((c) => c.verdict === "met").sort((a, b) => b.weight - a.weight).slice(0, 2).map((c) => c.finding.replace(/\.$/, ""));
  const lead = BAND_WORD[band(s.value)];
  if (!held.length) return `${lead}. None of the checks held clearly.`;
  return `${lead}. ${held.map((h) => `${h}.`).join(" ")}`;
}

/** The accessible name of a fit bar in any state. */
export function fitLabel(o: { value?: number; state?: "scoring" | "none" | "error"; confidence?: "low"; delta?: number; by?: "you"; text?: string }): string {
  if (o.state === "scoring") return `Fit: ${(o.text ?? "Scoring").toLowerCase()}`;
  if (o.state === "none") return `Fit: ${(o.text ?? "Not scored yet").toLowerCase()}`;
  if (o.state === "error") return "Fit: couldn’t score";
  const bits = [`Fit ${o.value} of 100`];
  if (o.by === "you") bits.push("set by you");
  if (o.confidence === "low") bits.push("low confidence");
  if (o.delta) bits.push(`${o.delta > 0 ? "up" : "down"} ${Math.abs(o.delta)} since the last score`);
  return bits.join(", ");
}

export const VERDICT_WORD: Record<Verdict, string> = { met: "Holds", partly: "Partly", missed: "Doesn't hold", unknown: "No evidence" };

/** Validate a number typed into "Set the fit myself". */
export function overrideIssue(raw: string): string | null {
  if (!raw.trim()) return "Enter a number from 0 to 100.";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return "Use a whole number from 0 to 100.";
  return null;
}

/** "none" reasons, in words (detail), and short for the 128px table column. */
export const NONE_SHORT: Record<"queued" | "no-site" | "new", string> = { queued: "Queued", "no-site": "No website", new: "Not scored" };
export const NONE_TEXT: Record<"queued" | "no-site" | "new", string> = {
  queued: "In line to be scored",
  "no-site": "No website to read",
  new: "Not scored yet",
};

/** The extra props a fit bar takes (all optional; a plain `value` renders exactly as in M1). */
export type FitBarMeta = { state?: "scoring" | "none" | "error"; confidence?: "low"; delta?: number; by?: "you"; text?: string };

/** What the bar shows for a status: the number in use, and how to mark it. */
export function barOf(st: FitStatus, short = false): { value: number } & FitBarMeta {
  if (st.kind === "scoring") return { value: 0, state: "scoring", text: st.last ? "Rescoring" : "Scoring" };
  if (st.kind === "none") return { value: 0, state: "none", text: (short ? NONE_SHORT : NONE_TEXT)[st.why] };
  if (st.kind === "error") return { value: st.last ? shownValue(st.last) : 0, state: "error", text: short ? "Failed" : undefined };
  const s = st.score;
  const ch = changeOf(s);
  return {
    value: shownValue(s),
    by: s.override ? "you" : undefined,
    confidence: !s.override && confidence(s).level === "low" ? "low" : undefined,
    delta: !s.override && ch ? ch.delta : undefined,
  };
}

/** The most a low-confidence score could reach if every check without evidence held. */
export const ceilingOf = (s: FitScore) => s.value + confidence(s).unknownWeight;
