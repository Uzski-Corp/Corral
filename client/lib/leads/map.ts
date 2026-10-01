/**
 * The lead CRM API (lib/api/leads.ts) ⇄ the shapes Bau's lead table already renders (ENG-81).
 * Pure, so the live table, the segment builder and the import dialog share one mapping:
 *
 * - codes ⇄ labels ("meeting_booked" ⇄ "Meeting booked", "1-50" ⇄ "1–50", "import" ⇄ "CSV import");
 * - a company row → `Lead` (the table row), a company detail → `LeadDetailData` (the rail);
 * - the table's rules, tab, sort and selection → the API's rule list, sort and selection.
 */
import type { Lead } from "@/components/app/data";
import type { Status } from "@/components/app/primitives";
import type { LeadDetailData, Person as DetailPerson } from "@/components/app/leads/data";
import type { FitStatus } from "@/lib/fit/score";
import type {
  ApiCompany, ApiCompanyDetail, ApiPerson, ApiRule, ApiSelection, ApiSort, EmailCode, ReplyCode, SizeCode, SourceCode,
} from "@/lib/api/leads";
import { ruleIssue, RULE_FIELDS, type Match, type Rule, type RuleField, type Selection, type Sort } from "./segment";

/* ------------------------------------------------------------ vocabularies */
export const REPLY_LABEL: Record<ReplyCode, Status> = {
  not_contacted: "Not contacted", contacted: "Contacted", interested: "Interested", objection: "Objection", referral: "Referral",
  meeting_booked: "Meeting booked", not_interested: "Not interested", ooo: "OOO", unsubscribed: "Unsubscribed",
};
export const EMAIL_LABEL: Record<EmailCode, Status> = { verified: "Verified", catch_all: "Catch-all", unverified: "Unverified", bounced: "Bounced" };
export const SOURCE_LABEL: Record<SourceCode, string> = { search: "Corral search", import: "CSV import", manual: "Manual" };
export const SIZE_LABEL: Record<SizeCode, string> = { "1-50": "1–50", "51-200": "51–200", "201-1000": "201–1,000", "1000+": "1,000+" };

const invert = <K extends string>(m: Record<K, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
const REPLY_CODE = invert(REPLY_LABEL), EMAIL_CODE = invert(EMAIL_LABEL), SOURCE_CODE = invert(SOURCE_LABEL), SIZE_CODE = invert(SIZE_LABEL);
/** The reply status the API stores for a label, or null for one it doesn't have ("Disqualified"). */
export const replyCodeOf = (s: string): ReplyCode | null => REPLY_CODE[s] ?? null;
export const emailCodeOf = (s: string): EmailCode | null => EMAIL_CODE[s] ?? null;

/* ------------------------------------------------------------ rows */
export const personName = (p: Pick<ApiPerson, "firstName" | "lastName" | "email"> | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOUR = 3_600_000;
/** "Last activity" as the sample writes it: 2h ago, 3d ago, then Sep 12; "—" when never. */
export function lastLabel(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const h = (now.getTime() - t.getTime()) / HOUR;
  if (h < 24) return `${Math.max(1, Math.floor(h))}h ago`;
  if (h < 24 * 7) return `${Math.floor(h / 24)}d ago`;
  return `${MONTHS[t.getMonth()]} ${t.getDate()}`;
}
const dateLabel = (iso: string) => { const t = new Date(iso); return Number.isNaN(t.getTime()) ? "" : `${MONTHS[t.getMonth()]} ${t.getDate()}`; };

/** One company row as the table's `Lead`. Unscored companies carry fit 0; `fitStatusOf` says why. */
export function companyToLead(c: ApiCompany, now: Date): Lead {
  const p = c.primary;
  return {
    id: c.id, company: c.name, domain: c.domain ?? "", person: personName(p), title: p?.title ?? "", avatar: "",
    fit: c.fit ?? 0, email: p ? EMAIL_LABEL[p.emailStatus] : "Unverified", reply: REPLY_LABEL[c.replyStatus], last: lastLabel(c.lastActivityAt, now), why: [],
    country: c.country ?? undefined, size: c.size ? SIZE_LABEL[c.size] : undefined, industry: c.industry ?? undefined, source: SOURCE_LABEL[c.source],
  };
}
/** Unscored for this product: the designed "Not scored yet" (or "No website to read"). Scored rows need no status. */
export const fitStatusOf = (c: Pick<ApiCompany, "fit" | "domain">): FitStatus | undefined =>
  c.fit === null ? { kind: "none", why: c.domain ? "new" : "no-site" } : undefined;

/** The detail rail's people, notes and history from GET /companies/{id}. The API has no activity feed yet. */
export function detailFromApi(d: ApiCompanyDetail): LeadDetailData {
  const people: DetailPerson[] = [...d.people].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((p) => ({
    name: personName(p) || (p.email ?? ""), title: p.title ?? "", email: p.email ?? "", status: p.unsubscribedAt ? "Unsubscribed" : EMAIL_LABEL[p.emailStatus], primary: p.isPrimary || undefined,
  }));
  return {
    people, segments: [], notes: d.notes ?? undefined,
    activity: [{ when: dateLabel(d.createdAt), what: `Added from ${SOURCE_LABEL[d.source]}` }],
  };
}

/* ------------------------------------------------------------ probable duplicates
   The API rejects a second company with the same website, so what's left to catch is the same
   company under another name ("Kilima Dairies Ltd") or a person at a company already in Corral. */
const SUFFIX = /\b(ltd|limited|plc|inc|llc|co|company|group|holdings)\b\.?/g;
export const nameKey = (name: string) => name.toLowerCase().replace(/[.,&'’()-]/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
const hostOf = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

/** id → the id of the older row it probably duplicates, among the rows loaded. */
export function probableDuplicates(rows: ApiCompany[]): Record<string, string> {
  const byName = new Map<string, ApiCompany>(), byHost = new Map<string, ApiCompany>();
  const out: Record<string, string> = {};
  const older = (a: ApiCompany, b: ApiCompany) => (a.createdAt <= b.createdAt ? [a, b] : [b, a]);
  for (const c of rows) {
    const key = nameKey(c.name);
    const mail = c.primary?.email?.split("@")[1];
    const hit = (key && byName.get(key)) || (mail && byHost.get(hostOf(mail))) || undefined;
    if (hit && hit.id !== c.id) { const [keep, dup] = older(hit, c); out[dup.id] = keep.id; }
    if (key && !byName.has(key)) byName.set(key, c);
    if (c.domain && !byHost.has(hostOf(c.domain))) byHost.set(hostOf(c.domain), c);
  }
  return out;
}

/* ------------------------------------------------------------ rules, tabs, sort, selection */
const setValue = (field: RuleField, v: string): string => {
  if (field === "reply") return REPLY_CODE[v] ?? v;
  if (field === "email") return EMAIL_CODE[v] ?? v;
  if (field === "source") return SOURCE_CODE[v] ?? v;
  if (field === "size") return SIZE_CODE[v] ?? v;
  return v;
};
const asList = (v: Rule["value"]) => (Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean));

/** A finished rule in the API's words. Fit is per product, so without one a fit rule can't run (null). */
export function ruleToApi(r: Rule, productId: string | null): ApiRule | null {
  if (ruleIssue(r)) return null;
  const kind = RULE_FIELDS[r.field].kind;
  if (kind === "number") return productId ? { field: r.field, op: r.op, value: Number(r.value), product_id: productId } : null;
  if (kind === "text") return { field: r.field, op: r.op, value: String(r.value).trim() };
  return { field: r.field, op: r.op, value: asList(r.value).map((v) => setValue(r.field, v)) };
}
/** Unfinished rules are left out, as the sample's preview does; the API would reject them. */
export const rulesToApi = (rules: Rule[], productId: string | null) => rules.map((r) => ruleToApi(r, productId)).filter((r): r is ApiRule => r !== null);

const LABEL_OF: Partial<Record<RuleField, Record<string, string>>> = { reply: REPLY_LABEL, email: EMAIL_LABEL, source: SOURCE_LABEL, size: SIZE_LABEL };
let aid = 0;
/** A saved segment's rule back in the builder's words. */
export function ruleFromApi(r: ApiRule): Rule {
  const labels = LABEL_OF[r.field];
  const value = Array.isArray(r.value) ? r.value.map((v) => labels?.[v] ?? v) : r.value;
  return { id: `ar${++aid}`, field: r.field, op: r.op, value };
}

/** The Companies tabs as rules: Fit 80+, In a sequence (contacted or away), Replied. */
export function tabRules(tab: string, productId: string | null): ApiRule[] {
  if (tab === "fit") return productId ? [{ field: "fit", op: "gte", value: 80, product_id: productId }] : [];
  if (tab === "seq") return [{ field: "reply", op: "is", value: ["contacted", "ooo"] }];
  if (tab === "rep") return [{ field: "reply", op: "is", value: ["interested", "objection", "meeting_booked", "referral", "not_interested"] }];
  return [];
}

/**
 * What to ask for: the tab's rules AND the filter chips. The API's rule list is flat, so a tab plus
 * "match any" chips can't be said in one query; then the chips win and `tabDropped` is set.
 */
export function viewQuery(tab: string | null, rules: Rule[], match: Match, productId: string | null): { rules: ApiRule[]; match: Match; tabDropped: boolean } {
  const chips = rulesToApi(rules, productId);
  const base = tab ? tabRules(tab, productId) : [];
  if (!base.length) return { rules: chips, match, tabDropped: false };
  if (match === "all" || chips.length <= 1) return { rules: [...base, ...chips], match: "all", tabDropped: false };
  return { rules: chips, match, tabDropped: true };
}

/** Fit sorts by the product's score, so without a product it falls back to newest first. */
export const sortToApi = (s: Sort, productId: string | null): ApiSort => (s.key === "fit" && !productId ? { key: "created", dir: "desc" } : { key: s.key, dir: s.dir });

export const selectionToApi = (sel: Selection, q: { rules: ApiRule[]; match: Match }): ApiSelection =>
  sel.all ? { all: true, rules: q.rules, match: q.match } : { ids: [...sel.ids] };

/* ------------------------------------------------------------ enroll dry run */
/** The confirm dialog's skip lines (BULK_SKIPS' copy) from the API's reasons, in the API's order. */
export const SKIP_COPY: Record<string, string> = {
  unsubscribed: "unsubscribed or said no", not_interested: "unsubscribed or said no",
  replied_recently: "replied in the last 30 days", no_verified_email: "no verified email yet",
};
export function skipLines(skipped: { reason: string; n: number }[]): [number, string][] {
  const out: [number, string][] = [];
  for (const s of skipped) {
    const why = SKIP_COPY[s.reason] ?? s.reason.replace(/_/g, " ");
    const at = out.findIndex(([, w]) => w === why);
    if (at >= 0) out[at] = [out[at][0] + s.n, why]; else out.push([s.n, why]);
  }
  return out;
}
