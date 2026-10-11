import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BODY_BYTES,
  RATE_LIMIT,
  SOURCES,
  formRedirect,
  handleWaitlist,
  hashIp,
  normalizeEmail,
  normalizeSource,
  readCapped,
} from "../src/waitlist";
import { ORIGIN, URL_, body, makeEnv, postForm, postJson, streamed } from "./helpers";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("normalizeEmail", () => {
  it.each([
    ["  Ada@Example.COM ", "ada@example.com"],
    ["a@b.co", "a@b.co"],
    ["first.last+tag@sub.example.co.ke", "first.last+tag@sub.example.co.ke"],
    ["krak-smoke+1@uzskicorp.agency", "krak-smoke+1@uzskicorp.agency"],
  ])("accepts %j as %j", (raw, clean) => {
    expect(normalizeEmail(raw)).toBe(clean);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["plain", "no @"],
    ["a@b", "no dot in the domain"],
    ["a@b.c", "one-letter TLD"],
    ["a@@b.co", "two @"],
    ["a b@c.co", "inner space"],
    ["a@b..co", "empty domain label"],
    ["a@.co", "leading dot in the domain"],
    ["@b.co", "empty local part"],
    ["a@b.co.", "trailing dot"],
    ["a\u0000@b.co", "control character"],
    [`${"a".repeat(65)}@b.co`, "local part over 64"],
    [`a@${"b".repeat(250)}.co`, "over 254 characters"],
  ])("rejects %j (%s)", (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });

  it.each([undefined, null, 42, {}, ["a@b.co"]])("rejects the non-string %j", (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });

  it("accepts exactly 64 characters before the @ and exactly 254 overall", () => {
    expect(normalizeEmail(`${"a".repeat(64)}@b.co`)).not.toBeNull();
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(60)}`;
    const email = `a@${domain}`;
    expect(email).toHaveLength(254);
    expect(normalizeEmail(email)).toBe(email);
    expect(normalizeEmail(`a${email}`)).toBeNull();
  });
});

describe("normalizeSource", () => {
  it.each(SOURCES)("keeps %s", (source) => {
    expect(normalizeSource(source)).toBe(source);
  });
  it.each(["v5", "V1", "", "home ", 1, null, undefined, {}])("falls back to unknown for %j", (raw) => {
    expect(normalizeSource(raw)).toBe("unknown");
  });
});

describe("hashIp", () => {
  it("is the hex SHA-256 of the IP and never contains it", async () => {
    const hash = await hashIp("203.0.113.7");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
    const expected = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("203.0.113.7"));
    expect(hash).toBe(Buffer.from(expected).toString("hex"));
  });
  it("is stable per IP and differs between IPs", async () => {
    expect(await hashIp("198.51.100.1")).toBe(await hashIp("198.51.100.1"));
    expect(await hashIp("198.51.100.1")).not.toBe(await hashIp("198.51.100.2"));
  });
  it("mixes in the salt when one is set", async () => {
    expect(await hashIp("198.51.100.1", "pepper")).not.toBe(await hashIp("198.51.100.1"));
    expect(await hashIp("198.51.100.1", "pepper")).toBe(await hashIp("pepper:198.51.100.1"));
  });
});

describe("readCapped", () => {
  const req = (init: RequestInit) => new Request(URL_, { method: "POST", ...init });

  it("returns the body when it fits", async () => {
    expect(await readCapped(req({ body: "hello" }), 5)).toBe("hello");
  });
  it("returns an empty string when there is no body", async () => {
    expect(await readCapped(req({}), 5)).toBe("");
  });
  it("refuses a declared content-length over the cap without reading", async () => {
    const r = req({ body: "hi", headers: { "content-length": "99999" } });
    expect(await readCapped(r, 10)).toBeNull();
    expect(r.bodyUsed).toBe(false);
  });
  it("refuses a streamed body that grows past the cap", async () => {
    expect(await readCapped(streamed(MAX_BODY_BYTES + 1), MAX_BODY_BYTES)).toBeNull();
  });
  it("joins a multi-chunk stream that fits", async () => {
    expect(await readCapped(streamed(1500, "application/json", 100), MAX_BODY_BYTES)).toBe("a".repeat(1500));
  });
  it("decodes UTF-8 across chunks", async () => {
    expect(await readCapped(req({ body: "wanjirü@例え.jp" }), 100)).toBe("wanjirü@例え.jp");
  });
});

describe("formRedirect", () => {
  const withReferer = (referer?: string) =>
    new Request(URL_, { method: "POST", headers: referer === undefined ? {} : { referer } });

  it("goes back to the same-origin Referer path, keeping its query and replacing its hash", () => {
    const res = formRedirect(withReferer(`${ORIGIN}/v/3?utm=x#old`), "joined");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/3?utm=x#waitlist-joined`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    ["no Referer", undefined],
    ["a cross-origin Referer", "https://evil.example/v/1"],
    ["a lookalike host", "https://corral.uzskicorp.agency.evil.example/v/1"],
    ["another scheme", "http://corral.uzskicorp.agency/v/1"],
    ["a malformed Referer", "not a url"],
  ])("falls back to / with %s", (_label, referer) => {
    expect(formRedirect(withReferer(referer), "error").headers.get("location")).toBe(`${ORIGIN}/#waitlist-error`);
  });
  it.each(["joined", "exists", "invalid", "error"] as const)("uses #waitlist-%s", (outcome) => {
    expect(formRedirect(withReferer(`${ORIGIN}/`), outcome).headers.get("location")).toBe(`${ORIGIN}/#waitlist-${outcome}`);
  });
});

describe("POST /api/waitlist (JSON)", () => {
  it("joins a new address: 201, stored trimmed and lowercased with source, country, time and IP hash", async () => {
    const { db, env } = makeEnv();
    const res = await handleWaitlist(postJson({ email: "  Wanjiru@Kilima.CO.KE ", source: "v3" }), env);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await body(res)).toEqual({ status: "joined" });
    expect(db.rows()).toEqual([
      {
        email: "wanjiru@kilima.co.ke",
        source: "v3",
        country: "KE",
        created_at: NOW.toISOString(),
        ip_hash: await hashIp("203.0.113.7"),
      },
    ]);
  });

  it("never stores the raw IP anywhere in the row", async () => {
    const { db, env } = makeEnv();
    await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }, { ip: "198.51.100.23" }), env);
    expect(JSON.stringify(db.rows())).not.toContain("198.51.100.23");
  });

  it("uses the salt for the stored hash when IP_HASH_SALT is set", async () => {
    const { db, env } = makeEnv("s3cret");
    await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }), env);
    expect(db.rows()[0]!.ip_hash).toBe(await hashIp("203.0.113.7", "s3cret"));
  });

  it("hashes a stand-in when there is no client IP header", async () => {
    const { db, env } = makeEnv();
    await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }, { ip: null }), env);
    expect(db.rows()[0]!.ip_hash).toBe(await hashIp("unknown"));
  });

  it("answers 200 exists for an address already on the list, in any case, and keeps the first row", async () => {
    const { db, env } = makeEnv();
    await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }), env);
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    const res = await handleWaitlist(postJson({ email: " A@B.CO", source: "v4" }, { country: "US" }), env);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ status: "exists" });
    expect(db.rows()).toHaveLength(1);
    expect(db.rows()[0]).toMatchObject({ source: "v1", country: "KE", created_at: NOW.toISOString() });
  });

  it.each(SOURCES)("stores source %s", async (source) => {
    const { db, env } = makeEnv();
    await handleWaitlist(postJson({ email: "a@b.co", source }), env);
    expect(db.rows()[0]!.source).toBe(source);
  });

  it.each([["v9"], [""], [7], [null], [undefined]])("stores unknown for the bad source %j", async (source) => {
    const { db, env } = makeEnv();
    const res = await handleWaitlist(postJson({ email: "a@b.co", source }), env);
    expect(res.status).toBe(201);
    expect(db.rows()[0]!.source).toBe("unknown");
  });

  it.each([
    ["no cf object", { cf: false }],
    ["no country", { country: undefined }],
    ["a malformed country", { country: "Kenya" }],
    ["a non-string country", { country: 404 }],
  ])("stores a null country with %s", async (_label, opts) => {
    const { db, env } = makeEnv();
    await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }, opts), env);
    expect(db.rows()[0]!.country).toBeNull();
  });

  it("keeps Cloudflare's special country codes (T1 = Tor)", async () => {
    const { db, env } = makeEnv();
    await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }, { country: "T1" }), env);
    expect(db.rows()[0]!.country).toBe("T1");
  });

  it.each([
    [{ email: "nope", source: "v1" }],
    [{ email: "", source: "v1" }],
    [{ source: "v1" }],
    [{ email: 12, source: "v1" }],
    [{ email: ["a@b.co"], source: "v1" }],
  ])("answers 422 invalid_email for %j and stores nothing", async (payload) => {
    const { db, env } = makeEnv();
    const res = await handleWaitlist(postJson(payload), env);
    expect(res.status).toBe(422);
    expect(await body(res)).toEqual({ error: "invalid_email" });
    expect(db.rows()).toEqual([]);
  });

  it.each([["{not json"], ["[]"], ["null"], ['"a@b.co"'], ["42"], [""]])(
    "answers 400 invalid_body for the body %j",
    async (raw) => {
      const { db, env } = makeEnv();
      const res = await handleWaitlist(postJson(raw), env);
      expect(res.status).toBe(400);
      expect(await body(res)).toEqual({ error: "invalid_body" });
      expect(db.rows()).toEqual([]);
    },
  );

  it("accepts a content-type with parameters and odd casing", async () => {
    const { env } = makeEnv();
    const req = postJson({ email: "a@b.co", source: "v1" }, { headers: { "content-type": "Application/JSON; charset=UTF-8" } });
    expect((await handleWaitlist(req, env)).status).toBe(201);
  });

  it.each([["text/plain"], ["multipart/form-data; boundary=x"], [""]])("answers 415 for content-type %j", async (type) => {
    const { db, env } = makeEnv();
    const req = new Request(URL_, { method: "POST", headers: type ? { "content-type": type } : {}, body: "email=a@b.co" });
    if (!type) req.headers.delete("content-type");
    const res = await handleWaitlist(req, env);
    expect(res.status).toBe(415);
    expect(await body(res)).toEqual({ error: "unsupported_media_type" });
    expect(db.rows()).toEqual([]);
  });

  it("answers 413 when the declared body is over the cap", async () => {
    const { env } = makeEnv();
    const req = postJson({ email: "a@b.co", source: "v1" }, { headers: { "content-length": String(MAX_BODY_BYTES + 1) } });
    const res = await handleWaitlist(req, env);
    expect(res.status).toBe(413);
    expect(await body(res)).toEqual({ error: "payload_too_large" });
  });

  it("answers 413 when a streamed body grows past the cap", async () => {
    const { db, env } = makeEnv();
    const res = await handleWaitlist(streamed(MAX_BODY_BYTES * 4), env);
    expect(res.status).toBe(413);
    expect(db.rows()).toEqual([]);
  });

  it("accepts a body exactly at the cap", async () => {
    const { env } = makeEnv();
    const base = JSON.stringify({ email: "a@b.co", source: "v1", pad: "" });
    const padded = JSON.stringify({ email: "a@b.co", source: "v1", pad: "x".repeat(MAX_BODY_BYTES - base.length) });
    expect(padded).toHaveLength(MAX_BODY_BYTES);
    expect((await handleWaitlist(postJson(padded), env)).status).toBe(201);
  });

  it("refuses a cross-origin Origin with 403 and stores nothing", async () => {
    const { db, env } = makeEnv();
    const req = postJson({ email: "a@b.co", source: "v1" }, { headers: { origin: "https://evil.example" } });
    const res = await handleWaitlist(req, env);
    expect(res.status).toBe(403);
    expect(await body(res)).toEqual({ error: "forbidden_origin" });
    expect(db.rows()).toEqual([]);
  });

  it("allows a same-origin Origin", async () => {
    const { env } = makeEnv();
    const req = postJson({ email: "a@b.co", source: "v1" }, { headers: { origin: ORIGIN } });
    expect((await handleWaitlist(req, env)).status).toBe(201);
  });

  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])("answers %s with 405 and Allow: POST", async (method) => {
    const { env } = makeEnv();
    const res = await handleWaitlist(new Request(URL_, { method }), env);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    if (method !== "HEAD") expect(await body(res)).toEqual({ error: "method_not_allowed" });
  });

  it("answers 500 server_error when D1 fails, and logs it", async () => {
    const { db, env } = makeEnv();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failNext();
    const res = await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }), env);
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: "server_error" });
    expect(log).toHaveBeenCalledWith("waitlist: store failed", expect.any(Error));
  });

  it("answers 500 when the insert itself fails after the rate check", async () => {
    const { db, env } = makeEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const realPrepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      if (sql.startsWith("INSERT")) db.failNext();
      return realPrepare(sql);
    });
    const res = await handleWaitlist(postJson({ email: "a@b.co", source: "v1" }), env);
    expect(res.status).toBe(500);
    expect(db.rows()).toEqual([]);
  });
});

describe("rate limit", () => {
  const join = (env: ReturnType<typeof makeEnv>["env"], i: number, ip = "203.0.113.7") =>
    handleWaitlist(postJson({ email: `person${i}@b.co`, source: "v1" }, { ip }), env);

  it(`lets ${RATE_LIMIT.max} new addresses in per IP per window, then answers 429 with Retry-After`, async () => {
    const { db, env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.max; i++) expect((await join(env, i)).status).toBe(201);
    const res = await join(env, 99);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("600");
    expect(await body(res)).toEqual({ error: "rate_limited" });
    expect(db.rows()).toHaveLength(RATE_LIMIT.max);
  });

  it("counts per IP: another IP still gets in", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.max; i++) await join(env, i);
    expect((await join(env, 99, "198.51.100.9")).status).toBe(201);
  });

  it("still answers exists (not 429) for an address already on the list while over the limit", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.max; i++) await join(env, i);
    const res = await join(env, 0);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ status: "exists" });
  });

  it("forgets joins older than the window", async () => {
    const { db, env } = makeEnv();
    const ipHash = await hashIp("203.0.113.7");
    for (let i = 0; i < RATE_LIMIT.max; i++) db.insert({ email: `old${i}@b.co`, created_at: minutesAgo(11), ip_hash: ipHash });
    expect((await join(env, 1)).status).toBe(201);
  });

  it("counts joins just inside the window", async () => {
    const { db, env } = makeEnv();
    const ipHash = await hashIp("203.0.113.7");
    for (let i = 0; i < RATE_LIMIT.max; i++) db.insert({ email: `new${i}@b.co`, created_at: minutesAgo(9), ip_hash: ipHash });
    expect((await join(env, 1)).status).toBe(429);
  });

  it("the window slides: after 10 minutes the same IP can join again", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.max; i++) await join(env, i);
    expect((await join(env, 50)).status).toBe(429);
    vi.setSystemTime(new Date(NOW.getTime() + RATE_LIMIT.windowMs + 1));
    expect((await join(env, 50)).status).toBe(201);
  });

  it("does not count invalid or duplicate submissions against the IP", async () => {
    const { env } = makeEnv();
    await join(env, 0);
    for (let i = 0; i < 10; i++) {
      await handleWaitlist(postJson({ email: "bad", source: "v1" }), env);
      await join(env, 0);
    }
    for (let i = 1; i < RATE_LIMIT.max; i++) expect((await join(env, i)).status).toBe(201);
  });
});

describe("POST /api/waitlist (form, JS off)", () => {
  const referer = `${ORIGIN}/v/2`;

  it("joins and answers 303 back to the page with #waitlist-joined", async () => {
    const { db, env } = makeEnv();
    const res = await handleWaitlist(postForm({ email: " Ada@B.co ", source: "v2" }, { headers: { referer } }), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/2#waitlist-joined`);
    expect(db.rows()[0]).toMatchObject({ email: "ada@b.co", source: "v2", country: "KE" });
  });

  it("answers #waitlist-exists for a repeat", async () => {
    const { env } = makeEnv();
    await handleWaitlist(postForm({ email: "a@b.co", source: "v2" }), env);
    const res = await handleWaitlist(postForm({ email: "a@b.co", source: "v2" }, { headers: { referer } }), env);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/2#waitlist-exists`);
  });

  it.each([[{ email: "nope", source: "v2" }], [{ source: "v2" }]])("answers #waitlist-invalid for %j", async (fields) => {
    const { db, env } = makeEnv();
    const res = await handleWaitlist(postForm(fields, { headers: { referer } }), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/2#waitlist-invalid`);
    expect(db.rows()).toEqual([]);
  });

  it("answers #waitlist-error when D1 fails", async () => {
    const { db, env } = makeEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.failNext();
    const res = await handleWaitlist(postForm({ email: "a@b.co", source: "v2" }, { headers: { referer } }), env);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/2#waitlist-error`);
  });

  it("answers #waitlist-error when rate-limited", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < RATE_LIMIT.max; i++) await handleWaitlist(postForm({ email: `p${i}@b.co`, source: "v2" }), env);
    const res = await handleWaitlist(postForm({ email: "late@b.co", source: "v2" }, { headers: { referer } }), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/2#waitlist-error`);
  });

  it("answers #waitlist-error when the body is over the cap", async () => {
    const { env } = makeEnv();
    const req = postForm({ email: "a@b.co", source: "v2" }, { headers: { referer, "content-length": "999999" } });
    const res = await handleWaitlist(req, env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/v/2#waitlist-error`);
  });

  it("answers #waitlist-error for a streamed form body over the cap", async () => {
    const { env } = makeEnv();
    const res = await handleWaitlist(streamed(MAX_BODY_BYTES + 10, "application/x-www-form-urlencoded"), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/#waitlist-error`);
  });

  it("goes to / when the Referer is another site", async () => {
    const { env } = makeEnv();
    const res = await handleWaitlist(postForm({ email: "a@b.co", source: "v2" }, { headers: { referer: "https://evil.example/x" } }), env);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/#waitlist-joined`);
  });

  it("goes to / when there is no Referer", async () => {
    const { env } = makeEnv();
    const res = await handleWaitlist(postForm({ email: "a@b.co", source: "home" }), env);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/#waitlist-joined`);
  });

  it("stores unknown for a bad or missing form source", async () => {
    const { db, env } = makeEnv();
    await handleWaitlist(postForm({ email: "a@b.co", source: "hero" }), env);
    await handleWaitlist(postForm({ email: "c@d.co" }), env);
    expect(db.rows().map((r) => r.source)).toEqual(["unknown", "unknown"]);
  });

  it("takes the first value when a field repeats", async () => {
    const { db, env } = makeEnv();
    const req = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=first%40b.co&email=second%40b.co&source=v1&source=v2",
    });
    await handleWaitlist(req, env);
    expect(db.rows()[0]).toMatchObject({ email: "first@b.co", source: "v1" });
  });
});
