import { describe, expect, it } from "vitest";
import {
  bounceSpike, gateText, healthOf, issuesOf, pct, plain, poolSummary, rate, render, sendDays, spanDays, stepDays, subjectOf, suggestVar, summaryOf,
  todayCap, tokensIn, tomorrowCap, varDef, warmupCap, type Mailbox, type Recipient, type Step,
} from "./sequence";

const r: Recipient = { id: "x", company: "Mara Cold Stores", person: "Lena Fischer", title: "", domain: "maracold.com", email: "lena@maracold.com",
  values: { first_name: { value: "Lena", kind: "site", what: "Team page" }, company: { value: "Mara Cold Stores", kind: "search", what: "Title" } } };
const step = (p: Partial<Step>): Step => ({ id: "s", thread: "new", subject: "Hi", body: "Body {{unsubscribe_link}}", ...p });
const box = (p: Partial<Mailbox>): Mailbox => ({ id: "m", address: "m@x.io", provider: "google", owner: "T", state: "warm", cap: 35, sentToday: 10, bouncedToday: 0,
  bounce30: 0.005, complaints30: 0, auth: { spf: true, dkim: true, dmarc: true }, sequences: 1, ...p });

describe("variables", () => {
  it("finds tokens with and without fallbacks", () => {
    expect(tokensIn("Hi {{first_name}}, {{ cold_storage | your rooms }}!")).toEqual([
      { raw: "{{first_name}}", key: "first_name", fallback: undefined, at: 3 },
      { raw: "{{ cold_storage | your rooms }}", key: "cold_storage", fallback: "your rooms", at: 19 },
    ]);
    expect(tokensIn("no tokens")).toEqual([]);
    expect(varDef("company")?.label).toBeTruthy();
    expect(varDef("nope")).toBeUndefined();
  });
  it("suggests the closest variable for a typo", () => {
    expect(suggestVar("frist_name")).toBe("first_name");
    expect(suggestVar("Company")).toBe("company");
    expect(suggestVar("banana")).toBeUndefined();
  });
  it("renders values, fallbacks, missing and unknown variables", () => {
    const parts = render("Hi {{first_name}} at {{company}}: {{cold_storage | your rooms}}, {{title}}, {{frist_name}}.", r);
    expect(parts.map((p) => p.t)).toEqual(["text", "var", "text", "var", "text", "fallback", "text", "missing", "text", "unknown", "text"]);
    expect(parts.find((p) => p.t === "unknown")).toMatchObject({ key: "frist_name", suggest: "first_name" });
    expect(plain(parts)).toBe("Hi Lena at Mara Cold Stores: your rooms, [title], [frist_name].");
    expect(render("plain", r)).toEqual([{ t: "text", text: "plain" }]);
  });
});

describe("steps and gates", () => {
  const steps = [step({ subject: "Overnight" }), step({ thread: "reply", subject: "", gate: { wait: 3, cond: "no-reply" } }), step({ thread: "reply", gate: { wait: 5, cond: "opened-no-reply", otherwise: "skip" } })];
  it("counts days from enrollment", () => {
    expect(stepDays(steps)).toEqual([0, 3, 8]);
    expect(spanDays(steps)).toBe(8);
    expect(spanDays([])).toBe(0);
    expect(summaryOf(steps)).toBe("3 steps · 8 days");
    expect(summaryOf([steps[0]])).toBe("1 step · 0 days");
  });
  it("describes a gate", () => {
    expect(gateText({ wait: 3, cond: "no-reply" })).toBe("Wait 3 days, if no reply");
    expect(gateText({ wait: 1, cond: "not-opened" })).toBe("Wait 1 day, if they didn't open it · otherwise stop");
    expect(gateText({ wait: 0, cond: "opened-no-reply", otherwise: "skip" })).toBe("Same day, if they opened it but didn't reply · otherwise skip to the next step");
  });
  it("reuses the thread's subject for replies", () => {
    expect(subjectOf(steps, 0)).toBe("Overnight");
    expect(subjectOf(steps, 2)).toBe("Re: Overnight");
    const odd = [step({ thread: "reply", subject: "First" }), step({ thread: "reply", subject: "x" })];
    expect(subjectOf(odd, 1)).toBe("Re: First");
  });
  it("formats rates", () => {
    expect(pct(43, 312)).toBe("13.8%");
    expect(pct(1, 0)).toBe("—");
    expect(rate(0.074)).toBe("7.4%");
  });
});

describe("launch checks", () => {
  it("passes a clean sequence", () => {
    expect(issuesOf([step({ body: "Hi {{first_name}} {{unsubscribe_link}}" })], { first_name: 0 }, 10)).toEqual([]);
  });
  it("names a missing variable without a fallback, and a missing unsubscribe link", () => {
    const out = issuesOf([step({ body: "For {{cold_storage}} and {{cold_storage}} {{unsubscribe_link}}" }), step({ thread: "reply", body: "No link" })], { cold_storage: 23 }, 86);
    expect(out.map((x) => [x.step, x.kind])).toEqual([[1, "missing-var"], [2, "unsubscribe"]]);
    expect(out[0]).toMatchObject({ count: 23, title: "Step 1: {{cold_storage}} is empty for 23 of 86 companies" });
    expect(issuesOf([step({ body: "For {{cold_storage | you}} {{unsubscribe_link}}" })], { cold_storage: 23 }, 86)).toEqual([]);
  });
  it("names empty steps, subjects and unknown variables", () => {
    const out = issuesOf([step({ subject: " ", body: "Hi {{frist_name}} {{bogus_thing}} {{unsubscribe_link}}" }), step({ body: " " })], {}, 5);
    expect(out.map((x) => x.kind)).toEqual(["subject", "unknown-var", "unknown-var", "empty"]);
    expect(out[1].fix).toBe("Did you mean {{first_name}}?");
    expect(out[2].fix).toBe("Pick one from Insert variable.");
  });
});

describe("mailbox pool", () => {
  it("ramps warm-up to the cap over 14 days", () => {
    expect(warmupCap(3, 35)).toBe(8);
    expect(warmupCap(9, 35)).toBe(20);
    expect(warmupCap(13, 20)).toBe(20);
    expect(warmupCap(14, 35)).toBe(35);
  });
  it("works out today's and tomorrow's capacity per state", () => {
    expect(todayCap(box({}))).toBe(35);
    expect(todayCap(box({ state: "disconnected" }))).toBe(0);
    expect(todayCap(box({ state: "resting", sentToday: 31 }))).toBe(31);
    expect(todayCap(box({ state: "warming", day: 9 }))).toBe(20);
    expect(todayCap(box({ state: "warming" }))).toBe(4);
    expect(tomorrowCap(box({ state: "warming", day: 9 }))).toBe(22);
    expect(tomorrowCap(box({ state: "warming" }))).toBe(6);
    expect(tomorrowCap(box({ state: "disconnected" }))).toBe(0);
    expect(tomorrowCap(box({ state: "resting" }))).toBe(35);
  });
  it("spots a bounce spike only when it's real", () => {
    expect(bounceSpike({ sentToday: 31, bouncedToday: 4, bounce30: 0.005 })).toBe(true);
    expect(bounceSpike({ sentToday: 31, bouncedToday: 2, bounce30: 0.001 })).toBe(false);
    expect(bounceSpike({ sentToday: 0, bouncedToday: 4, bounce30: 0 })).toBe(false);
    expect(bounceSpike({ sentToday: 200, bouncedToday: 4, bounce30: 0 })).toBe(false);
    expect(bounceSpike({ sentToday: 31, bouncedToday: 4, bounce30: 0.05 })).toBe(false);
  });
  it("reads health", () => {
    expect(healthOf(box({ sentToday: 31, bouncedToday: 4 }))).toMatchObject({ level: "bad", word: "Bounce spike", why: "4 of 31 bounced today (12.9%), usually 0.5%" });
    expect(healthOf(box({ auth: { spf: true, dkim: false, dmarc: false } }))).toMatchObject({ level: "bad", why: "DKIM, DMARC not passing" });
    expect(healthOf(box({ bounce30: 0.025 })).level).toBe("watch");
    expect(healthOf(box({ complaints30: 0.002 })).level).toBe("watch");
    expect(healthOf(box({}))).toMatchObject({ level: "good", word: "Healthy" });
  });
  it("sums the pool and spreads a launch", () => {
    const s = poolSummary([box({ sentToday: 31 }), box({ state: "disconnected", sentToday: 0 }), box({ state: "warming", day: 3, sentToday: 8 }), box({ state: "resting", sentToday: 31, bouncedToday: 4 })]);
    expect(s).toEqual({ sent: 70, cap: 74, tomorrow: 80, sending: 2, total: 4, attention: 2 });
    expect(sendDays(82, 137)).toBe(1);
    expect(sendDays(300, 137)).toBe(3);
    expect(sendDays(0, 10)).toBe(1);
    expect(sendDays(5, 0)).toBe(Infinity);
  });
});
