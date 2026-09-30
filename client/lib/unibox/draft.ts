/**
 * Copilot drafts and sending in the Unibox (M7, ENG-57). Plain module: no React.
 */

/** Where Corral's draft for a thread is. */
export type DraftKind = "none" | "drafting" | "ready" | "low" | "refused" | "edited";
/** Where sending the reply is. `undo`: queued, cancellable for UNDO_SECONDS. */
export type SendKind = "idle" | "undo" | "sending" | "sent" | "failed" | "disconnected" | "conflict";

export const UNDO_SECONDS = 10;

/** A claim in the draft and the knowledge-base line it came from (M2). */
export type Cite = { n: number; section: string; text: string; source: string };

/** Never-say rules for the product (M2), as matchers. */
export type Rule = { rule: string; match: RegExp };
export const NEVER_SAY: Rule[] = [
  { rule: "Doesn't call ColdTrace “FDA approved”", match: /\bFDA[- ]approved\b|\bFDA approval\b/i },
  { rule: "Doesn't promise same-day installation", match: /\bsame[- ]day install|\binstall(ed|ation)? (today|tomorrow|same day)\b/i },
];
/** Rules a text breaks (your edit, or a reply that asks for them). */
export const neverSayHits = (text: string, rules: Rule[] = NEVER_SAY) => rules.filter((r) => r.match.test(text));

/** Prices the knowledge base disagrees on (M2 conflict: $35 vs $39). */
export const PRICE_CONFLICT = { values: ["$35", "$39"], where: "Pricing and terms" };
/** A price in the text while the KB has a price conflict. */
export function priceIssue(text: string): string | undefined {
  const m = text.match(/\$\s?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  return `${m[0].replace(/\s/, "")} a month: the knowledge base has two prices (${PRICE_CONFLICT.values.join(" and ")}). Check before sending.`;
}

/** Everything a text needs checked before it sends. */
export type Check = { kind: "never-say" | "price" | "empty" | "link"; text: string; blocks: boolean };
export function checksOf(text: string): Check[] {
  const out: Check[] = [];
  if (!text.trim()) out.push({ kind: "empty", text: "The reply is empty.", blocks: true });
  for (const r of neverSayHits(text)) out.push({ kind: "never-say", text: `${r.rule.replace(/^Doesn't /, "Says what the Never-say list rules out: doesn't ")}.`, blocks: true });
  const p = priceIssue(text); if (p) out.push({ kind: "price", text: p, blocks: false });
  return out;
}
export const canSend = (text: string) => !checksOf(text).some((c) => c.blocks);

/** Paragraphs from an edited text. */
export const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
/** Draft text with [n] markers removed (what actually sends). */
export const stripMarks = (s: string) => s.replace(/\s?\[\d+\]/g, "");
/** Split a paragraph into text and cite markers. */
export function marks(p: string): (string | number)[] {
  const out: (string | number)[] = []; let i = 0;
  for (const m of p.matchAll(/\[(\d+)\]/g)) { out.push(p.slice(i, m.index)); out.push(Number(m[1])); i = (m.index ?? 0) + m[0].length; }
  out.push(p.slice(i));
  return out.filter((x) => x !== "");
}
/** How many sentences differ between Corral's draft and yours (a rough count for "Edited by you"). */
export function changedSentences(a: string, b: string): number {
  const s = (t: string) => stripMarks(t).split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter(Boolean);
  const A = s(a); const B = s(b);
  const added = B.filter((x) => !A.includes(x)).length; const removed = A.filter((x) => !B.includes(x)).length;
  return Math.max(added, removed);
}
