/* Discovery sample data (M4). Illustrative: ColdTrace Sensors finding East African food companies. */
import type { Lead } from "../data";
import { LEAD_ROWS } from "../leads/data";
import type { Criteria, EnrichState, Run, StageProgress } from "@/lib/discovery/run";
import type { Evidence, FieldProv } from "@/lib/discovery/provenance";
import type { DiscoveryReviewState } from "@/lib/discovery/state";

export const CREDITS = { month: 2000, left: 1460 };
export const PRODUCTS = [
  { value: "sensors", label: "ColdTrace Sensors", meta: "12 sources" },
  { value: "gateway", label: "ColdTrace Gateway", meta: "4 sources" },
];
/** What the ColdTrace Sensors knowledge base says it sells to (M2 · Who buys it). */
export const ICP = {
  industries: ["Dairy", "Cold storage", "Seafood", "Beverages", "Meat", "Pharma", "Bakery", "Floriculture"],
  countries: ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia"],
  sizes: ["1–50", "51–200", "201–1,000", "1,000+"],
};
export const DEFAULT_CRITERIA: Criteria = {
  industries: ["Dairy", "Cold storage", "Seafood", "Beverages"], countries: ["Kenya", "Uganda", "Tanzania"], sizes: ["51–200", "201–1,000"],
  queries: [
    "\"dairy processor\" Kenya \"cold room\"", "site:.co.ke \"cold storage\" dairy", "fish processor Uganda export \"cold chain\"",
    "\"milk cooling centre\" Tanzania", "beverage bottler Kenya \"cold room\"", "\"seafood exporter\" Mwanza",
  ],
};
export const QUERY_TOTAL = 18;

const st = (done: number, total: number | null, state: StageProgress["state"]): StageProgress => ({ done, total, state });
const DONE = (n: number) => st(n, n, "done");
const WAIT = st(0, null, "waiting");

const DAIRY: Run = {
  id: "dairy", name: "Dairy & cold rooms · East Africa", product: "ColdTrace Sensors", by: "Tomás Ibarra", criteria: DEFAULT_CRITERIA,
  limit: 250, enrichAt: 70, status: "running", started: "12 min ago",
  stages: { search: DONE(18), read: st(164, 212, "running"), score: st(131, 164, "running"), people: st(29, 46, "running"), verify: st(21, 38, "running") },
  found: 212, added: 0, updated: 0, fits: 31, credits: { used: 50, estimate: 221 },
};
export const RUNS: Run[] = [
  DAIRY,
  { id: "uganda", name: "Bakeries & bottlers · Uganda", product: "ColdTrace Sensors", by: "Tomás Ibarra", status: "queued", after: "Dairy & cold rooms · East Africa", position: 1,
    criteria: { industries: ["Bakery", "Beverages"], countries: ["Uganda"], sizes: ["51–200", "201–1,000"], queries: [] }, limit: 100, enrichAt: 70,
    stages: { search: WAIT, read: WAIT, score: WAIT, people: WAIT, verify: WAIT }, found: 0, added: 0, updated: 0, fits: 0, credits: { used: 0, estimate: 82 } },
  { id: "fish", name: "Fisheries · Lake Victoria", product: "ColdTrace Sensors", by: "Amina Yusuf", status: "partial", started: "yesterday 14:10", finished: "yesterday 14:52",
    criteria: { industries: ["Seafood"], countries: ["Uganda", "Tanzania", "Kenya"], sizes: ["51–200", "201–1,000", "1,000+"], queries: [] }, limit: 100, enrichAt: 70,
    stages: { search: DONE(12), read: DONE(81), score: DONE(81), people: DONE(19), verify: DONE(24) }, skipped: [["blocked", 7], ["timeout", 5], ["no-site", 2], ["parked", 1]],
    found: 96, added: 84, updated: 12, fits: 14, credits: { used: 43, estimate: 70 } },
  { id: "bev", name: "Beverages · Tanzania", product: "ColdTrace Sensors", by: "Tomás Ibarra", status: "failed", started: "Sep 27 09:20",
    criteria: { industries: ["Beverages"], countries: ["Tanzania"], sizes: ["51–200", "201–1,000"], queries: [] }, limit: 100, enrichAt: 70,
    stages: { search: st(12, 18, "failed"), read: WAIT, score: WAIT, people: WAIT, verify: WAIT },
    failure: { stage: "search", title: "Web search stopped answering", fix: "Serper returned errors for the last 6 of 18 searches. Corral kept the 41 companies it had found and stopped before reading them, so no credits were spent on half a list." },
    found: 41, added: 0, updated: 0, fits: 0, credits: { used: 0, estimate: 70 } },
  { id: "flowers", name: "Flower exporters · Ethiopia", product: "ColdTrace Sensors", by: "Amina Yusuf", status: "done", started: "Sep 25 16:02", finished: "Sep 25 16:05",
    criteria: { industries: ["Floriculture"], countries: ["Ethiopia"], sizes: ["1,000+"], queries: [] }, limit: 100, enrichAt: 70,
    stages: { search: DONE(8), read: DONE(0), score: DONE(0), people: DONE(0), verify: DONE(0) },
    perQuery: [["flower exporter Ethiopia \"cold room\"", 0], ["site:.et floriculture \"cold chain\"", 0], ["rose farm Holeta packhouse", 0], ["\"flower farm\" Ziway pre-cooling", 0],
      ["Ethiopian horticulture exporter 1000 employees", 0], ["Bishoftu flowers cold store", 0], ["\"cut flowers\" Addis export warehouse", 0], ["EHPEA member cold room", 0]],
    found: 0, added: 0, updated: 0, fits: 0, credits: { used: 0, estimate: 70 } },
  { id: "logistics", name: "Cold-chain logistics · Kenya", product: "ColdTrace Sensors", by: "Tomás Ibarra", status: "done", started: "Sep 22 10:00", finished: "Sep 22 10:31",
    criteria: { industries: ["Cold storage"], countries: ["Kenya"], sizes: ["51–200", "201–1,000", "1,000+"], queries: [] }, limit: 250, enrichAt: 70,
    stages: { search: DONE(14), read: DONE(140), score: DONE(140), people: DONE(31), verify: DONE(44) },
    found: 140, added: 128, updated: 12, fits: 22, credits: { used: 75, estimate: 120 } },
];
export const runById = (id: string) => RUNS.find((r) => r.id === id);

/** The runs and which one is open, for each review state (frozen: nothing ticks). */
export function runsFor(state?: DiscoveryReviewState): { runs: Run[]; open: string | null } {
  if (state === "empty") return { runs: [], open: null };
  const pick: Partial<Record<DiscoveryReviewState, string>> = { queued: "uganda", done: "logistics", partial: "fish", failed: "bev", zero: "flowers" };
  const runs = state === "rate-limited"
    ? RUNS.map((r) => (r.id === "dairy" ? { ...r, status: "paused" as const, limitedBy: "Hunter", resumeIn: 262,
        stages: { ...r.stages, people: { ...r.stages.people, state: "paused" as const }, verify: { ...r.stages.verify, state: "paused" as const } } } : r))
    : RUNS;
  // M13: "starting" = just accepted, nothing ahead of it (the server's queued, before a worker picks it up).
  if (state === "starting") return { runs: [{ ...RUNS[1], id: "starting", after: undefined, position: 0 }, ...RUNS.filter((r) => r.id !== "dairy" && r.id !== "uganda")], open: "starting" };
  return { runs, open: pick[state ?? "running"] ?? "dairy" };
}

/* ---------------------------------------------------------------- results */

export type Result = Lead & { enrich?: EnrichState; via: string };
const E = (kind: EnrichState["kind"]): EnrichState => ({ kind } as EnrichState);
const NEW: Result[] = [
  { id: "meru", company: "Meru Greens Dairy", domain: "merugreens.co.ke", person: "", title: "", avatar: "", fit: 0, email: "Unverified", reply: "Not contacted", last: "—", why: [], country: "Kenya", industry: "Dairy", source: "Corral search", enrich: E("reading"), via: "Search · \"dairy processor\" Kenya \"cold room\" · #6" },
  { id: "eldama", company: "Eldama Creamery", domain: "eldamacreamery.co.ke", person: "", title: "", avatar: "", fit: 0, email: "Unverified", reply: "Not contacted", last: "—", why: [], country: "Kenya", industry: "Dairy", source: "Corral search", enrich: E("scoring"), via: "Search · site:.co.ke \"cold storage\" dairy · #2" },
  { id: "jinjafish", company: "Jinja Fish Processors", domain: "jinjafish.co.ug", person: "", title: "", avatar: "", fit: 0, email: "Unverified", reply: "Not contacted", last: "—", why: [], country: "Uganda", industry: "Seafood", source: "Corral search", enrich: E("queued"), via: "Search · fish processor Uganda export \"cold chain\" · #9" },
  { id: "musoma", company: "Musoma Fish Co.", domain: "musomafish.co.tz", person: "", title: "", avatar: "", fit: 0, email: "Unverified", reply: "Not contacted", last: "—", why: [], country: "Tanzania", industry: "Seafood", source: "Corral search", enrich: { kind: "unreadable", why: "blocked" }, via: "Search · \"seafood exporter\" Mwanza · #3" },
];
const STATES: Record<string, EnrichState> = {
  kilima: E("done"), pwani: E("done"), savanna: E("done"), dodoma: E("verifying"), lakeside: E("done"), tamu: E("finding"), arusha: E("verifying"),
  kigali: E("done"), mombasa: E("finding"), nyota: E("done"), ruiru: E("done"), bahari: E("no-people"),
};
const via = (l: Lead, i: number) => (i % 3 === 0 ? `Search · "dairy processor" ${l.country ?? "Kenya"} "cold room" · #${(i % 7) + 1}` : i % 3 === 1 ? `Search · site:.co.ke "cold storage" ${(l.industry ?? "dairy").toLowerCase()} · #${(i % 5) + 2}` : `Directory · Kenya Dairy Board processor list`);

/** Companies a run found that were already in Corral (in "12 already in Corral, updated"). */
const KNOWN = new Set(["kilima", "pwani", "nyota"]);

/** Results for a run. The running dairy run mixes every enrichment state; finished runs are settled. */
export function resultsFor(run: Run): Result[] {
  if (run.found === 0 || run.status === "queued") return [];
  const base = LEAD_ROWS.filter((l) => l.source === "Corral search" && !l.dupOf).slice(0, 26);
  if (run.status === "failed") return base.slice(0, 12).map((l, i) => ({ ...l, fit: 0, person: "", title: "", avatar: "", reply: "Not contacted", last: "—", enrich: E("queued"), via: via(l, i) }));
  const settled = run.status !== "running" && run.status !== "paused";
  const rows: Result[] = base.map((l, i) => {
    const e: EnrichState = settled ? (l.fit < run.enrichAt ? { kind: "below-bar", bar: run.enrichAt } : E("done"))
      : STATES[l.id] ?? (l.fit < run.enrichAt ? { kind: "below-bar", bar: run.enrichAt } : i % 4 === 0 ? E("finding") : E("done"));
    // No person until Corral has found one (or when it didn't look).
    const nobody = e.kind !== "done" && e.kind !== "verifying" && e.kind !== "stale";
    // New to Corral unless it was already a company here (the run updates those in place).
    return { ...l, enrich: e, via: via(l, i), reply: KNOWN.has(l.id) ? l.reply : "Not contacted", last: KNOWN.has(l.id) ? l.last : "—", ...(nobody ? { person: "", title: "", avatar: "" } : {}) };
  });
  if (run.status === "partial") return [...rows, { ...NEW[3] }, { ...NEW[3], id: "kisumucold", company: "Kisumu Cold Store", domain: "kisumucold.co.ke", country: "Kenya", enrich: { kind: "unreadable", why: "timeout" }, via: "Search · fish processor Kisumu \"cold room\" · #4" }];
  if (settled) return rows;
  return [...rows.slice(0, 18), ...NEW, ...rows.slice(18)];
}

/* ---------------------------------------------------------------- provenance */

const ev = (kind: Evidence["kind"], what: string, at: string, url?: string, confidence?: number): Evidence => ({ kind, what, at, url, confidence });
const emailOfPerson = (l: Lead) => `${l.person.split(/[\s.]+/)[0].toLowerCase()}@${l.domain}`;
const back = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };

/**
 * Where each field of a company came from. Kilima has the full story (found on its Contact page,
 * confirmed by Hunter, mailbox checked by ZeroBounce); other rows get a plausible chain. `staleBy`
 * shifts every date back, for the stale review state.
 */
export function provOf(l: Lead, staleBy = 0): FieldProv[] {
  const d = (iso: string) => (staleBy ? back(iso, staleBy) : iso);
  const csv = l.source === "CSV import";
  const found = csv ? ev("csv", "Row 12 of trade-show-leads.csv", d("2026-09-29")) : ev("search", "Search result for \"dairy processor\" Kenya \"cold room\" (#3)", d("2026-09-02"), `https://${l.domain}`);
  const out: FieldProv[] = [];
  if (l.industry) out.push({ field: "industry", value: l.industry, chain: [found, ev("corral", "Read from the About page", d("2026-09-02"), `${l.domain}/about`)] });
  if (l.size) out.push({ field: "size", value: l.size, chain: [ev("corral", "Estimated from the Careers and About pages", d("2026-09-02"), `${l.domain}/careers`), ev("dropcontact", `Company size ${l.size}`, d("2026-09-03"), undefined, 82)] });
  if (l.country) out.push({ field: "country", value: l.country, chain: [ev("site", "Address in the site footer", d("2026-09-02"), l.domain)] });
  if (l.person) {
    out.push({ field: "person", value: l.person, chain: csv ? [found] : [ev("site", "Named on the Team page", d("2026-09-02"), `${l.domain}/team`), ev("hunter", "Same name and company", d("2026-09-03"), undefined, 91)] });
    if (l.title) out.push({ field: "title", value: l.title, chain: csv ? [found] : [ev("site", "Title on the Team page", d("2026-09-02"), `${l.domain}/team`)] });
    const email = emailOfPerson(l);
    const chain: Evidence[] = l.id === "kilima"
      ? [ev("site", "Listed on the Contact page", d("2026-09-26"), `${l.domain}/contact`), ev("hunter", "Found in 4 public sources", d("2026-09-26"), undefined, 96), ev("zerobounce", "Mailbox exists (SMTP check)", d("2026-09-28"))]
      : csv ? [found, ev("zerobounce", l.email === "Verified" ? "Mailbox exists (SMTP check)" : "Couldn’t confirm the mailbox", d("2026-09-29"))]
      : l.email === "Catch-all" ? [ev("hunter", `Pattern first@${l.domain}`, d("2026-09-03"), undefined, 74), ev("zerobounce", "Domain accepts all mail: this mailbox can't be confirmed", d("2026-09-03"))]
      : l.email === "Unverified" ? [ev("dropcontact", `Pattern first@${l.domain}`, d("2026-09-03"), undefined, 61)]
      : l.email === "Bounced" ? [ev("hunter", `Pattern first@${l.domain}`, d("2026-08-11"), undefined, 88), ev("zerobounce", "Mailbox didn't exist when Corral sent (hard bounce)", d("2026-09-19"))]
      : [ev("hunter", `Pattern first@${l.domain}`, d("2026-09-03"), undefined, 92), ev("zerobounce", "Mailbox exists (SMTP check)", d("2026-09-03"))];
    out.push({ field: "email", value: email, chain });
    if (l.id === "kilima") out.push({ field: "phone", value: "+254 51 221 0400", chain: [ev("site", "Contact page", d("2026-09-26"), `${l.domain}/contact`)] });
  }
  if (!l.scoring && l.fit) out.push({ field: "fit", value: String(l.fit), chain: [ev("corral", "Scored against the ColdTrace Sensors knowledge base (12 sources)", d("2026-09-27"))] });
  return out;
}

/** Companies whose contact details are stale, for the stale review state: [id, days since checked]. */
export const STALE_IDS: [string, number][] = [["kilima", 128], ["savanna", 104], ["tamu", 97], ["kigali", 133], ["ruiru", 118], ["nyota", 96]];
export const STALE_TOTAL = 86;

/** The demo's "today" (matches AppDemo's DEMO_TODAY, Sep 29 2026), for freshness. */
export const DEMO_TODAY_M4 = new Date(2026, 8, 29);
