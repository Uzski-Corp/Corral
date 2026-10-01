import { describe, expect, it } from "vitest";
import type { ApiCompany, ApiCompanyDetail, ApiPerson } from "@/lib/api/leads";
import {
  EMAIL_LABEL, REPLY_LABEL, SIZE_LABEL, SOURCE_LABEL, companyToLead, detailFromApi, emailCodeOf, fitStatusOf, lastLabel, nameKey, personName, probableDuplicates,
  replyCodeOf, ruleFromApi, ruleToApi, rulesToApi, selectionToApi, skipLines, sortToApi, tabRules, viewQuery,
} from "./map";
import { RULE_FIELDS, type Rule } from "./segment";

const NOW = new Date("2026-09-30T12:00:00Z");
const person = (over: Partial<ApiPerson> = {}): ApiPerson => ({
  id: "l1", email: "wanjiru@kilima.co.ke", firstName: "Wanjiru", lastName: "Mwangi", title: "Head of Supply Chain", phone: null, linkedinUrl: null,
  emailStatus: "verified", isPrimary: true, unsubscribedAt: null, createdAt: "2026-09-01T06:00:00Z", updatedAt: "2026-09-01T06:00:00Z", ...over,
});
const company = (over: Partial<ApiCompany> = {}): ApiCompany => ({
  id: "c1", name: "Kilima Dairies", domain: "kilima.co.ke", country: "Kenya", size: "201-1000", industry: "Dairy", notes: null, source: "search",
  replyStatus: "interested", replyStatusSetBy: "corral", lastActivityAt: "2026-09-30T10:00:00Z", importId: null, fit: 94, primary: person(),
  createdAt: "2026-09-01T06:00:00Z", updatedAt: "2026-09-01T06:00:00Z", ...over,
});
const rule = (field: Rule["field"], value: Rule["value"], op: Rule["op"] = RULE_FIELDS[field].ops[0]): Rule => ({ id: "r", field, op, value });

describe("vocabularies", () => {
  it("labels every API code the way the table and the rule builder spell them", () => {
    expect(Object.values(REPLY_LABEL)).toEqual(expect.arrayContaining(RULE_FIELDS.reply.options!));
    expect(Object.values(EMAIL_LABEL)).toEqual(RULE_FIELDS.email.options);
    expect(Object.values(SOURCE_LABEL)).toEqual(RULE_FIELDS.source.options);
    expect(Object.values(SIZE_LABEL)).toEqual(RULE_FIELDS.size.options);
  });
  it("maps labels back to codes, and knows which ones the API doesn't store", () => {
    expect(replyCodeOf("Meeting booked")).toBe("meeting_booked");
    expect(replyCodeOf("OOO")).toBe("ooo");
    expect(replyCodeOf("Disqualified")).toBeNull();
    expect(emailCodeOf("Catch-all")).toBe("catch_all");
    expect(emailCodeOf("Interested")).toBeNull();
  });
});

describe("rows", () => {
  it("turns a company into the table's Lead", () => {
    expect(companyToLead(company(), NOW)).toEqual({
      id: "c1", company: "Kilima Dairies", domain: "kilima.co.ke", person: "Wanjiru Mwangi", title: "Head of Supply Chain", avatar: "", fit: 94,
      email: "Verified", reply: "Interested", last: "2h ago", why: [], country: "Kenya", size: "201–1,000", industry: "Dairy", source: "Corral search",
    });
  });
  it("fills the gaps of a company with no person, website, fit or details", () => {
    const l = companyToLead(company({ primary: null, domain: null, fit: null, country: null, size: null, industry: null, source: "import", lastActivityAt: null }), NOW);
    expect(l).toMatchObject({ person: "", title: "", domain: "", fit: 0, email: "Unverified", last: "—", country: undefined, size: undefined, source: "CSV import" });
  });
  it.each([
    [null, "—"], ["garbage", "—"], ["2026-09-30T11:59:00Z", "1h ago"], ["2026-09-30T07:00:00Z", "5h ago"],
    ["2026-09-28T12:00:00Z", "2d ago"], ["2026-09-12T12:00:00Z", "Sep 12"],
  ])("writes last activity %s as %s", (iso, want) => expect(lastLabel(iso, NOW)).toBe(want));
  it("names people from what they have", () => {
    expect(personName(null)).toBe("");
    expect(personName(person({ lastName: null }))).toBe("Wanjiru");
  });
  it("says why a company has no fit, and nothing for a scored one", () => {
    expect(fitStatusOf({ fit: 80, domain: "x.co" })).toBeUndefined();
    expect(fitStatusOf({ fit: null, domain: "x.co" })).toEqual({ kind: "none", why: "new" });
    expect(fitStatusOf({ fit: null, domain: null })).toEqual({ kind: "none", why: "no-site" });
  });
  it("builds the detail rail from the API: primary first, unsubscribed people marked, notes, when it was added", () => {
    const d: ApiCompanyDetail = { ...company({ notes: "Board meets in November", source: "import" }), fits: [],
      people: [person({ id: "l2", isPrimary: false, firstName: null, lastName: null, email: "qa@kilima.co.ke", emailStatus: "catch_all", unsubscribedAt: "2026-09-20T00:00:00Z" }), person()] };
    expect(detailFromApi(d)).toEqual({
      people: [
        { name: "Wanjiru Mwangi", title: "Head of Supply Chain", email: "wanjiru@kilima.co.ke", status: "Verified", primary: true },
        { name: "qa@kilima.co.ke", title: "Head of Supply Chain", email: "qa@kilima.co.ke", status: "Unsubscribed", primary: undefined },
      ],
      segments: [], notes: "Board meets in November", activity: [{ when: "Sep 1", what: "Added from CSV import" }],
    });
    expect(detailFromApi({ ...d, createdAt: "?", people: [person({ email: null, firstName: null, lastName: null, title: null })] }).people[0]).toMatchObject({ name: "", email: "", title: "" });
  });
});

describe("probable duplicates", () => {
  it("normalises company names", () => {
    expect(nameKey("Kilima Dairies Ltd.")).toBe("kilima dairies");
    expect(nameKey("Savanna Juice Co.")).toBe("savanna juice");
    expect(nameKey("Nyota & Sons (Holdings)")).toBe("nyota sons");
  });
  it("points the newer row at the older one, by name or by a person at a known website", () => {
    const rows = [
      company({ id: "old", createdAt: "2026-09-01T00:00:00Z" }),
      company({ id: "new", name: "Kilima Dairies Ltd", domain: null, createdAt: "2026-09-29T00:00:00Z" }),
      company({ id: "pw", name: "Pwani Fresh", domain: "https://www.pwanifresh.com/about", primary: person({ email: "b@pwanifresh.com" }), createdAt: "2026-09-02T00:00:00Z" }),
      company({ id: "pw2", name: "PF Logistics", domain: null, primary: person({ email: "x@PwaniFresh.com" }), createdAt: "2026-09-03T00:00:00Z" }),
      company({ id: "solo", name: "Mara Cold", domain: "maracold.com", primary: null }),
    ];
    expect(probableDuplicates(rows)).toEqual({ new: "old", pw2: "pw" });
  });
  it("keeps the older one even when it loads second", () => {
    expect(probableDuplicates([company({ id: "b", createdAt: "2026-09-05T00:00:00Z" }), company({ id: "a", createdAt: "2026-09-01T00:00:00Z" })])).toEqual({ b: "a" });
  });
});

describe("rules", () => {
  it("speaks the API's codes for vocabulary fields and keeps free text as typed", () => {
    expect(ruleToApi(rule("reply", ["Meeting booked", "OOO"]), null)).toEqual({ field: "reply", op: "is", value: ["meeting_booked", "ooo"] });
    expect(ruleToApi(rule("email", ["Catch-all"], "not"), null)).toEqual({ field: "email", op: "not", value: ["catch_all"] });
    expect(ruleToApi(rule("source", ["CSV import"]), null)).toEqual({ field: "source", op: "is", value: ["import"] });
    expect(ruleToApi(rule("size", ["201–1,000", "1,000+"]), null)).toEqual({ field: "size", op: "is", value: ["201-1000", "1000+"] });
    expect(ruleToApi(rule("country", "Kenya, Uganda"), null)).toEqual({ field: "country", op: "is", value: ["Kenya", "Uganda"] });
    expect(ruleToApi(rule("industry", ["Something new"]), null)).toEqual({ field: "industry", op: "is", value: ["Something new"] });
    expect(ruleToApi(rule("title", "  quality "), null)).toEqual({ field: "title", op: "contains", value: "quality" });
  });
  it("sends fit for the product, and can't without one", () => {
    expect(ruleToApi(rule("fit", "85", "lte"), "p1")).toEqual({ field: "fit", op: "lte", value: 85, product_id: "p1" });
    expect(ruleToApi(rule("fit", 85), null)).toBeNull();
  });
  it("leaves unfinished rules out", () => {
    expect(rulesToApi([rule("fit", "120"), rule("reply", []), rule("title", " "), rule("country", ["Kenya"])], "p1")).toEqual([{ field: "country", op: "is", value: ["Kenya"] }]);
  });
  it("reads a saved rule back in the builder's words", () => {
    expect(ruleFromApi({ field: "reply", op: "not", value: ["not_interested", "custom"] })).toMatchObject({ field: "reply", op: "not", value: ["Not interested", "custom"] });
    expect(ruleFromApi({ field: "fit", op: "gte", value: 70, product_id: "p1" })).toMatchObject({ field: "fit", value: 70, id: expect.stringMatching(/^ar\d+$/) });
    expect(ruleFromApi({ field: "country", op: "is", value: ["Kenya"] }).value).toEqual(["Kenya"]);
  });
  it("round-trips every vocabulary value", () => {
    for (const field of ["reply", "email", "source", "size"] as const) {
      const r = rule(field, RULE_FIELDS[field].options!);
      expect(ruleFromApi(ruleToApi(r, null)!).value).toEqual(RULE_FIELDS[field].options);
    }
  });
});

describe("tabs and the view query", () => {
  it("says each tab as rules", () => {
    expect(tabRules("all", "p1")).toEqual([]);
    expect(tabRules("fit", "p1")).toEqual([{ field: "fit", op: "gte", value: 80, product_id: "p1" }]);
    expect(tabRules("fit", null)).toEqual([]);
    expect(tabRules("seq", null)).toEqual([{ field: "reply", op: "is", value: ["contacted", "ooo"] }]);
    expect(tabRules("rep", null)[0].value).toEqual(["interested", "objection", "meeting_booked", "referral", "not_interested"]);
  });
  it("ANDs the tab with the chips", () => {
    const q = viewQuery("seq", [rule("country", ["Kenya"])], "all", null);
    expect(q).toEqual({ rules: [{ field: "reply", op: "is", value: ["contacted", "ooo"] }, { field: "country", op: "is", value: ["Kenya"] }], match: "all", tabDropped: false });
    expect(viewQuery("seq", [rule("country", ["Kenya"])], "any", null).tabDropped).toBe(false);
    expect(viewQuery(null, [rule("country", ["Kenya"])], "any", null)).toEqual({ rules: [{ field: "country", op: "is", value: ["Kenya"] }], match: "any", tabDropped: false });
  });
  it("can't nest a tab with 'any' chips, so says the tab was dropped", () => {
    const q = viewQuery("rep", [rule("country", ["Kenya"]), rule("industry", ["Dairy"])], "any", null);
    expect(q).toEqual({ rules: [{ field: "country", op: "is", value: ["Kenya"] }, { field: "industry", op: "is", value: ["Dairy"] }], match: "any", tabDropped: true });
  });
  it("sorts by fit only with a product", () => {
    expect(sortToApi({ key: "fit", dir: "desc" }, "p1")).toEqual({ key: "fit", dir: "desc" });
    expect(sortToApi({ key: "fit", dir: "asc" }, null)).toEqual({ key: "created", dir: "desc" });
    expect(sortToApi({ key: "company", dir: "asc" }, null)).toEqual({ key: "company", dir: "asc" });
  });
  it("sends a selection as ids, or as everything the view matches", () => {
    const q = { rules: [{ field: "country" as const, op: "is" as const, value: ["Kenya"] }], match: "all" as const };
    expect(selectionToApi({ ids: new Set(["a", "b"]), all: false }, q)).toEqual({ ids: ["a", "b"] });
    expect(selectionToApi({ ids: new Set(), all: true }, q)).toEqual({ all: true, ...q });
  });
});

describe("enroll dry run", () => {
  it("uses the confirm dialog's copy, folding unsubscribed and said-no into one line", () => {
    expect(skipLines([{ reason: "unsubscribed", n: 3 }, { reason: "not_interested", n: 2 }, { reason: "replied_recently", n: 9 }, { reason: "no_verified_email", n: 4 }, { reason: "brand_new", n: 1 }]))
      .toEqual([[5, "unsubscribed or said no"], [9, "replied in the last 30 days"], [4, "no verified email yet"], [1, "brand new"]]);
    expect(skipLines([])).toEqual([]);
  });
});
