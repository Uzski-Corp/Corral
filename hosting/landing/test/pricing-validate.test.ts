import { describe, expect, it } from "vitest";
import {
  INDUSTRIES, NAME_MAX, OTHER_MAX, SOURCES, checkFields, cleanIndustry, cleanName, cleanOther, cleanPhone, cleanText, isFreeMail, normalizeSource,
} from "../src/pricing-validate";

const good = { fullName: "Wanjiru Kamau", industry: "agriculture-food", email: "w@acme.co" };

describe("cleanText", () => {
  it.each([
    ["  Ada   Lovelace ", "Ada Lovelace"],
    ["Ada\u0000Lovelace", "Ada Lovelace"],
    ["Ada\n\tLovelace", "Ada Lovelace"],
    ["Wanjiru Njoroge-Mwangi", "Wanjiru Njoroge-Mwangi"],
    ["Zoë Åström 李雷", "Zoë Åström 李雷"],
    ["", ""],
    ["   ", ""],
  ])("%j -> %j", (raw, clean) => expect(cleanText(raw)).toBe(clean));
  it.each([undefined, null, 4, {}, ["a"], true])("non-string %j -> null", (raw) => expect(cleanText(raw)).toBeNull());
});

describe("cleanName", () => {
  it("accepts 1 and exactly NAME_MAX characters", () => {
    expect(cleanName("A")).toBe("A");
    expect(cleanName("a".repeat(NAME_MAX))).toHaveLength(NAME_MAX);
  });
  it.each([["", "empty"], ["   ", "blank"], ["\u0000\u0001", "only control characters"], ["a".repeat(NAME_MAX + 1), "over the max"]])("rejects %s", (raw) => {
    expect(cleanName(raw)).toBeNull();
  });
  it("counts after trimming and collapsing", () => expect(cleanName(`  ${"a".repeat(NAME_MAX)}  `)).toHaveLength(NAME_MAX));
  it.each([undefined, null, 1])("rejects non-string %j", (raw) => expect(cleanName(raw)).toBeNull());
});

describe("cleanIndustry", () => {
  it.each(INDUSTRIES.map((i) => i.slug))("accepts %s", (slug) => expect(cleanIndustry(slug)).toBe(slug));
  it("has the 16 designed options, Other last", () => {
    expect(INDUSTRIES).toHaveLength(16);
    expect(INDUSTRIES.at(-1)).toEqual({ slug: "other", label: "Other" });
  });
  it.each(["", "Agriculture and food", "AGRICULTURE-FOOD", "other ", undefined, null, 3, {}])("rejects %j", (raw) => expect(cleanIndustry(raw)).toBeNull());
});

describe("cleanOther", () => {
  it("accepts 1 and exactly OTHER_MAX", () => {
    expect(cleanOther("Bees")).toBe("Bees");
    expect(cleanOther("b".repeat(OTHER_MAX))).toHaveLength(OTHER_MAX);
  });
  it.each(["", "  ", "b".repeat(OTHER_MAX + 1)])("rejects %j", (raw) => expect(cleanOther(raw)).toBeNull());
  it.each([undefined, null, 5])("rejects non-string %j", (raw) => expect(cleanOther(raw)).toBeNull());
  it("strips control characters", () => expect(cleanOther("Bee\u0007keeping")).toBe("Bee keeping"));
});

describe("cleanPhone", () => {
  it.each([
    ["+254712345678", "+254712345678"],
    ["+254 712 345 678", "+254712345678"],
    ["+254-712-345-678", "+254712345678"],
    ["+254 (712) 345.678", "+254712345678"],
    ["00254712345678", "+254712345678"],
    ["00 254 712 345 678", "+254712345678"],
    ["+1 415 555 0100", "+14155550100"],
    ["+1234567", "+1234567"],
    ["+123456789012345", "+123456789012345"],
  ])("accepts %j as %j", (raw, e164) => expect(cleanPhone(raw)).toBe(e164));
  it.each([undefined, null, "", "   ", " - ( ) "])("treats %j as not given", (raw) => expect(cleanPhone(raw)).toBe(""));
  it.each([
    ["0712345678", "a local number with no country code"],
    ["712345678", "digits only"],
    ["+0712345678", "country code starting with 0"],
    ["+254 712 abc 678", "letters"],
    ["+123456", "too short (6 digits)"],
    ["+1234567890123456", "too long (16 digits)"],
    ["+", "only a plus"],
    ["++254712345678", "two plus signs"],
    ["+254+712345678", "a plus in the middle"],
    ["0000254712345678", "00 then 00"],
  ])("rejects %j (%s)", (raw) => expect(cleanPhone(raw)).toBeNull());
  it.each([5, {}, ["+254712345678"], true])("rejects non-string %j", (raw) => expect(cleanPhone(raw)).toBeNull());
});

describe("normalizeSource", () => {
  it.each(SOURCES)("keeps %s", (s) => expect(normalizeSource(s)).toBe(s));
  it.each(["", "home", "HERO", undefined, null, 1])("%j falls back to pricing-page", (raw) => expect(normalizeSource(raw)).toBe("pricing-page"));
});

describe("isFreeMail", () => {
  it.each([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.ke", "ymail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.nl",
    "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.de", "gmx.com", "mail.com", "yandex.ru", "yandex.com",
  ])("%s is personal", (d) => expect(isFreeMail(`a@${d}`)).toBe(true));
  it.each(["acme.co", "gmail.co", "mygmail.com", "gmail.com.acme.co", "outlook.acme.com", "hotmail", "uzskicorp.agency", "protonmail.org"])("%s is not", (d) => {
    expect(isFreeMail(`a@${d}`)).toBe(false);
  });
});

describe("checkFields", () => {
  it("returns the cleaned lead", () => {
    expect(checkFields({ ...good, fullName: "  Wanjiru   Kamau ", email: " W@Acme.CO ", phone: "+254 712 345 678", source: "nav" })).toEqual({
      ok: true,
      value: { fullName: "Wanjiru Kamau", industry: "agriculture-food", otherText: null, email: "w@acme.co", phone: "+254712345678", source: "nav", freeMail: false },
    });
  });
  it("defaults the source and nulls a missing phone", () => {
    const r = checkFields(good);
    expect(r).toMatchObject({ ok: true, value: { source: "pricing-page", phone: null } });
  });
  it("flags a personal address without rejecting it", () => {
    expect(checkFields({ ...good, email: "w@gmail.com" })).toMatchObject({ ok: true, value: { freeMail: true } });
  });
  it("keeps otherText only for Other, and requires it there", () => {
    expect(checkFields({ ...good, industry: "other", otherText: " Bees " })).toMatchObject({ ok: true, value: { industry: "other", otherText: "Bees" } });
    expect(checkFields({ ...good, otherText: "ignored" })).toMatchObject({ ok: true, value: { otherText: null } });
    expect(checkFields({ ...good, otherText: 123 })).toMatchObject({ ok: true, value: { otherText: null } });
    expect(checkFields({ ...good, industry: "other" })).toEqual({ ok: false, field: "otherText" });
    expect(checkFields({ ...good, industry: "other", otherText: "x".repeat(61) })).toEqual({ ok: false, field: "otherText" });
  });
  it.each([
    [{ fullName: "" }, "fullName"],
    [{ fullName: undefined }, "fullName"],
    [{ industry: "" }, "industry"],
    [{ industry: "mining" }, "industry"],
    [{ email: "nope" }, "email"],
    [{ email: undefined }, "email"],
    [{ phone: "0712345678" }, "phone"],
    [{ phone: 712 }, "phone"],
  ])("%j names the field %s", (patch, field) => expect(checkFields({ ...good, ...patch })).toEqual({ ok: false, field }));
  it("reports the first bad field in the form's order", () => {
    expect(checkFields({ fullName: "", industry: "x", email: "x", phone: "x" })).toEqual({ ok: false, field: "fullName" });
    expect(checkFields({ fullName: "A", industry: "x", email: "x", phone: "x" })).toEqual({ ok: false, field: "industry" });
    expect(checkFields({ fullName: "A", industry: "other", email: "x", phone: "x" })).toEqual({ ok: false, field: "otherText" });
    expect(checkFields({ fullName: "A", industry: "education", email: "x", phone: "x" })).toEqual({ ok: false, field: "email" });
    expect(checkFields({ fullName: "A", industry: "education", email: "a@b.co", phone: "x" })).toEqual({ ok: false, field: "phone" });
  });
});
