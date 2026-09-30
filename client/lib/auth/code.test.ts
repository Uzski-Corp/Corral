import { describe, expect, it } from "vitest";
import { CODE_LENGTH, CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, formatCountdown, isCompleteCode, retryAfterSeconds, reviewVerify, sanitizeCode } from "./code";

describe("sign-in code rules", () => {
  it("mirrors the WorkOS numbers", () => {
    expect(CODE_LENGTH).toBe(6);
    expect(CODE_TTL_MINUTES).toBe(10);
    expect(RESEND_COOLDOWN_SECONDS).toBe(20);
  });
  it("keeps digits only, at most six", () => {
    expect(sanitizeCode("123 456")).toBe("123456");
    expect(sanitizeCode("123-456")).toBe("123456");
    expect(sanitizeCode("Your Corral code is 482193.")).toBe("482193");
    expect(sanitizeCode("12345678")).toBe("123456");
    expect(sanitizeCode("abc")).toBe("");
  });
  it("knows a complete code", () => {
    expect(isCompleteCode("482193")).toBe(true);
    expect(isCompleteCode("48219")).toBe(false);
    expect(isCompleteCode("48219a")).toBe(false);
  });
  it("formats countdowns", () => {
    expect(formatCountdown(41)).toBe("0:41");
    expect(formatCountdown(75)).toBe("1:15");
    expect(formatCountdown(4.2)).toBe("0:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
  it("reads Retry-After as seconds or a date", () => {
    expect(retryAfterSeconds("41")).toBe(41);
    expect(retryAfterSeconds(null)).toBe(60);
    expect(retryAfterSeconds("soon")).toBe(60);
    const now = Date.parse("2026-09-29T20:00:00Z");
    expect(retryAfterSeconds("Tue, 29 Sep 2026 20:00:30 GMT", now)).toBe(30);
    expect(retryAfterSeconds("Tue, 29 Sep 2026 19:59:00 GMT", now)).toBe(0);
  });
  it("has sample outcomes for review", () => {
    expect(reviewVerify("123456")).toEqual({ ok: true });
    expect(reviewVerify("111111")).toEqual({ ok: false, reason: "expired" });
    expect(reviewVerify("999999")).toEqual({ ok: false, reason: "attempts" });
    expect(reviewVerify("482193")).toEqual({ ok: false, reason: "wrong" });
  });
});
