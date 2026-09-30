import { describe, expect, it } from "vitest";
import { AREAS, DEFAULT_EXPIRY, KEY_SEND_REFUSED, keyScopesOf, canManageKey, clampFor, levelsFor, manageNote, maySend, PRESETS, RATE, ROTATE_OVERLAP_HOURS, accessOf, expiresOn, expiryWords, hasScope, isKeyShaped, isValid, lastUsedWords, redact, rotate, scopesOf, statusOf, validateKey, works } from "./keys";

const NOW = new Date("2026-09-30T09:45:00+03:00");
const none = Object.fromEntries(AREAS.map((a) => [a.id, "none"])) as ReturnType<typeof accessOf>;

describe("scopes", () => {
  it("write implies read, send implies write, and only the Unibox can send", () => {
    expect(scopesOf({ leads: "write" })).toEqual(["leads:read", "leads:write"]);
    expect(scopesOf({ unibox: "send" })).toEqual(["unibox:read", "unibox:write", "unibox:send"]);
    expect(scopesOf({ scoring: "send" })).toEqual(["scoring:read", "scoring:write"]);
    expect(scopesOf(none)).toEqual([]);
  });
  it("reads scopes back into the highest level per area and ignores junk", () => {
    const a = accessOf(["leads:read", "leads:write", "unibox:send", "scoring:send", "billing:write", "nope"]);
    expect(a.leads).toBe("write"); expect(a.unibox).toBe("send"); expect(a.scoring).toBe("none"); expect(a.segments).toBe("none");
    expect(hasScope(["unibox:send"], "unibox:read")).toBe(true);
    expect(hasScope(["unibox:write"], "unibox:send")).toBe(false);
  });
  it("presets: read only is all read, read and draft never sends, custom starts empty", () => {
    expect(Object.values(PRESETS[0].access).every((v) => v === "read")).toBe(true);
    expect(Object.values(PRESETS[1].access)).not.toContain("send");
    expect(scopesOf(PRESETS[2].access)).toEqual([]);
  });
});

describe("the key", () => {
  const k = "crl_live_4fKq9TzW2mRb7XcN1pLs8VdJ3hYe6uGa";
  it("knows its shape and shows only the prefix and the last four", () => {
    expect(isKeyShaped(k)).toBe(true); expect(isKeyShaped("crl_prod_x")).toBe(false); expect(isKeyShaped(" " + k + " ")).toBe(true);
    expect(redact(k)).toBe("crl_live_…6uGa"); expect(redact("crl_test_" + "a".repeat(32))).toBe("crl_test_…aaaa"); expect(redact("nope")).toBe("…");
  });
});

describe("expiry and status", () => {
  it("expires after the chosen days, or never", () => {
    expect(DEFAULT_EXPIRY).toBe("90");
    expect(expiresOn(NOW, "30")!.toISOString()).toBe("2026-10-30T06:45:00.000Z");
    expect(expiresOn(NOW, "never")).toBeNull();
  });
  it("revoked beats expired beats rotating beats expiring", () => {
    expect(statusOf({ revoked: "x", expires: "2026-01-01T00:00:00Z" }, NOW)).toBe("revoked");
    expect(statusOf({ expires: "2026-09-21T10:00:00+03:00" }, NOW)).toBe("expired");
    expect(statusOf({ expires: "2026-10-04T10:00:00+03:00", oldUntil: "2026-10-01T09:45:00+03:00" }, NOW)).toBe("rotating");
    expect(statusOf({ expires: "2026-10-04T10:00:00+03:00" }, NOW)).toBe("expiring");
    expect(statusOf({ expires: null }, NOW)).toBe("active");
    expect(statusOf({ expires: "2026-11-10T10:00:00+03:00", oldUntil: "2026-09-29T09:00:00+03:00" }, NOW)).toBe("active");
    expect(works("rotating")).toBe(true); expect(works("expired")).toBe(false); expect(works("revoked")).toBe(false);
  });
  it("says when, in words", () => {
    expect(lastUsedWords(undefined, NOW)).toBe("Never used");
    expect(lastUsedWords("2026-09-30T09:44:30+03:00", NOW)).toBe("Just now");
    expect(lastUsedWords("2026-09-30T09:33:00+03:00", NOW)).toBe("12 min ago");
    expect(lastUsedWords("2026-09-30T06:40:00+03:00", NOW)).toBe("3 h ago");
    expect(lastUsedWords("2026-09-29T16:20:00+03:00", NOW)).toBe("Yesterday");
    expect(lastUsedWords("2026-09-21T09:58:00+03:00", NOW)).toBe("Sep 21");
    expect(expiryWords(null, NOW)).toBe("Never expires");
    expect(expiryWords("2026-09-21T10:00:00+03:00", NOW)).toBe("Expired Sep 21");
    expect(expiryWords("2026-09-30T18:00:00+03:00", NOW)).toBe("Expires today");
    expect(expiryWords("2026-10-01T10:00:00+03:00", NOW)).toBe("Expires tomorrow");
    expect(expiryWords("2026-10-04T10:00:00+03:00", NOW)).toBe("Expires in 4 days");
    expect(expiryWords("2026-11-10T10:00:00+03:00", NOW)).toBe("Expires Nov 10");
  });
  it("rotating keeps the old secret for the overlap", () => {
    const r = rotate(NOW);
    expect(ROTATE_OVERLAP_HOURS).toBe(24);
    expect(r.oldUntil).toBe("2026-10-01T06:45:00.000Z");
    expect(RATE.perMinute).toBeGreaterThan(RATE.writesPerMinute);
  });
});

describe("validateKey", () => {
  const ok = { name: "HubSpot sync", access: { ...none, leads: "write" as const }, expiry: "90" as const };
  it("needs a name and a scope, and a name nobody has", () => {
    expect(isValid(validateKey(ok, ["n8n lead sync"]))).toBe(true);
    const e = validateKey({ ...ok, name: "  ", access: none }, []);
    expect(e.name).toMatch(/Name it after what uses it/); expect(e.scopes).toMatch(/at least one area/);
    expect(validateKey({ ...ok, name: "N8N Lead Sync" }, ["n8n lead sync"]).name).toMatch(/already exists/);
    expect(validateKey({ ...ok, name: "x".repeat(49) }, []).name).toMatch(/48/);
  });
});

describe("who may send, who may manage (§17 decisions 15 and 16)", () => {
  it("only a signed-in connection gets Send; a key stops at Write, and validation refuses a sending key", () => {
    expect(maySend("oauth")).toBe(true); expect(maySend("key")).toBe(false);
    expect(levelsFor("unibox", "oauth")).toEqual(["none", "read", "write", "send"]);
    expect(levelsFor("unibox", "key")).toEqual(["none", "read", "write"]);
    expect(levelsFor("leads", "oauth")).toEqual(["none", "read", "write"]);
    expect(clampFor({ ...none, unibox: "send" }, "key").unibox).toBe("write");
    expect(clampFor({ ...none, unibox: "send" }, "oauth").unibox).toBe("send");
    expect(validateKey({ name: "Bot", access: { ...none, unibox: "send" }, expiry: "90" }, []).scopes).toBe(KEY_SEND_REFUSED);
    expect(validateKey({ name: "Bot", access: { ...none, unibox: "write" }, expiry: "90" }, []).scopes).toBeUndefined();
    expect(keyScopesOf({ ...none, unibox: "send" })).toEqual(["unibox:read", "unibox:write"]);
    expect(KEY_SEND_REFUSED).toMatch(/can draft but can’t send/);
  });
  it("owners manage every key; members only their own", () => {
    const owner = { name: "Tomás Ibarra", role: "owner" as const }, member = { name: "Amara Njoroge", role: "member" as const };
    const tomas = { by: "Tomás Ibarra" }, amara = { by: "Amara Njoroge" };
    expect(canManageKey(amara, owner)).toBe(true); expect(canManageKey(tomas, owner)).toBe(true);
    expect(canManageKey(amara, member)).toBe(true); expect(canManageKey(tomas, member)).toBe(false);
    expect(manageNote(tomas, member)).toMatch(/Only Tomás or an owner/); expect(manageNote(amara, member)).toBeUndefined();
  });
});
