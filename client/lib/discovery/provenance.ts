/**
 * Provenance (M4): where each piece of company and contact data came from, when it was last
 * checked, and whether it's stale. Every field keeps a chain of evidence: the first entry is where
 * the value was found, the rest confirmed or changed it. Pure helpers, no React.
 */

export type SourceKind = "search" | "site" | "corral" | "hunter" | "dropcontact" | "zerobounce" | "csv" | "you";
export const SOURCE: Record<SourceKind, { label: string; short: string }> = {
  search: { label: "Web search (Serper)", short: "Search" },
  site: { label: "The company's website", short: "Site" },
  corral: { label: "Corral, from the website", short: "Corral" },
  hunter: { label: "Hunter", short: "Hunter" },
  dropcontact: { label: "Dropcontact", short: "Dropcontact" },
  zerobounce: { label: "ZeroBounce", short: "ZeroBounce" },
  csv: { label: "Your CSV import", short: "CSV" },
  you: { label: "You", short: "You" },
};

export type ProvField = "industry" | "size" | "country" | "person" | "title" | "email" | "phone" | "fit";
export const FIELD_LABEL: Record<ProvField, string> = {
  industry: "Industry", size: "Size", country: "Country", person: "Decision-maker", title: "Title", email: "Work email", phone: "Phone", fit: "Fit",
};
/** Days before a field is worth re-checking. People move; companies rarely change industry. */
export const STALE_AFTER: Record<ProvField, number> = {
  email: 90, person: 180, title: 180, phone: 180, fit: 90, size: 365, industry: 365, country: 365,
};

export type Evidence = {
  kind: SourceKind;
  /** What happened, in words: "Listed on the Contact page", "Mailbox exists (SMTP)". */
  what: string;
  url?: string;
  /** ISO date (yyyy-mm-dd). */
  at: string;
  /** 0–100, when the provider gives one. */
  confidence?: number;
};
export type FieldProv = { field: ProvField; value: string; chain: Evidence[] };

const DAY = 86_400_000;
export function ageDays(at: string, today: Date): number {
  const [y, m, d] = at.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((now - then) / DAY));
}

/** "today" · "yesterday" · "5 days ago" · "3 weeks ago" · "4 months ago" · "over a year ago" */
export function formatAge(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "over a year ago";
}
/** Compact age for chips: "today", "3d", "2w", "4mo", "1y+". */
export function shortAge(days: number): string {
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return "1y+";
}

/** When the field was last checked (the newest evidence), how old that is, and whether it's stale. */
export function freshness(p: FieldProv, today: Date): { at: string; days: number; stale: boolean } {
  const at = p.chain.map((e) => e.at).sort().at(-1) ?? "1970-01-01";
  const days = ageDays(at, today);
  // What you typed never goes stale: Corral doesn't second-guess you.
  const yours = p.chain.at(-1)?.kind === "you";
  return { at, days, stale: !yours && days > STALE_AFTER[p.field] };
}

export const origin = (p: FieldProv) => p.chain[0];
export const latest = (p: FieldProv) => p.chain.at(-1)!;

export function confidenceWord(n?: number): string | null {
  if (n === undefined) return null;
  return n >= 90 ? "high confidence" : n >= 70 ? "good confidence" : "low confidence";
}

/** The fields worth re-checking, oldest first. */
export function staleFields(list: FieldProv[], today: Date): FieldProv[] {
  return list.filter((p) => freshness(p, today).stale).sort((a, b) => freshness(b, today).days - freshness(a, today).days);
}

const ORIGIN: Record<SourceKind, string> = {
  search: "Found by web search", site: "Found on the website", corral: "Read from the website by Corral", hunter: "Found by Hunter",
  dropcontact: "Found by Dropcontact", zerobounce: "Checked by ZeroBounce", csv: "From your CSV", you: "Entered by you",
};
/** "Found on the website, confirmed by Hunter and ZeroBounce" */
export function chainSummary(p: FieldProv): string {
  const [first, ...rest] = p.chain;
  const others = [...new Set(rest.map((e) => SOURCE[e.kind].short))].filter((s) => s !== SOURCE[first.kind].short);
  const lead = ORIGIN[first.kind];
  return others.length ? `${lead}, confirmed by ${others.join(" and ")}` : lead;
}
