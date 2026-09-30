/**
 * Segment rules for the lead table and the segment builder (M3, ENG-53). Pure and serialisable,
 * so the same rule list can be sent to the API and evaluated on sample rows for the live preview.
 */
export type LeadLike = {
  id: string; company: string; domain: string; fit: number; email: string; reply: string;
  country?: string; size?: string; industry?: string; title?: string; source?: string; last?: string;
};
export type Op = "gte" | "lte" | "is" | "not" | "contains";
export type RuleField = "fit" | "country" | "size" | "industry" | "reply" | "email" | "title" | "source";
export type Rule = { id: string; field: RuleField; op: Op; value: string | number | string[] };
export type Match = "all" | "any";

export const RULE_FIELDS: Record<RuleField, { label: string; ops: Op[]; kind: "number" | "set" | "text"; options?: string[] }> = {
  fit: { label: "Fit for ColdTrace Sensors", ops: ["gte", "lte"], kind: "number" },
  country: { label: "Country", ops: ["is", "not"], kind: "set", options: ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria"] },
  size: { label: "Company size", ops: ["is", "not"], kind: "set", options: ["1–50", "51–200", "201–1,000", "1,000+"] },
  industry: { label: "Industry", ops: ["is", "not"], kind: "set", options: ["Dairy", "Seafood", "Beverages", "Bakery", "Grain", "Cold storage", "Coffee", "Pharma"] },
  reply: { label: "Reply status", ops: ["is", "not"], kind: "set", options: ["Not contacted", "Contacted", "Interested", "Objection", "Meeting booked", "Not interested", "OOO", "Referral", "Unsubscribed"] },
  email: { label: "Email status", ops: ["is", "not"], kind: "set", options: ["Verified", "Catch-all", "Unverified", "Bounced"] },
  title: { label: "Job title", ops: ["contains"], kind: "text" },
  source: { label: "Added from", ops: ["is", "not"], kind: "set", options: ["Corral search", "CSV import", "Manual"] },
};
export const OP_LABEL: Record<Op, string> = { gte: "at least", lte: "at most", is: "is any of", not: "is none of", contains: "contains" };

const asList = (v: Rule["value"]) => (Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean));

/** Why a rule can't run yet, or null when it's complete. */
export function ruleIssue(r: Rule): string | null {
  const f = RULE_FIELDS[r.field];
  if (!f.ops.includes(r.op)) return `“${OP_LABEL[r.op]}” doesn't apply to ${f.label}`;
  if (f.kind === "number") {
    const n = Number(r.value);
    if (r.value === "" || !Number.isFinite(n)) return "Enter a number";
    if (n < 0 || n > 100) return "Fit is scored 0–100";
    return null;
  }
  if (f.kind === "text") return String(r.value).trim() ? null : "Enter some text";
  return asList(r.value).length ? null : "Pick at least one";
}

export function matchesRule(l: LeadLike, r: Rule): boolean {
  const v = r.field === "fit" ? l.fit : (l[r.field] ?? "");
  if (r.op === "gte") return Number(v) >= Number(r.value);
  if (r.op === "lte") return Number(v) <= Number(r.value);
  if (r.op === "contains") return String(v).toLowerCase().includes(String(r.value).toLowerCase().trim());
  const hit = asList(r.value).includes(String(v));
  return r.op === "is" ? hit : !hit;
}
/** Incomplete rules are ignored (the builder shows them as unfinished), so the preview never lies. */
export function matches(l: LeadLike, rules: Rule[], match: Match = "all"): boolean {
  const live = rules.filter((r) => !ruleIssue(r));
  if (!live.length) return true;
  return match === "all" ? live.every((r) => matchesRule(l, r)) : live.some((r) => matchesRule(l, r));
}
export const filterLeads = <T extends LeadLike>(leads: T[], rules: Rule[], match: Match = "all") => leads.filter((l) => matches(l, rules, match));

export function describeRule(r: Rule): string {
  const f = RULE_FIELDS[r.field];
  if (f.kind === "number") return `${f.label} ${r.op === "gte" ? "≥" : "≤"} ${r.value}`;
  if (f.kind === "text") return `${f.label} contains “${r.value}”`;
  const list = asList(r.value);
  const shown = list.length > 2 ? `${list.slice(0, 2).join(", ")} +${list.length - 2}` : list.join(", ");
  return `${f.label} ${r.op === "is" ? "is" : "is not"} ${shown}`;
}

/* ------------------------------------------------------------------ sorting */
export type SortKey = "company" | "person" | "fit" | "email" | "reply" | "last";
export type Sort = { key: SortKey; dir: "asc" | "desc" };
const REPLY_ORDER = ["Meeting booked", "Interested", "Objection", "Referral", "OOO", "Contacted", "Not contacted", "Not interested", "Unsubscribed"];
const EMAIL_ORDER = ["Verified", "Catch-all", "Unverified", "Bounced"];
/** "2h ago" < "5h ago" < "1d ago" < "Thu 10:30"… ; "—" (never) sorts last either way. */
export function ageRank(s = "—"): number {
  const m = s.match(/^(\d+)([hd]) ago$/);
  if (m) return Number(m[1]) * (m[2] === "h" ? 1 : 24);
  if (s === "—" || !s) return Number.POSITIVE_INFINITY;
  return 24 * 7; // weekday or date: older than "Nd ago" for the sample
}
export function sortLeads<T extends LeadLike & { person?: string }>(leads: T[], s: Sort): T[] {
  const k = (l: T): string | number => {
    switch (s.key) {
      case "fit": return l.fit;
      case "email": return EMAIL_ORDER.indexOf(l.email);
      case "reply": return REPLY_ORDER.indexOf(l.reply);
      case "last": return ageRank(l.last);
      case "person": return (l.person ?? "").toLowerCase();
      default: return l.company.toLowerCase();
    }
  };
  const dir = s.dir === "asc" ? 1 : -1;
  return [...leads].sort((a, b) => {
    const x = k(a), y = k(b);
    if (s.key === "last" && x !== y && (x === Infinity || y === Infinity)) return x === Infinity ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir || a.company.localeCompare(b.company);
  });
}
/** Clicking a header: first click uses the column's natural direction (fit high→low, names A→Z), the next flips it. */
export function nextSort(cur: Sort | undefined, key: SortKey): Sort {
  if (cur?.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "fit" ? "desc" : "asc" };
}

/* ------------------------------------------------------------------ selection */
export type Selection = { ids: Set<string>; all: boolean };
/** "3 selected", "All 48 on this page", or "All 1,284 in this view". */
export function selectionLabel(sel: Selection, shown: number, total: number): string {
  const f = (n: number) => n.toLocaleString("en");
  if (sel.all) return `All ${f(total)} selected`;
  if (sel.ids.size && sel.ids.size === shown && shown < total) return `All ${f(shown)} on this page selected`;
  return `${f(sel.ids.size)} selected`;
}
export const selectedCount = (sel: Selection, total: number) => (sel.all ? total : sel.ids.size);
/** Above this, a bulk action asks first and runs in the background. */
export const BULK_CONFIRM_AT = 100;
