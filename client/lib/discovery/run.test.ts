import { describe, expect, it } from "vitest";
import {
  STAGES, advanceRun, currentStage, enrichBusy, enrichLabel, estimateCredits, etaText, exampleSearches, fitPending, overallPercent, plural, runFromApi, runHeadline, setupIssues,
  stageMeta, zeroResultHints, type Run, type StageProgress,
} from "./run";

const st = (done: number, total: number | null, state: StageProgress["state"]): StageProgress => ({ done, total, state });
const base: Run = {
  id: "r", name: "Dairy", product: "P", by: "Tomás Ibarra", limit: 250, enrichAt: 70, status: "running",
  criteria: { industries: ["Dairy"], countries: ["Kenya"], sizes: ["1,000+"], queries: [] },
  stages: { search: st(18, 18, "done"), read: st(164, 212, "running"), score: st(131, 164, "running"), people: st(29, 46, "running"), verify: st(21, 38, "running") },
  found: 212, added: 0, updated: 0, fits: 31, credits: { used: 50, estimate: 221 },
};

describe("run progress", () => {
  it("weights the five stages equally, and counts an unknown running total as half", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["search", "read", "score", "people", "verify"]);
    expect(overallPercent(base)).toBe(75);
    expect(overallPercent({ stages: { ...base.stages, read: st(3, null, "running"), score: st(0, null, "waiting"), people: st(0, null, "waiting"), verify: st(0, null, "waiting") } })).toBe(30);
    expect(currentStage(base)).toBe("read");
    expect(currentStage({ stages: Object.fromEntries(STAGES.map((s) => [s.id, st(1, 1, "done")])) as Run["stages"] })).toBeNull();
    expect(stageMeta("verify").provider).toBe("ZeroBounce");
  });

  it("says where each kind of run is", () => {
    expect(runHeadline(base)).toBe("Reading websites · 164 of 212 sites");
    expect(runHeadline({ ...base, stages: { ...base.stages, read: st(0, null, "running") } })).toBe("Reading websites");
    expect(runHeadline({ ...base, stages: Object.fromEntries(STAGES.map((s) => [s.id, st(1, 1, "done")])) as Run["stages"] })).toBe("Finishing up");
    expect(runHeadline({ ...base, status: "queued", after: "Fish" })).toBe("Queued · starts after Fish");
    expect(runHeadline({ ...base, status: "queued" })).toBe("Queued · starts in a moment");
    expect(runHeadline({ ...base, status: "paused", limitedBy: "Hunter" })).toBe("Paused · Hunter limit, resumes by itself");
    expect(runHeadline({ ...base, status: "paused" })).toBe("Paused · a provider limit, resumes by itself");
    expect(runHeadline({ ...base, status: "failed", found: 41, failure: { stage: "search", title: "t", fix: "f" } })).toBe("Failed at search · 41 companies kept");
    expect(runHeadline({ ...base, status: "failed", found: 1 })).toBe("Failed at search · 1 company kept");
    expect(runHeadline({ ...base, status: "cancelled" })).toBe("Cancelled · 212 companies kept");
    expect(runHeadline({ ...base, status: "done", found: 0 })).toBe("Done · no companies matched");
    expect(runHeadline({ ...base, status: "done", fits: 22 })).toBe("Done · 212 companies, 22 fit 80+");
    expect(runHeadline({ ...base, status: "partial", skipped: [["blocked", 7], ["timeout", 5]] })).toBe("Done · 212 companies, 31 fit 80+ · 12 couldn’t be read");
    expect(plural(1, "run")).toBe("1 run");
    expect(plural(1200, "run")).toBe("1,200 runs");
  });

  it("estimates time and credits from the limit and the fit bar", () => {
    expect(etaText(0.5)).toBe("under a minute");
    expect(etaText(9.2)).toBe("about 9 min");
    expect(etaText(60)).toBe("about 1 h");
    expect(etaText(95)).toBe("about 1 h 35 min");
    expect(estimateCredits(250, 70)).toEqual({ lookups: 85, checks: 136, total: 221, minutes: 250 / 9 });
    expect(estimateCredits(1000, 60).total).toBe(1352);
    expect(estimateCredits(100, 80)).toEqual({ lookups: 18, checks: 29, total: 47, minutes: 100 / 9 });
    expect(estimateCredits(10, 80).minutes).toBe(4);
  });

  it("blocks a setup with no country, no industry, or more credits than are free", () => {
    const c = base.criteria;
    expect(setupIssues(c, { need: 221, left: 1289 })).toEqual([]);
    const all = setupIssues({ ...c, countries: [], industries: [] }, { need: 1352, left: 1289 });
    expect(all.map((i) => i.field)).toEqual(["countries", "industries", "credits"]);
    expect(all[2].text).toBe("This run needs about 1,352 credits and 1,289 are left this month. Lower the limit or raise the fit bar for finding people.");
  });

  it("fills a stored run that only has a name and a product", () => {
    const run = runFromApi({ id: "1", name: "Banking · Kenya", status: "queued", product: "Athena" }, "Uzski");
    expect(run.by).toBe("Uzski");
    expect(run.stages.search.state).toBe("waiting");
    expect(run.criteria.industries).toEqual([]);
    expect(run.credits).toEqual({ used: 0, estimate: 0 });
    expect(runHeadline(run)).toBe("Queued · starts in a moment");
  });

  it("writes searches from the industries and countries, nothing else", () => {
    expect(exampleSearches({ industries: ["Dairy", "Seafood"], countries: ["Kenya", "Uganda"] })).toEqual([
      '"dairy" Kenya', '"dairy" Uganda', '"seafood" Kenya',
    ]);
    expect(exampleSearches({ industries: [], countries: ["Kenya"] })).toEqual([]);
  });

  it("explains zero results from the searches and the criteria", () => {
    expect(zeroResultHints(base.criteria, [["a", 0], ["b", 0]])).toEqual([
      "All of 2 searches came back empty.",
      "Only 1,000+ people: few companies that size in these countries. Add 201–1,000.",
      "Only Kenya. Add a neighbouring country, or search in the local language too.",
      "Only Dairy. Related industries often buy the same thing.",
    ]);
    expect(zeroResultHints({ industries: ["A", "B"], countries: ["K", "U"], sizes: ["51–200"], queries: [] }, [["a", 0], ["b", 3]])).toEqual(["1 of 2 searches came back empty."]);
    expect(zeroResultHints({ industries: ["A", "B"], countries: ["K", "U"], sizes: [], queries: [] })).toEqual([]);
  });
});

describe("advanceRun", () => {
  it("moves each stage only as far as the one before it, then finishes", () => {
    let r = advanceRun(base);
    expect(r.stages.read.done).toBe(170);
    expect(r.stages.score.done).toBe(137);
    expect(r.stages.score.done).toBeLessThanOrEqual(r.stages.read.done);
    expect(advanceRun({ ...base, status: "paused" })).toEqual({ ...base, status: "paused" });
    for (let i = 0; i < 200 && r.status === "running"; i++) r = advanceRun(r);
    expect(r.status).toBe("done");
    expect(r.stages.read.done).toBe(212);
    expect(STAGES.every((s) => r.stages[s.id].state === "done")).toBe(true);
    expect(r.added + r.updated).toBe(212);
    expect(r.credits.used).toBeLessThanOrEqual(r.credits.estimate);
    const noTotal = advanceRun({ ...base, stages: { ...base.stages, read: st(0, null, "running"), people: st(0, null, "waiting"), verify: st(0, null, "waiting") } });
    expect(noTotal.stages.read.done).toBe(6);
  });
});

describe("enrichment state", () => {
  it("labels each state and says whether it's still moving", () => {
    expect(enrichLabel()).toBeNull();
    expect(enrichLabel({ kind: "done" })).toBeNull();
    expect(enrichLabel({ kind: "stale", days: 100 })).toBeNull();
    expect(["queued", "reading", "scoring", "finding", "verifying", "no-people"].map((kind) => enrichLabel({ kind } as never)))
      .toEqual(["Queued", "Reading site", "Scoring", "Finding people", "Verifying email", "No one found"]);
    expect(enrichLabel({ kind: "below-bar", bar: 70 })).toBe("No lookup · fit under 70");
    expect(enrichLabel({ kind: "unreadable", why: "blocked" })).toBe("Couldn’t read site");
    expect(enrichBusy({ kind: "verifying" })).toBe(true);
    expect(enrichBusy({ kind: "no-people" })).toBe(false);
    expect(enrichBusy()).toBe(false);
    expect(fitPending({ kind: "scoring" })).toBe(true);
    expect(fitPending({ kind: "finding" })).toBe(false);
  });
});
