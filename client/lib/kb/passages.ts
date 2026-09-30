/**
 * Passage labels and text (M11, gaps 12–13). The API's PassageOut / SearchHit carry `loc` and `text` only:
 * `loc` is "p. 14" / "§2" for files and web pages, but a markdown passage is located by its heading
 * ("ColdTrace T4 wireless temperature sensors"), and its `text` still has the markdown markers.
 *
 * - passageLabel: a short locator stays in the narrow column; a heading becomes a heading label above the
 *   passage (one line, ellipsis, the full heading on hover and focus). No `loc` falls back to "§n".
 * - cleanPassage: markdown headings become light headings inside the passage (a leading heading that repeats
 *   the label is dropped), list markers and emphasis markers go; everything else is the server's text.
 */
export const SHORT_LOC = 10;

export type PassageLabel = { kind: "short"; text: string } | { kind: "heading"; text: string };

export function passageLabel(loc: string | null | undefined, ordinal: number): PassageLabel {
  const l = (loc ?? "").replace(/^#+\s*/, "").trim();
  if (!l) return { kind: "short", text: `§${ordinal + 1}` };
  return l.length <= SHORT_LOC ? { kind: "short", text: l } : { kind: "heading", text: l };
}

export type PassageBlock = { h: string; level: number } | { p: string };

const inline = (s: string) => s
  .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2")
  .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

/** The server's passage text as blocks: headings (without #) and paragraphs (list items keep a bullet). */
export function cleanPassage(text: string, label?: string): PassageBlock[] {
  const out: PassageBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ p: para.join(" ") }); para = []; } };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ h: inline(h[2].replace(/\s+#+\s*$/, "")), level: h[1].length }); continue; }
    const li = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { flush(); out.push({ p: `• ${inline(li[2])}` }); continue; }
    para.push(inline(line));
  }
  flush();
  const first = out[0];
  if (first && "h" in first && label && first.h.toLowerCase() === label.replace(/^#+\s*/, "").trim().toLowerCase()) out.shift();
  return out;
}

/** The same text on one line (search result rows, a clamp that doesn't care about blocks). */
export const plainPassage = (text: string, label?: string) =>
  cleanPassage(text, label).map((b) => ("h" in b ? `${b.h}.` : b.p)).join(" ");
