import { describe, expect, it } from "vitest";
import { BULK_CONFIRM_AT, ageRank, describeRule, filterLeads, matches, matchesRule, nextSort, ruleIssue, selectedCount, selectionLabel, sortLeads, type LeadLike, type Rule } from "./segment";

const L = (id: string, fit: number, extra: Partial<LeadLike> = {}): LeadLike & { person: string } =>
  ({ id, company: id[0].toUpperCase() + id.slice(1), domain: `${id}.co`, fit, email: "Verified", reply: "Not contacted", person: id, ...extra });
const leads = [L("kilima", 94, { country: "Kenya", reply: "Interested", last: "2h ago", title: "Head of Supply Chain" }), L("pwani", 91, { country: "Kenya", reply: "Objection", last: "5h ago" }),
  L("tamu", 86, { country: "Uganda", email: "Catch-all", last: "1d ago" }), L("kivu", 64, { country: "Rwanda", last: "—" }), L("nyota", 84, { country: "Tanzania", reply: "Meeting booked", last: "Thu 10:30" })];
const r = (field: Rule["field"], op: Rule["op"], value: Rule["value"]): Rule => ({ id: `${field}-${op}`, field, op, value });

describe("rules", () => {
  it("explains unfinished or impossible rules", () => {
    expect(ruleIssue(r("fit", "gte", 80))).toBeNull();
    expect(ruleIssue(r("fit", "gte", ""))).toBe("Enter a number");
    expect(ruleIssue(r("fit", "gte", "abc"))).toBe("Enter a number");
    expect(ruleIssue(r("fit", "lte", 120))).toBe("Fit is scored 0–100");
    expect(ruleIssue(r("fit", "is", 80))).toBe("“is any of” doesn't apply to Fit for ColdTrace Sensors");
    expect(ruleIssue(r("title", "contains", "  "))).toBe("Enter some text");
    expect(ruleIssue(r("country", "is", []))).toBe("Pick at least one");
    expect(ruleIssue(r("country", "is", "Kenya, Uganda"))).toBeNull();
  });
  it("matches numbers, sets and text; all or any; ignores unfinished rules", () => {
    expect(matchesRule(leads[0], r("title", "contains", "supply"))).toBe(true);
    expect(matchesRule(leads[1], r("title", "contains", "supply"))).toBe(false);
    expect(matchesRule(leads[3], r("fit", "lte", 70))).toBe(true);
    expect(matchesRule(leads[3], r("country", "not", ["Kenya"]))).toBe(true);
    const rules = [r("fit", "gte", 85), r("country", "is", ["Kenya", "Uganda"]), r("reply", "is", [])];
    expect(filterLeads(leads, rules).map((l) => l.id)).toEqual(["kilima", "pwani", "tamu"]);
    expect(filterLeads(leads, [r("fit", "gte", 90), r("country", "is", ["Tanzania"])], "any").map((l) => l.id)).toEqual(["kilima", "pwani", "nyota"]);
    expect(matches(leads[3], [r("reply", "is", [])])).toBe(true);
  });
  it("describes rules the way the chips read", () => {
    expect(describeRule(r("fit", "gte", 80))).toBe("Fit for ColdTrace Sensors ≥ 80");
    expect(describeRule(r("fit", "lte", 60))).toBe("Fit for ColdTrace Sensors ≤ 60");
    expect(describeRule(r("title", "contains", "quality"))).toBe("Job title contains “quality”");
    expect(describeRule(r("country", "is", ["Kenya", "Uganda", "Tanzania"]))).toBe("Country is Kenya, Uganda +1");
    expect(describeRule(r("email", "not", ["Bounced"]))).toBe("Email status is not Bounced");
  });
});

describe("sorting", () => {
  it("ranks ages, with never-touched last", () => {
    expect(ageRank("2h ago")).toBe(2);
    expect(ageRank("1d ago")).toBe(24);
    expect(ageRank("Thu 10:30")).toBe(168);
    expect(ageRank("—")).toBe(Infinity);
    expect(ageRank("")).toBe(Infinity);
    expect(ageRank()).toBe(Infinity);
  });
  it("sorts by each column, both directions", () => {
    const ids = (s: Parameters<typeof sortLeads>[1]) => sortLeads(leads, s).map((l) => l.id);
    expect(ids({ key: "fit", dir: "desc" })).toEqual(["kilima", "pwani", "tamu", "nyota", "kivu"]);
    expect(ids({ key: "company", dir: "asc" })).toEqual(["kilima", "kivu", "nyota", "pwani", "tamu"]);
    expect(ids({ key: "person", dir: "desc" })[0]).toBe("tamu");
    expect(ids({ key: "reply", dir: "asc" }).slice(0, 3)).toEqual(["nyota", "kilima", "pwani"]);
    expect(ids({ key: "email", dir: "desc" })[0]).toBe("tamu");
    expect(ids({ key: "last", dir: "asc" })).toEqual(["kilima", "pwani", "tamu", "nyota", "kivu"]);
    expect(ids({ key: "last", dir: "desc" })).toEqual(["nyota", "tamu", "pwani", "kilima", "kivu"]);
  });
  it("first click uses the natural direction, the next flips it", () => {
    expect(nextSort(undefined, "fit")).toEqual({ key: "fit", dir: "desc" });
    expect(nextSort({ key: "fit", dir: "desc" }, "company")).toEqual({ key: "company", dir: "asc" });
    expect(nextSort({ key: "company", dir: "asc" }, "company")).toEqual({ key: "company", dir: "desc" });
    expect(nextSort({ key: "company", dir: "desc" }, "company")).toEqual({ key: "company", dir: "asc" });
  });
});

describe("selection", () => {
  it("labels and counts page, partial and everything selections", () => {
    expect(selectionLabel({ ids: new Set(["a", "b", "c"]), all: false }, 23, 212)).toBe("3 selected");
    expect(selectionLabel({ ids: new Set(["a", "b"]), all: false }, 2, 212)).toBe("All 2 on this page selected");
    expect(selectionLabel({ ids: new Set(["a", "b"]), all: false }, 2, 2)).toBe("2 selected");
    expect(selectionLabel({ ids: new Set(), all: true }, 48, 1284)).toBe("All 1,284 selected");
    expect(selectedCount({ ids: new Set(), all: true }, 1284)).toBe(1284);
    expect(selectedCount({ ids: new Set(["a"]), all: false }, 1284)).toBe(1);
    expect(BULK_CONFIRM_AT).toBe(100);
  });
});
