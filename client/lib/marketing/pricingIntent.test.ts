import { http, HttpResponse, delay } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw";
import {
  DEFAULT_RETRY_SECONDS, EMPTY, FIELD_ORDER, INDUSTRIES, NAME_MAX, OTHER_MAX, PRICING_INTENT_ENDPOINT, cleanPhone, cleanText, firstInvalid, groupPhone, isFreeMail,
  requestPricing, validate, waitWords, type Values,
} from "./pricingIntent";

const good: Values = { fullName: "Wanjiru Kamau", industry: "agriculture-food", otherText: "", email: "wanjiru@acme.co", phone: "" };
const url = () => new URL(PRICING_INTENT_ENDPOINT, window.location.origin).toString();

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PRICING_MOCK", "0"));
afterEach(() => vi.unstubAllEnvs());

describe("cleanText", () => {
  it.each([["  a   b ", "a b"], ["a\u0000b", "a b"], ["a\n\tb", "a b"], ["", ""], ["   ", ""], ["Zoë 李雷", "Zoë 李雷"]])("%j -> %j", (raw, clean) => expect(cleanText(raw)).toBe(clean));
});

describe("cleanPhone", () => {
  it.each([
    ["+254712345678", "+254712345678"], ["+254 712 345 678", "+254712345678"], ["+254-712-345-678", "+254712345678"], ["+254 (712) 345.678", "+254712345678"],
    ["00254712345678", "+254712345678"], ["+1 415 555 0100", "+14155550100"], ["+1234567", "+1234567"], ["+123456789012345", "+123456789012345"],
  ])("accepts %j", (raw, e164) => expect(cleanPhone(raw)).toBe(e164));
  it.each(["", "   ", " - ( ) "])("%j is empty (optional)", (raw) => expect(cleanPhone(raw)).toBe(""));
  it.each(["0712345678", "712345678", "+0712345678", "+254 712 abc 678", "+123456", "+1234567890123456", "+", "++254712345678", "+254+712345678"])("rejects %j", (raw) => {
    expect(cleanPhone(raw)).toBeNull();
  });
});

describe("groupPhone", () => {
  it("groups a Kenyan number", () => expect(groupPhone("+254712345678")).toBe("+254 712 345 678"));
  it.each(["+14155550100", "+25471234567", "+2547123456789", "garbage", ""])("leaves %j as typed (null)", (v) => expect(groupPhone(v)).toBeNull());
});

describe("isFreeMail", () => {
  it.each(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.de", "mail.com", "yandex.ru"])(
    "%s", (d) => expect(isFreeMail(`a@${d}`)).toBe(true),
  );
  it("ignores case and spaces", () => expect(isFreeMail(" A@GMAIL.COM ")).toBe(true));
  it.each(["acme.co", "gmail.co", "mygmail.com", "gmail.com.acme.co", "uzskicorp.agency"])("%s is not personal", (d) => expect(isFreeMail(`a@${d}`)).toBe(false));
});

describe("validate", () => {
  it("passes a complete form, with the phone optional", () => {
    expect(validate(good)).toEqual({});
    expect(validate({ ...good, phone: "+254 712 345 678" })).toEqual({});
  });
  it("flags every empty field of a blank form but not the optional phone or the hidden other text", () => {
    expect(validate(EMPTY)).toEqual({ fullName: true, industry: true, email: true });
  });
  it("checks the name length after cleaning", () => {
    expect(validate({ ...good, fullName: "   " })).toEqual({ fullName: true });
    expect(validate({ ...good, fullName: "a".repeat(NAME_MAX) })).toEqual({});
    expect(validate({ ...good, fullName: "a".repeat(NAME_MAX + 1) })).toEqual({ fullName: true });
  });
  it("requires other text only for Other, 1 to 60 characters", () => {
    expect(validate({ ...good, industry: "other", otherText: "" })).toEqual({ otherText: true });
    expect(validate({ ...good, industry: "other", otherText: "Bees" })).toEqual({});
    expect(validate({ ...good, industry: "other", otherText: "b".repeat(OTHER_MAX) })).toEqual({});
    expect(validate({ ...good, industry: "other", otherText: "b".repeat(OTHER_MAX + 1) })).toEqual({ otherText: true });
    expect(validate({ ...good, otherText: "ignored when not Other" })).toEqual({});
  });
  it("flags a bad email and a bad phone", () => {
    expect(validate({ ...good, email: "nope" })).toEqual({ email: true });
    expect(validate({ ...good, phone: "0712345678" })).toEqual({ phone: true });
  });
  it("lists 16 industries with Other last", () => {
    expect(INDUSTRIES).toHaveLength(16);
    expect(INDUSTRIES.at(-1)).toEqual({ value: "other", label: "Other" });
  });
  it("firstInvalid follows the form's order", () => {
    expect(FIELD_ORDER).toEqual(["fullName", "industry", "otherText", "email", "phone"]);
    expect(firstInvalid({ phone: true, email: true })).toBe("email");
    expect(firstInvalid({ otherText: true, industry: true })).toBe("industry");
    expect(firstInvalid({})).toBeNull();
  });
});

describe("waitWords", () => {
  it.each([[600, "10 minutes"], [60, "1 minute"], [61, "2 minutes"], [1, "1 minute"], [0, "1 minute"], [3600, "60 minutes"]])("%i s -> %s", (s, words) => expect(waitWords(s)).toBe(words));
});

describe("requestPricing", () => {
  let body: unknown;
  const reply = (status: number, json: unknown = {}, headers: Record<string, string> = {}) =>
    server.use(http.post(url(), async ({ request }) => { body = await request.json(); return HttpResponse.json(json as Record<string, unknown>, { status, headers }); }));

  it("posts the cleaned payload and reads 202 as queued", async () => {
    reply(202, { status: "queued" });
    const r = await requestPricing({ ...good, fullName: "  Wanjiru   Kamau ", email: " Wanjiru@Acme.CO ", phone: "+254 712 345 678" }, "hero");
    expect(r).toEqual({ status: "queued" });
    expect(body).toEqual({ fullName: "Wanjiru Kamau", industry: "agriculture-food", email: "wanjiru@acme.co", phone: "+254712345678", source: "hero", website: "" });
  });
  it("sends otherText only for Other and omits an empty phone", async () => {
    reply(202);
    await requestPricing({ ...good, industry: "other", otherText: " Bees ", phone: "" }, "pricing-page");
    expect(body).toEqual({ fullName: "Wanjiru Kamau", industry: "other", otherText: "Bees", email: "wanjiru@acme.co", source: "pricing-page", website: "" });
    await requestPricing({ ...good, otherText: "stale text" }, "nav");
    expect(body).not.toHaveProperty("otherText");
  });
  it("passes the honeypot value through", async () => {
    reply(202);
    await requestPricing(good, "footer", "bot");
    expect(body).toMatchObject({ website: "bot", source: "footer" });
  });
  it("reads 422 with a known field as invalid on that field", async () => {
    reply(422, { error: "invalid_field", field: "phone" });
    expect(await requestPricing(good, "hero")).toEqual({ status: "invalid", field: "phone" });
  });
  it.each([[{ field: "nope" }], [{}], [null]])("reads 422 with an unknown field %j as an error", async (json) => {
    reply(422, json);
    expect(await requestPricing(good, "hero")).toEqual({ status: "error" });
  });
  it("reads 422 with an unreadable body as an error", async () => {
    server.use(http.post(url(), () => new HttpResponse("not json", { status: 422 })));
    expect(await requestPricing(good, "hero")).toEqual({ status: "error" });
  });
  it("reads 429 with Retry-After as rate limited, falling back to 10 minutes", async () => {
    reply(429, {}, { "retry-after": "120" });
    expect(await requestPricing(good, "hero")).toEqual({ status: "rate_limited", retryAfter: 120 });
    reply(429, {}, { "retry-after": "soon" });
    expect(await requestPricing(good, "hero")).toEqual({ status: "rate_limited", retryAfter: DEFAULT_RETRY_SECONDS });
    reply(429);
    expect(await requestPricing(good, "hero")).toEqual({ status: "rate_limited", retryAfter: DEFAULT_RETRY_SECONDS });
    reply(429, {}, { "retry-after": "0" });
    expect(await requestPricing(good, "hero")).toEqual({ status: "rate_limited", retryAfter: DEFAULT_RETRY_SECONDS });
  });
  it.each([200, 201, 400, 403, 404, 413, 415, 500, 503])("reads %i as an error (only 202 is success)", async (status) => {
    reply(status);
    expect(await requestPricing(good, "hero")).toEqual({ status: "error" });
  });
  it("reads a network failure as an error", async () => {
    server.use(http.post(url(), () => HttpResponse.error()));
    expect(await requestPricing(good, "hero")).toEqual({ status: "error" });
  });
  it("gives up after the timeout and reads it as an error", async () => {
    server.use(http.post(url(), async () => { await delay("infinite"); return HttpResponse.json({}); }));
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    expect(await requestPricing(good, "hero")).toEqual({ status: "error" });
  });
});

describe("the dev mock", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PRICING_MOCK", "1"); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());
  const run = async (email: string) => { const p = requestPricing({ ...good, email }, "hero"); await vi.advanceTimersByTimeAsync(700); return p; };
  it("answers queued, error for fail and rate_limited for limit after 700 ms, never calling the network", async () => {
    expect(await run("ok@acme.co")).toEqual({ status: "queued" });
    expect(await run("fail@acme.co")).toEqual({ status: "error" });
    expect(await run("LIMIT@acme.co")).toEqual({ status: "rate_limited", retryAfter: DEFAULT_RETRY_SECONDS });
  });
  it("is on by default in development, off in test and production, and =0 turns it off", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    expect(await run("ok@acme.co")).toEqual({ status: "queued" });
    vi.stubEnv("NEXT_PUBLIC_PRICING_MOCK", "0");
    server.use(http.post(url(), () => HttpResponse.json({}, { status: 500 })));
    vi.useRealTimers();
    expect(await requestPricing(good, "hero")).toEqual({ status: "error" });
  });
});
