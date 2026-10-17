import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING_CONFIG } from "../src/pricing-config";
import { MAX_BODY_BYTES, PRICING_INTENT_PATH, RATE_LIMIT, deliver, handlePricingIntent, verifyTurnstile } from "../src/pricing-intent";
import { hashIp } from "../src/waitlist";
import { GOOD, ORIGIN, PRICING_URL, makeCtx, makeEnv, okFetch, post, streamed, text } from "./pricing-helpers";

const NOW = new Date("2026-10-17T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const rowsConfigured = vi.mocked(PRICING_CONFIG.rows as unknown as never[]);
void rowsConfigured;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // The shipped rows are empty on purpose; tests that exercise the send give the config one sample row.
  (PRICING_CONFIG.rows as unknown as unknown[]).push({ name: "Plan name", line: "Sample", price: "$XX", billing: "a month" });
});
afterEach(() => {
  (PRICING_CONFIG.rows as unknown as unknown[]).length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the flag and the request envelope", () => {
  it("is /api/pricing-intent", () => expect(PRICING_INTENT_PATH).toBe("/api/pricing-intent"));
  it.each(["", "0", "true", "yes", undefined])("answers 404 while PRICING_INTENT_ENABLED is %j, storing nothing", async (flag) => {
    const { db, env } = makeEnv({ PRICING_INTENT_ENABLED: flag });
    const res = await handlePricingIntent(post(GOOD), env);
    expect(res.status).toBe(404);
    expect(await text(res)).toEqual({ error: "not_found" });
    expect(db.intents()).toHaveLength(0);
  });
  it.each(["GET", "PUT", "DELETE", "PATCH"])("answers %s with 405 and Allow: POST", async (method) => {
    const { env } = makeEnv();
    const res = await handlePricingIntent(post("", { method }), env);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
  it("answers 405 before the flag check, so an off flag does not hide the method", async () => {
    const { env } = makeEnv({ PRICING_INTENT_ENABLED: "0" });
    expect((await handlePricingIntent(post("", { method: "GET" }), env)).status).toBe(405);
  });
  it("refuses a cross-origin POST with 403 and stores nothing", async () => {
    const { db, env } = makeEnv();
    const res = await handlePricingIntent(post(GOOD, { headers: { origin: "https://evil.example" } }), env);
    expect(res.status).toBe(403);
    expect(db.intents()).toHaveLength(0);
  });
  it("accepts the same origin, and a request with no Origin header", async () => {
    const { env } = makeEnv();
    expect((await handlePricingIntent(post(GOOD, { headers: { origin: ORIGIN } }), env)).status).toBe(202);
    expect((await handlePricingIntent(post({ ...GOOD, email: "b@acme.co" }), env)).status).toBe(202);
  });
  it.each(["application/x-www-form-urlencoded", "text/plain", "multipart/form-data", ""])("answers content-type %j with 415", async (type) => {
    const { env } = makeEnv();
    const res = await handlePricingIntent(post(JSON.stringify(GOOD), { type }), env);
    expect(res.status).toBe(415);
  });
  it("answers a request with no content-type at all with 415", async () => {
    const { env } = makeEnv();
    expect((await handlePricingIntent(new Request(PRICING_URL, { method: "POST" }), env)).status).toBe(415);
  });
  it("accepts JSON with a charset and any casing", async () => {
    const { env } = makeEnv();
    expect((await handlePricingIntent(post(GOOD, { type: "Application/JSON; charset=utf-8" }), env)).status).toBe(202);
  });
  it("sends no-store and nosniff on every answer", async () => {
    const { env } = makeEnv();
    for (const res of [await handlePricingIntent(post(GOOD), env), await handlePricingIntent(post({}), env), await handlePricingIntent(post("", { method: "GET" }), env)]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("the body", () => {
  it("answers a declared body over the cap with 413", async () => {
    const { db, env } = makeEnv();
    const res = await handlePricingIntent(post({ ...GOOD, fullName: "a".repeat(MAX_BODY_BYTES) }), env);
    expect(res.status).toBe(413);
    expect(db.intents()).toHaveLength(0);
  });
  it("answers a streamed body over the cap with 413", async () => {
    const { env } = makeEnv();
    expect((await handlePricingIntent(streamed(MAX_BODY_BYTES + 1), env)).status).toBe(413);
  });
  it("accepts a body at the cap", async () => {
    const { env } = makeEnv();
    const pad = "x".repeat(MAX_BODY_BYTES - JSON.stringify({ ...GOOD, pad: "" }).length);
    const raw = JSON.stringify({ ...GOOD, pad });
    expect(raw.length).toBe(MAX_BODY_BYTES);
    expect((await handlePricingIntent(post(raw), env)).status).toBe(202);
  });
  it.each(["not json", "", "[1,2]", "null", "42", '"str"', "{"])("answers %j with 400 invalid_body", async (raw) => {
    const { env } = makeEnv();
    const res = await handlePricingIntent(post(raw), env);
    expect(res.status).toBe(400);
    expect(await text(res)).toEqual({ error: "invalid_body" });
  });
  it("treats a request with no body as an empty body", async () => {
    const { env } = makeEnv();
    const req = new Request(PRICING_URL, { method: "POST", headers: { "content-type": "application/json" } });
    expect((await handlePricingIntent(req, env)).status).toBe(400);
  });
  it("ignores unknown fields", async () => {
    const { db, env } = makeEnv();
    expect((await handlePricingIntent(post({ ...GOOD, admin: true, id: 7 }), env)).status).toBe(202);
    expect(db.intents()[0]).not.toHaveProperty("admin");
  });
});

describe("validation answers", () => {
  it.each([
    [{ fullName: "" }, "fullName"], [{ fullName: "a".repeat(81) }, "fullName"], [{ industry: "" }, "industry"], [{ industry: "mining" }, "industry"],
    [{ industry: "other", otherText: "" }, "otherText"], [{ email: "nope" }, "email"], [{ phone: "0712345678" }, "phone"],
  ])("%j -> 422 on %s, storing nothing", async (patch, field) => {
    const { db, env } = makeEnv();
    const res = await handlePricingIntent(post({ ...GOOD, ...patch }), env);
    expect(res.status).toBe(422);
    expect(await text(res)).toEqual({ error: "invalid_field", field });
    expect(db.intents()).toHaveLength(0);
  });
});

describe("storing a request", () => {
  it("answers 202 queued and stores the cleaned lead, the country and a hash, never the IP", async () => {
    const { db, env } = makeEnv({ IP_HASH_SALT: "pepper" });
    const res = await handlePricingIntent(post({ ...GOOD, fullName: "  Wanjiru   Kamau ", industry: "other", otherText: " Bees ", website: "" }), env);
    expect(res.status).toBe(202);
    expect(await text(res)).toEqual({ status: "queued" });
    const [row] = db.intents();
    expect(row).toMatchObject({
      email: "wanjiru@acme.co", full_name: "Wanjiru Kamau", industry: "other", other_text: "Bees", phone: "+254712345678", free_mail: 0, source: "hero", country: "KE",
      created_at: NOW.toISOString(), emailed_at: null, ip_hash: await hashIp("203.0.113.7", "pepper"),
    });
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
  });
  it("stores NULL for the phone and other text when they are not given, and flags free mail", async () => {
    const { db, env } = makeEnv();
    await handlePricingIntent(post({ fullName: "A", industry: "education", email: "a@gmail.com" }), env);
    expect(db.intents()[0]).toMatchObject({ phone: null, other_text: null, free_mail: 1, source: "pricing-page" });
  });
  it("stores a missing or odd country as NULL and a missing IP under a shared hash", async () => {
    const { db, env } = makeEnv();
    await handlePricingIntent(post(GOOD, { country: "ZZZ", ip: null }), env);
    await handlePricingIntent(post({ ...GOOD, email: "b@acme.co" }, { cf: false, ip: null }), env);
    const rows = db.intents();
    expect(rows.map((r) => r.country)).toEqual([null, null]);
    expect(rows[0]!.ip_hash).toBe(await hashIp("unknown"));
    expect(rows[1]!.ip_hash).toBe(rows[0]!.ip_hash);
  });
  it("handles Unicode names and keeps SQL metacharacters inert", async () => {
    const { db, env } = makeEnv();
    const name = "Zoë'); DROP TABLE pricing_intents;--";
    expect((await handlePricingIntent(post({ ...GOOD, fullName: name }), env)).status).toBe(202);
    expect(db.intents()[0]!.full_name).toBe(name);
  });
  it("a repeat of the same email adds a row and sends again, within the hourly limit, and never says 'exists'", async () => {
    const { db, env } = makeEnv({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" });
    const fetcher = okFetch();
    const { ctx, settle } = makeCtx();
    for (let i = 0; i < 2; i += 1) {
      const res = await handlePricingIntent(post(GOOD), env, ctx, fetcher);
      expect(res.status).toBe(202);
      expect(await text(res)).toEqual({ status: "queued" });
    }
    await settle();
    expect(db.intents()).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("the honeypot", () => {
  it.each(["http://spam.example", "x", " "])("answers 202, storing and sending nothing, when website is %j", async (website) => {
    const { db, env } = makeEnv({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" });
    const fetcher = okFetch();
    const { ctx, settle } = makeCtx();
    const res = await handlePricingIntent(post({ ...GOOD, website }), env, ctx, fetcher);
    await settle();
    expect(res.status).toBe(202);
    expect(await text(res)).toEqual({ status: "queued" });
    expect(db.intents()).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("answers 202 even for an otherwise invalid body (a bot learns nothing)", async () => {
    const { env } = makeEnv();
    expect((await handlePricingIntent(post({ website: "x" }), env)).status).toBe(202);
  });
  it("lets an empty or non-string website through to validation", async () => {
    const { db, env } = makeEnv();
    expect((await handlePricingIntent(post({ ...GOOD, website: "" }), env)).status).toBe(202);
    expect((await handlePricingIntent(post({ ...GOOD, email: "b@acme.co", website: 5 }), env)).status).toBe(202);
    expect(db.intents()).toHaveLength(2);
  });
});

describe("rate limits", () => {
  const ipHash = () => hashIp("203.0.113.7");
  it("allows RATE_LIMIT.ip.max requests per IP in the window and answers the next with 429 + Retry-After", async () => {
    const { db, env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.ip.max; i += 1) {
      expect((await handlePricingIntent(post({ ...GOOD, email: `p${i}@acme.co` }), env)).status).toBe(202);
    }
    const res = await handlePricingIntent(post({ ...GOOD, email: "late@acme.co" }), env);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("600");
    expect(await text(res)).toEqual({ error: "rate_limited" });
    expect(db.intents()).toHaveLength(RATE_LIMIT.ip.max);
  });
  it("lets the same IP back in after the window", async () => {
    const { db, env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.ip.max; i += 1) db.insertIntent({ email: `o${i}@acme.co`, created_at: minutesAgo(11), ip_hash: await ipHash() });
    expect((await handlePricingIntent(post(GOOD), env)).status).toBe(202);
  });
  it("still limits at 9 minutes, and does not count another IP's rows", async () => {
    const { db, env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.ip.max; i += 1) db.insertIntent({ email: `o${i}@acme.co`, created_at: minutesAgo(9), ip_hash: await ipHash() });
    expect((await handlePricingIntent(post(GOOD), env)).status).toBe(429);
    expect((await handlePricingIntent(post(GOOD, { ip: "198.51.100.2" }), env)).status).toBe(202);
  });
  it("answers 202 without storing or sending when one address was already asked for 3 times this hour", async () => {
    const { db, env } = makeEnv({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" });
    for (let i = 0; i < RATE_LIMIT.email.max; i += 1) db.insertIntent({ email: "wanjiru@acme.co", created_at: minutesAgo(30), ip_hash: `other${i}` });
    const fetcher = okFetch();
    const { ctx, settle } = makeCtx();
    const res = await handlePricingIntent(post(GOOD), env, ctx, fetcher);
    await settle();
    expect(res.status).toBe(202);
    expect(await text(res)).toEqual({ status: "queued" });
    expect(db.intents()).toHaveLength(RATE_LIMIT.email.max);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("counts the hour per address and forgets it after 61 minutes", async () => {
    const { db, env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.email.max; i += 1) db.insertIntent({ email: "wanjiru@acme.co", created_at: minutesAgo(61), ip_hash: `old${i}` });
    expect((await handlePricingIntent(post(GOOD), env)).status).toBe(202);
    expect(db.intents()).toHaveLength(RATE_LIMIT.email.max + 1);
  });
});

describe("Turnstile (optional)", () => {
  const verifyOk = (success: boolean) => vi.fn(async () => new Response(JSON.stringify({ success }), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  it("is not asked for when no TURNSTILE_SECRET is set", async () => {
    const { env } = makeEnv();
    const fetcher = verifyOk(false);
    expect((await handlePricingIntent(post(GOOD), env, undefined, fetcher)).status).toBe(202);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("lets a verified token through, sending the IP to Cloudflare", async () => {
    const { env } = makeEnv({ TURNSTILE_SECRET: "s" });
    const fetcher = verifyOk(true);
    expect((await handlePricingIntent(post({ ...GOOD, "cf-turnstile-response": "tok" }), env, undefined, fetcher)).status).toBe(202);
    const body = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: "s", response: "tok", remoteip: "203.0.113.7" });
  });
  it.each([[{}, "no token"], [{ "cf-turnstile-response": "" }, "an empty token"], [{ "cf-turnstile-response": 5 }, "a non-string"], [{ "cf-turnstile-response": "x".repeat(2049) }, "an oversized token"]])(
    "answers 429 challenge_failed for %j (%s) without calling Cloudflare",
    async (extra, _why) => {
      const { db, env } = makeEnv({ TURNSTILE_SECRET: "s" });
      const fetcher = verifyOk(true);
      const res = await handlePricingIntent(post({ ...GOOD, ...extra }), env, undefined, fetcher);
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("600");
      expect(await text(res)).toEqual({ error: "challenge_failed" });
      expect(fetcher).not.toHaveBeenCalled();
      expect(db.intents()).toHaveLength(0);
    },
  );
  it("answers 429 when Cloudflare says the token is bad", async () => {
    const { env } = makeEnv({ TURNSTILE_SECRET: "s" });
    expect((await handlePricingIntent(post({ ...GOOD, "cf-turnstile-response": "tok" }), env, undefined, verifyOk(false))).status).toBe(429);
  });
  describe("verifyTurnstile", () => {
    it("omits remoteip without an IP", async () => {
      const fetcher = verifyOk(true);
      expect(await verifyTurnstile("s", "tok", null, fetcher)).toBe(true);
      expect(Object.fromEntries((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams)).toEqual({ secret: "s", response: "tok" });
    });
    it("is false for a non-OK status, a missing success, and a thrown error", async () => {
      expect(await verifyTurnstile("s", "tok", null, (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch)).toBe(false);
      expect(await verifyTurnstile("s", "tok", null, (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch)).toBe(false);
      expect(await verifyTurnstile("s", "tok", null, (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBe(false);
    });
    it("uses the global fetch by default", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
      const { env } = makeEnv({ TURNSTILE_SECRET: "s" });
      expect((await handlePricingIntent(post({ ...GOOD, "cf-turnstile-response": "tok" }), env)).status).toBe(202);
      expect(spy).toHaveBeenCalledOnce();
    });
  });
});

describe("the email after the answer", () => {
  const withMail = () => makeEnv({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" });
  it("sends the pricing and stamps emailed_at", async () => {
    const { db, env } = withMail();
    const fetcher = okFetch();
    const { ctx, settle } = makeCtx();
    expect((await handlePricingIntent(post(GOOD), env, ctx, fetcher)).status).toBe(202);
    expect(db.intents()[0]!.emailed_at).toBeNull(); // not before the answer
    await settle();
    expect(db.intents()[0]!.emailed_at).toBe(NOW.toISOString());
    const body = JSON.parse(((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(body).toMatchObject({ templateId: "A-tpl", to: { email: "wanjiru@acme.co", name: "Wanjiru Kamau" } });
    expect(body.dynamicData.first_name).toBe("Wanjiru");
  });
  it("still answers 202 and leaves emailed_at empty when AutoSend refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, env } = withMail();
    const { ctx, settle } = makeCtx();
    const res = await handlePricingIntent(post(GOOD), env, ctx, (async () => new Response("", { status: 500 })) as unknown as typeof fetch);
    await settle();
    expect(res.status).toBe(202);
    expect(db.intents()[0]!.emailed_at).toBeNull();
  });
  it("still answers 202 when the key is missing (nothing is sent)", async () => {
    const { db, env } = makeEnv();
    const fetcher = okFetch();
    const { ctx, settle } = makeCtx();
    expect((await handlePricingIntent(post(GOOD), env, ctx, fetcher)).status).toBe(202);
    await settle();
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.intents()[0]!.emailed_at).toBeNull();
  });
  it("sends nothing, and alerts, while the pricing rows are empty", async () => {
    (PRICING_CONFIG.rows as unknown as unknown[]).length = 0;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, env } = withMail();
    const fetcher = okFetch();
    const { ctx, settle } = makeCtx();
    expect((await handlePricingIntent(post(GOOD), env, ctx, fetcher)).status).toBe(202);
    await settle();
    expect(fetcher).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("ALERT"));
    expect(db.intents()).toHaveLength(1);
  });
  it("works without an execution context (nothing is scheduled)", async () => {
    const { db, env } = withMail();
    const fetcher = okFetch();
    expect((await handlePricingIntent(post(GOOD), env, undefined, fetcher)).status).toBe(202);
    expect(db.intents()).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("logs no email, name or phone anywhere", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, env } = withMail();
    const { ctx, settle } = makeCtx();
    db.failNext();
    await handlePricingIntent(post(GOOD), env, ctx, (async () => new Response("", { status: 500 })) as unknown as typeof fetch);
    await handlePricingIntent(post({ ...GOOD, email: "b@acme.co" }), env, ctx, (async () => new Response("", { status: 500 })) as unknown as typeof fetch);
    await settle();
    const logged = JSON.stringify(log.mock.calls);
    for (const secret of ["acme", "Wanjiru", "254712", "203.0.113"]) expect(logged).not.toContain(secret);
  });
  describe("deliver", () => {
    it("logs and carries on when stamping emailed_at fails", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const { db, env } = withMail();
      db.insertIntent({ email: "w@acme.co", created_at: NOW.toISOString() });
      // first statement is the UPDATE (the send itself uses fetch), so one outage hits it
      db.failNext();
      await deliver(env, { id: 1, email: "w@acme.co", fullName: "W" }, okFetch());
      expect(err).toHaveBeenCalledWith("pricing-intent: could not stamp emailed_at", "Error");
    });
    it("logs 'error' for a thrown non-Error", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const { env } = withMail();
      const broken = { prepare: () => { throw "boom"; } } as unknown as D1Database;
      await deliver({ ...env, WAITLIST_DB: broken }, { id: 1, email: "w@acme.co", fullName: "W" }, okFetch());
      expect(err).toHaveBeenCalledWith("pricing-intent: could not stamp emailed_at", "error");
    });
    it("does not touch the database when nothing was sent", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { db, env } = makeEnv();
      db.insertIntent({ email: "w@acme.co", created_at: NOW.toISOString() });
      await deliver(env, { id: 1, email: "w@acme.co", fullName: "W" }, okFetch());
      expect(db.intents()[0]!.emailed_at).toBeNull();
    });
  });
});

describe("storage failures", () => {
  it("answers 500 when D1 is down, with no detail", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, db } = makeEnv();
    db.failNext();
    const res = await handlePricingIntent(post(GOOD), env);
    expect(res.status).toBe(500);
    expect(await text(res)).toEqual({ error: "server_error" });
    expect(err).toHaveBeenCalledWith("pricing-intent: store failed", "Error");
  });
  it("answers 500 when the insert fails after the limits pass, and when the error is not an Error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, db } = makeEnv();
    const real = db.prepare.bind(db);
    let calls = 0;
    db.prepare = ((sql: string) => {
      calls += 1;
      if (calls === 3) throw "weird";
      return real(sql);
    }) as typeof db.prepare;
    const res = await handlePricingIntent(post(GOOD), env);
    expect(res.status).toBe(500);
    expect(err).toHaveBeenCalledWith("pricing-intent: store failed", "error");
  });
});

describe("migration 0002", () => {
  it("is additive: the waitlist table and rows are untouched", () => {
    const { db } = makeEnv();
    db.insert({ email: "a@b.co", created_at: NOW.toISOString(), ip_hash: "h" });
    db.insertIntent({ email: "a@b.co", created_at: NOW.toISOString() });
    expect(db.rows()).toHaveLength(1);
    expect(db.intents()).toHaveLength(1);
  });
  it("can be applied twice (IF NOT EXISTS)", async () => {
    const { readFileSync } = await import("node:fs");
    const { db } = makeEnv();
    const sql = readFileSync(new URL("../migrations/0002_create_pricing_intents.sql", import.meta.url), "utf8");
    expect(() => db.sqlite.exec(sql)).not.toThrow();
  });
  it("requires email, name, industry and created_at", () => {
    const { db } = makeEnv();
    expect(() => db.sqlite.exec("INSERT INTO pricing_intents (email) VALUES ('x')")).toThrow();
  });
});
