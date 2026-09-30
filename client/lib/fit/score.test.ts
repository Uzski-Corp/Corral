import { describe, expect, it } from "vitest";
import { LEAD_ROWS } from "@/components/app/leads/data";
import { FIT_OPEN, KILIMA_FIT, fitStatusFor, scoreFor } from "@/components/app/fit/data";
import { LEADS_REVIEW_STATES } from "@/lib/leads/state";
import { band, barOf, ceilingOf, changeOf, confidence, fitLabel, overrideIssue, scoreOf, shownValue, summaryLine, type FitScore } from "./score";

const lead = (id: string) => LEAD_ROWS.find((l) => l.id === id)!;

describe("fit score model", () => {
  it("adds the checks up to the score, within each weight", () => {
    expect(scoreOf(KILIMA_FIT.checks)).toBe(94);
    expect(KILIMA_FIT.checks.reduce((a, c) => a + c.weight, 0)).toBe(100);
    for (const l of LEAD_ROWS.filter((x) => !x.scoring)) {
      const s = scoreFor(l);
      expect(scoreOf(s.checks)).toBe(s.value);
      expect(s.value).toBe(l.fit);
      for (const c of s.checks) { expect(c.points).toBeGreaterThanOrEqual(0); expect(c.points).toBeLessThanOrEqual(c.weight); }
    }
  });

  it("bands and words", () => {
    expect([band(80), band(79), band(60), band(59)]).toEqual(["strong", "possible", "possible", "weak"]);
    expect(summaryLine(KILIMA_FIT)).toBe("Strong fit. Runs three cold rooms at its Nakuru plant, about 400 tonnes. Lost a night's milk to a compressor failure in March.");
    expect(summaryLine({ ...KILIMA_FIT, value: 40, checks: KILIMA_FIT.checks.map((c) => ({ ...c, verdict: "missed" })) })).toBe("Weak fit. None of the checks held clearly.");
  });

  it("says how sure it is: evidence coverage and pages read", () => {
    expect(confidence(KILIMA_FIT)).toMatchObject({ level: "high", unknownWeight: 0, reason: "" });
    const low = (fitStatusFor(lead("zanzibar"), "fit-low") as { score: FitScore }).score;
    expect(confidence(low)).toMatchObject({ level: "low", unknownWeight: 35, reason: "2 of 6 checks have no evidence (35 of 100 points); Corral could only read one page" });
    expect(ceilingOf(low)).toBe(88);
    expect(confidence({ ...KILIMA_FIT, pages: 5 }).level).toBe("medium");
    expect(confidence({ ...KILIMA_FIT, pages: 2 }).reason).toBe("Corral could only read 2 pages");
  });

  it("uses your number when you set one, and reports changes", () => {
    const o = { ...KILIMA_FIT, override: { value: 60, by: "Tomás", at: "2026-09-29" } };
    expect(shownValue(o)).toBe(60);
    expect(changeOf(KILIMA_FIT)).toBeNull(); // same value last time
    expect(changeOf({ ...KILIMA_FIT, history: [{ at: "2026-09-12", value: 70, why: ["x"] }] })).toEqual({ from: 70, to: 94, delta: 24, at: "2026-09-12", why: ["x"] });
    expect(changeOf({ ...KILIMA_FIT, history: undefined })).toBeNull();
  });

  it("marks the bar for each status", () => {
    expect(barOf({ kind: "scored", score: KILIMA_FIT })).toEqual({ value: 94, by: undefined, confidence: undefined, delta: undefined });
    expect(barOf({ kind: "scoring", pages: 1, of: 9, checked: 0 })).toMatchObject({ state: "scoring", text: "Scoring" });
    expect(barOf({ kind: "scoring", pages: 1, of: 9, checked: 0, last: KILIMA_FIT }).text).toBe("Rescoring");
    expect(barOf({ kind: "none", why: "queued" })).toMatchObject({ state: "none", text: "In line to be scored" });
    expect(barOf({ kind: "none", why: "no-site" }, true).text).toBe("No website");
    expect(barOf({ kind: "error", code: "x", at: "y", tries: 1 }, true)).toEqual({ value: 0, state: "error", text: "Failed" });
    expect(barOf({ kind: "error", code: "x", at: "y", tries: 1, last: KILIMA_FIT }).value).toBe(94);
    const ch = barOf(fitStatusFor(lead("nyota"), "fit-changed"));
    expect(ch).toMatchObject({ value: 84, delta: 26 });
    expect(barOf(fitStatusFor(lead("bahari"), "fit-override"))).toMatchObject({ value: 83, by: "you", delta: undefined });
    expect(barOf(fitStatusFor(lead("zanzibar"), "fit-low"))).toMatchObject({ value: 53, confidence: "low" });
  });

  it("names the bar for assistive tech", () => {
    expect(fitLabel({ value: 83, by: "you" })).toBe("Fit 83 of 100, set by you");
    expect(fitLabel({ value: 53, confidence: "low", delta: -4 })).toBe("Fit 53 of 100, low confidence, down 4 since the last score");
    expect(fitLabel({ state: "scoring", text: "Rescoring" })).toBe("Fit: rescoring");
    expect(fitLabel({ state: "none" })).toBe("Fit: not scored yet");
    expect(fitLabel({ state: "error" })).toBe("Fit: couldn’t score");
  });

  it("checks a number you type", () => {
    expect(overrideIssue("")).toBe("Enter a number from 0 to 100.");
    expect(overrideIssue("101")).toBe("Use a whole number from 0 to 100.");
    expect(overrideIssue("7.5")).toBe("Use a whole number from 0 to 100.");
    expect(overrideIssue("70")).toBeNull();
  });

  it("opens one company per fit review state, and every fit state is a leads state", () => {
    for (const s of Object.keys(FIT_OPEN)) expect(LEADS_REVIEW_STATES).toContain(s);
    expect(fitStatusFor(lead("savanna"), "fit-none")).toEqual({ kind: "none", why: "queued", since: "2 min ago" });
    expect(fitStatusFor(lead("mara"), "fit-none")).toEqual({ kind: "none", why: "no-site" });
    expect(fitStatusFor(lead("tamu"), "fit-scoring").kind).toBe("scoring");
    expect(fitStatusFor(lead("jinja"), "fit-scoring").kind).toBe("scoring");
    expect(fitStatusFor(lead("dodoma"), "fit-error")).not.toHaveProperty("last");
    expect(fitStatusFor(lead("kigali"), "fit-error")).toMatchObject({ kind: "error", tries: 2 });
    expect((fitStatusFor(lead("rift"), "fit-disagree") as { score: FitScore }).score.disagree?.note).toMatch(/rent their cold rooms/);
    expect(changeOf((fitStatusFor(lead("rift"), "fit-changed") as { score: FitScore }).score)?.delta).toBe(-9);
    expect(changeOf((fitStatusFor(lead("mombasa"), "fit-changed") as { score: FitScore }).score)?.delta).toBe(6);
    expect(fitStatusFor(lead("kilima"))).toEqual({ kind: "scored", score: KILIMA_FIT });
    // Rows without a size or person still score, with the gaps marked unknown.
    const bare = scoreFor({ ...lead("pwani"), size: undefined, person: "", country: "Nigeria" }, 40);
    expect(bare.checks.find((c) => c.id === "size")!.verdict).toBe("unknown");
    expect(bare.checks.find((c) => c.id === "buyer")!.verdict).toBe("unknown");
    expect(bare.checks.find((c) => c.id === "region")!.verdict).toBe("missed");
    expect(scoreFor({ ...lead("pwani"), title: "CFO" }).checks.find((c) => c.id === "buyer")!.verdict).toBe("partly");
    expect(scoreFor({ ...lead("pwani"), size: "1,000+" }).checks.find((c) => c.id === "size")!.verdict).toBe("partly");
    expect(scoreFor({ ...lead("pwani"), why: [] }, 5).checks.find((c) => c.id === "alerting")!.finding).toBe("Already uses a monitoring vendor");
  });
});
