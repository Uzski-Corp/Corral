import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_API_TIMEOUT_MS, DEFAULT_STATUS_URL, DEV_API_URL, getConfig, parseConfig, parseStatusUrl, readEnv, resetConfigCache, statusUrl, type EnvInput } from "./config";

const parse = (env: EnvInput) => parseConfig(env);

describe("parseConfig", () => {
  it("defaults to the local API in development", () => {
    const r = parse({ NODE_ENV: "development" });
    expect(r).toEqual({ ok: true, value: { mode: "live", apiUrl: DEV_API_URL, sessionCookie: "wos_session", reviewStates: false, apiTimeoutMs: DEFAULT_API_TIMEOUT_MS } });
  });

  it("normalises the API URL to its origin", () => {
    const r = parse({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: " https://api.corral.app/ " });
    expect(r.ok && r.value).toMatchObject({ mode: "live", apiUrl: "https://api.corral.app", reviewStates: false });
  });

  it("requires the API URL in production", () => {
    const r = parse({ NODE_ENV: "production" });
    expect(!r.ok && r.error.message).toMatch(/NEXT_PUBLIC_API_URL is required/);
  });

  it.each([
    ["not a url", /not a valid URL/],
    ["ftp://api.corral.app", /must be http\(s\)/],
    ["https://api.corral.app/v1", /origin only/],
    ["https://api.corral.app/?x=1", /origin only/],
  ])("rejects NEXT_PUBLIC_API_URL=%s", (value, message) => {
    const r = parse({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: value });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(message);
    expect(!r.ok && r.error.name).toBe("ConfigError");
  });

  it.each(["1", "true"])("turns on review mode with NEXT_PUBLIC_DESIGN_REVIEW=%s, even in production", (flag) => {
    const r = parse({ NODE_ENV: "production", NEXT_PUBLIC_DESIGN_REVIEW: flag });
    expect(r.ok && r.value).toMatchObject({ mode: "review", apiUrl: "", reviewStates: true });
  });

  it("reads the session cookie name and rejects unsafe ones", () => {
    expect(parse({ SESSION_COOKIE_NAME: "corral_s" }).ok && parse({ SESSION_COOKIE_NAME: "corral_s" })).toMatchObject({ value: { sessionCookie: "corral_s" } });
    const bad = parse({ SESSION_COOKIE_NAME: "a;b" });
    expect(!bad.ok && bad.error.message).toMatch(/SESSION_COOKIE_NAME/);
  });

  it("reads and bounds the API timeout", () => {
    expect(parse({ NEXT_PUBLIC_API_TIMEOUT_MS: "2500" })).toMatchObject({ value: { apiTimeoutMs: 2500 } });
    expect(parse({ NEXT_PUBLIC_API_TIMEOUT_MS: " " })).toMatchObject({ value: { apiTimeoutMs: DEFAULT_API_TIMEOUT_MS } });
    for (const v of ["50", "abc", "1.5", "999999"]) expect(parse({ NEXT_PUBLIC_API_TIMEOUT_MS: v }).ok).toBe(false);
    expect(parse({ NEXT_PUBLIC_DESIGN_REVIEW: "1", NEXT_PUBLIC_API_TIMEOUT_MS: "x" }).ok).toBe(false);
  });
});

describe("parseStatusUrl", () => {
  it.each([[undefined], [""], ["  "]])("falls back to #status for %j", (raw) => {
    expect(parseStatusUrl(raw)).toEqual({ ok: true, value: DEFAULT_STATUS_URL });
    expect(DEFAULT_STATUS_URL).toBe("#status");
  });

  it.each([
    [" https://status.corral.app ", "https://status.corral.app/"],
    ["http://localhost:4000/s", "http://localhost:4000/s"],
    ["/status", "/status"],
    ["#uptime", "#uptime"],
  ])("accepts %j", (raw, value) => {
    expect(parseStatusUrl(raw)).toEqual({ ok: true, value });
  });

  it.each(["javascript:alert(1)", "//evil.test", "status.corral.app", "mailto:ops@corral.app"])("rejects %j", (raw) => {
    const r = parseStatusUrl(raw);
    expect(!r.ok && r.error.message).toMatch(/NEXT_PUBLIC_STATUS_URL/);
  });
});

describe("statusUrl", () => {
  afterEach(() => { vi.unstubAllEnvs(); resetConfigCache(); });

  it("reads NEXT_PUBLIC_STATUS_URL once, with the #status fallback", () => {
    resetConfigCache();
    vi.stubEnv("NEXT_PUBLIC_STATUS_URL", "");
    expect(statusUrl()).toBe("#status");
    resetConfigCache();
    vi.stubEnv("NEXT_PUBLIC_STATUS_URL", "https://status.corral.app");
    expect(readEnv().NEXT_PUBLIC_STATUS_URL).toBe("https://status.corral.app");
    expect(statusUrl()).toBe("https://status.corral.app/");
    vi.stubEnv("NEXT_PUBLIC_STATUS_URL", "https://other.test");
    expect(statusUrl()).toBe("https://status.corral.app/");
  });

  it("throws the ConfigError on a malformed value", () => {
    resetConfigCache();
    vi.stubEnv("NEXT_PUBLIC_STATUS_URL", "javascript:void(0)");
    expect(() => statusUrl()).toThrow(/NEXT_PUBLIC_STATUS_URL/);
  });
});

describe("getConfig", () => {
  afterEach(() => { vi.unstubAllEnvs(); resetConfigCache(); });

  it("reads process.env once and caches it", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:9000");
    resetConfigCache();
    expect(readEnv().NEXT_PUBLIC_API_URL).toBe("http://localhost:9000");
    const a = getConfig();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:9999");
    expect(getConfig()).toBe(a);
    expect(a.apiUrl).toBe("http://localhost:9000");
  });

  it("throws the ConfigError on a misconfigured deploy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    resetConfigCache();
    expect(() => getConfig()).toThrow(/NEXT_PUBLIC_API_URL is required/);
  });

  it("warns instead of throwing while next build prerenders", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    resetConfigCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getConfig()).toMatchObject({ mode: "live", apiUrl: "", reviewStates: false });
    getConfig();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/NEXT_PUBLIC_API_URL is required/);
  });
});
