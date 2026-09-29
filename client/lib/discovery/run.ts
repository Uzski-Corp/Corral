/**
 * Discovery runs (M4, ENG-54 → build ENG-82). A run finds companies that fit one product:
 * search the web → read each site → score it against the product's knowledge base → find people
 * (only for good fits: lookups cost credits) → verify their emails. Pure helpers, no React.
 */

export type StageId = "search" | "read" | "score" | "people" | "verify";
export type StageState = "waiting" | "running" | "done" | "paused" | "failed";
export type StageProgress = { done: number; total: number | null; state: StageState };

export const STAGES: { id: StageId; label: string; running: string; unit: string; provider: string }[] = [
  { id: "search", label: "Search", running: "Searching the web", unit: "searches", provider: "Serper · Google" },
  { id: "read", label: "Read sites", running: "Reading websites", unit: "sites", provider: "Corral crawler" },
  { id: "score", label: "Score fit", running: "Scoring fit", unit: "scored", provider: "Corral · knowledge base" },
  { id: "people", label: "Find people", running: "Finding decision-makers", unit: "companies", provider: "Hunter · Dropcontact" },
  { id: "verify", label: "Verify emails", running: "Checking mailboxes exist", unit: "emails", provider: "ZeroBounce" },
];
export const stageMeta = (id: StageId) => STAGES.find((s) => s.id === id)!;

export type RunStatus = "queued" | "running" | "paused" | "done" | "partial" | "failed" | "cancelled";
export type Criteria = { industries: string[]; countries: string[]; sizes: string[]; queries: string[] };
export type SkipReason = "blocked" | "timeout" | "no-site" | "parked" | "not-a-company";
export const SKIP_TEXT: Record<SkipReason, string> = {
  blocked: "the site blocks automated visits",
  timeout: "the site didn't answer in 30 seconds",
  "no-site": "no working website",
  parked: "parked or for-sale domain",
  "not-a-company": "a directory or news page, not a company",
};

export type Run = {
  id: string; name: string; product: string; by: string; criteria: Criteria;
  limit: number; enrichAt: number; status: RunStatus;
  stages: Record<StageId, StageProgress>;
  /** Minutes ago the run started or finished (sample data; the API sends timestamps). */
  started?: string; finished?: string;
  /** Queued: which run it waits for, and its place in line. */
  after?: string; position?: number;
  /** Paused by a provider limit: seconds until it resumes by itself (from Retry-After). */
  resumeIn?: number; limitedBy?: string;
  failure?: { stage: StageId; title: string; fix: string };
  skipped?: [SkipReason, number][];
  /** Per-search result counts, for the zero-results explanation. */
  perQuery?: [string, number][];
  found: number; added: number; updated: number; fits: number;
  credits: { used: number; estimate: number };
};

/** 0–100 across all five stages, equally weighted. A stage with an unknown total counts as half done while running. */
export function overallPercent(r: Pick<Run, "stages">): number {
  const parts = STAGES.map(({ id }) => {
    const s = r.stages[id];
    if (s.state === "done") return 1;
    if (!s.total) return s.state === "running" ? 0.5 : 0;
    return Math.min(1, s.done / s.total);
  });
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

/** The stage the run is on (the first not done), or null when every stage is done. */
export function currentStage(r: Pick<Run, "stages">): StageId | null {
  return STAGES.find(({ id }) => r.stages[id].state !== "done")?.id ?? null;
}

const f = (n: number) => n.toLocaleString("en-US");
export const plural = (n: number, one: string, many = `${one}s`) => `${f(n)} ${n === 1 ? one : many}`;

/** One line that says where the run is, for the runs list and the run header. */
export function runHeadline(r: Run): string {
  switch (r.status) {
    case "queued": return r.after ? `Queued · starts after ${r.after}` : "Queued · starts in a moment";
    case "paused": return `Paused · ${r.limitedBy ?? "a provider"} limit, resumes by itself`;
    case "failed": return `Stopped at ${stageMeta(r.failure?.stage ?? "search").label.toLowerCase()} · ${plural(r.found, "company", "companies")} kept`;
    case "cancelled": return `Cancelled · ${plural(r.found, "company", "companies")} kept`;
    case "done": case "partial": {
      if (r.found === 0) return "Finished · no companies matched";
      const skipped = (r.skipped ?? []).reduce((a, [, n]) => a + n, 0);
      return `Finished · ${plural(r.found, "company", "companies")}, ${f(r.fits)} fit 80+${skipped ? ` · ${f(skipped)} couldn't be read` : ""}`;
    }
    default: {
      const st = currentStage(r);
      if (!st) return "Finishing up";
      const s = r.stages[st]; const m = stageMeta(st);
      return s.total ? `${m.running} · ${f(s.done)} of ${f(s.total)} ${m.unit}` : m.running;
    }
  }
}

/** Minutes left, from the stage rates we show (sample: 6 sites a minute). "about 9 min" / "under a minute". */
export function etaText(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `about ${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60 / 5) * 5;
  return `about ${h} h${m ? ` ${m} min` : ""}`;
}

/**
 * Credits a run will use: one people lookup per company scoring at least `enrichAt`, and one email
 * check per person found (about 1.6 per company). `fitShare` is the share expected to clear the bar.
 */
export function estimateCredits(limit: number, enrichAt: number): { lookups: number; checks: number; total: number; minutes: number } {
  const fitShare = enrichAt >= 80 ? 0.18 : enrichAt >= 70 ? 0.34 : 0.52;
  const lookups = Math.round(limit * fitShare);
  const checks = Math.round(lookups * 1.6);
  return { lookups, checks, total: lookups + checks, minutes: Math.max(4, limit / 9) };
}

export type SetupIssue = { field: "countries" | "industries" | "credits"; text: string };
export function setupIssues(c: Criteria, credits: { need: number; left: number }): SetupIssue[] {
  const out: SetupIssue[] = [];
  if (c.countries.length === 0) out.push({ field: "countries", text: "Pick at least one country. Corral searches country by country." });
  if (c.industries.length === 0) out.push({ field: "industries", text: "Pick at least one industry, or Corral would search for everything." });
  if (credits.need > credits.left) out.push({ field: "credits", text: `This run needs about ${f(credits.need)} credits and ${f(credits.left)} are left this month. Lower the limit or raise the fit bar for finding people.` });
  return out;
}

/** Why a run found nothing, and the change most likely to help. */
export function zeroResultHints(c: Criteria, perQuery: [string, number][] = []): string[] {
  const hints: string[] = [];
  const empty = perQuery.filter(([, n]) => n === 0).length;
  if (perQuery.length) hints.push(`${empty === perQuery.length ? "All" : f(empty)} of ${f(perQuery.length)} searches came back empty.`);
  if (c.sizes.length === 1 && c.sizes[0] === "1,000+") hints.push("Only 1,000+ people: few companies that size in these countries. Add 201–1,000.");
  if (c.countries.length === 1) hints.push(`Only ${c.countries[0]}. Add a neighbouring country, or search in the local language too.`);
  if (c.industries.length === 1) hints.push(`Only ${c.industries[0]}. Related industries often buy the same thing.`);
  return hints;
}

/* ---------------------------------------------------------------- enrichment state, per company */

/**
 * Where one company is in enrichment. The table shows it in place of the value it's waiting for;
 * `stale` means the contact details are older than the freshness window (see provenance.ts).
 */
export type EnrichState =
  | { kind: "queued" } | { kind: "reading" } | { kind: "scoring" } | { kind: "finding" } | { kind: "verifying" }
  | { kind: "done" } | { kind: "below-bar"; bar: number } | { kind: "no-people" } | { kind: "unreadable"; why: SkipReason }
  | { kind: "stale"; days: number };

/** Short label for the table cell; null when the real value should show. */
export function enrichLabel(e?: EnrichState): string | null {
  if (!e) return null;
  switch (e.kind) {
    case "queued": return "Queued";
    case "reading": return "Reading site";
    case "scoring": return "Scoring";
    case "finding": return "Finding people";
    case "verifying": return "Verifying email";
    case "below-bar": return `No lookup · fit under ${e.bar}`;
    case "no-people": return "No one found";
    case "unreadable": return "Couldn't read site";
    default: return null;
  }
}
/** Still moving (no final value yet). */
export const enrichBusy = (e?: EnrichState) => !!e && ["queued", "reading", "scoring", "finding", "verifying"].includes(e.kind);
/** Fit isn't known yet. */
export const fitPending = (e?: EnrichState) => !!e && ["queued", "reading", "scoring"].includes(e.kind);

/**
 * One tick of the live demo (and a model of how the API's progress events move): each stage can
 * only process what the stage before it has finished. When every stage has caught up, the run is done.
 */
export function advanceRun(r: Run, step = 6): Run {
  if (r.status !== "running") return r;
  const s = { ...r.stages };
  const cap = (n: number, max: number) => Math.min(n, max);
  const read = { ...s.read, done: cap(s.read.done + step, s.read.total ?? r.found) };
  const score = { ...s.score, total: read.done, done: cap(s.score.done + step, read.done) };
  const peopleTotal = Math.max(s.people.total ?? 0, Math.round(score.done * 0.28));
  const people = { ...s.people, total: peopleTotal, done: cap(s.people.done + 2, peopleTotal) };
  const verifyTotal = Math.max(s.verify.total ?? 0, Math.round(people.done * 1.3));
  const verify = { ...s.verify, total: verifyTotal, done: cap(s.verify.done + 2, verifyTotal) };
  const readDone = read.done === (read.total ?? r.found);
  const all = readDone && score.done === read.done && people.done === people.total && verify.done === verify.total;
  const mark = (p: StageProgress, done: boolean): StageProgress => ({ ...p, state: done ? "done" : "running" });
  const next: Run = {
    ...r,
    stages: { search: s.search, read: mark(read, readDone), score: mark(score, all), people: mark(people, all), verify: mark(verify, all) },
    fits: Math.max(r.fits, Math.round(score.done * 0.2)),
    credits: { ...r.credits, used: Math.min(r.credits.estimate, people.done + verify.done) },
  };
  return all ? { ...next, status: "done", finished: "just now", added: r.found - 9, updated: 9 } : next;
}
