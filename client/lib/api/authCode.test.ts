import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API, EXPIRED_CODE, GOOD_CODE, codeError, rateLimited, server, testConfig } from "@/test/msw";
import { err, ok } from "../result";
import { AUTH_PATHS, decodeCodeSent, decodeSignedIn, toCodeSendResult, toCodeVerifyResult } from "./auth";
import { errorCode, httpError, type ApiError } from "./errors";
import { authApiFor } from "./index";

const api = authApiFor(testConfig());
const SEND = `${API}${AUTH_PATHS.codeSend}`;
const VERIFY = `${API}${AUTH_PATHS.codeVerify}`;
const EMAIL = "wanjiru@kilima.co.ke";

describe("httpError / errorCode", () => {
  it("keeps the API's error code and the Retry-After header", () => {
    expect(httpError("POST /x", 429, { error: "rate_limited", detail: "slow down" }, "41")).toEqual({
      kind: "http", op: "POST /x", status: 429, message: "slow down", code: "rate_limited", retryAfter: "41",
    });
  });

  it("leaves them out when absent", () => {
    expect(httpError("POST /x", 400, { detail: "nope" }, null)).toEqual({ kind: "http", op: "POST /x", status: 400, message: "nope" });
    expect(httpError("POST /x", 400, undefined)).toEqual({ kind: "http", op: "POST /x", status: 400, message: "HTTP 400" });
  });

  it.each([[{ error: "" }], [{ error: 3 }], ["text"], [null], [{}]])("ignores a non-string error code: %j", (body) => {
    expect(errorCode(body)).toBeUndefined();
  });
});

describe("decodeCodeSent / decodeSignedIn", () => {
  it("decodes the send acknowledgement", () => {
    expect(decodeCodeSent({ sent: true })).toEqual({ ok: true, value: { sent: true } });
    expect(decodeCodeSent({ sent: false }).ok).toBe(false);
    expect(decodeCodeSent(null).ok).toBe(false);
  });

  it("decodes the sign-in redirect", () => {
    expect(decodeSignedIn({ redirect_to: "https://app.corral.test" })).toEqual({ ok: true, value: { redirectTo: "https://app.corral.test" } });
    expect(decodeSignedIn({ redirect_to: "javascript:alert(1)" }).ok).toBe(false);
    expect(decodeSignedIn([]).ok).toBe(false);
  });
});

const httpErr = (status: number, over: Partial<{ code: string; retryAfter: string }> = {}): ApiError => ({ kind: "http", op: "POST /x", status, message: "m", ...over });

describe("toCodeSendResult", () => {
  it.each<[string, ApiError, ReturnType<typeof toCodeSendResult>]>([
    ["429 with seconds", httpErr(429, { retryAfter: "41" }), { ok: false, reason: "rate-limited", retryAfter: 41 }],
    ["429 without Retry-After", httpErr(429), { ok: false, reason: "rate-limited", retryAfter: 60 }],
    ["422", httpErr(422), { ok: false, reason: "network" }],
    ["503", { kind: "unavailable", op: "x", status: 503, message: "m" }, { ok: false, reason: "network" }],
    ["timeout", { kind: "timeout", op: "x", timeoutMs: 1, message: "m" }, { ok: false, reason: "network" }],
    ["network", { kind: "network", op: "x", message: "m" }, { ok: false, reason: "network" }],
    ["bad body", { kind: "invalid_response", op: "x", status: 202, message: "m" }, { ok: false, reason: "network" }],
  ])("maps %s", (_name, e, expected) => {
    expect(toCodeSendResult(err(e))).toEqual(expected);
  });

  it("maps success", () => expect(toCodeSendResult(ok({ sent: true }))).toEqual({ ok: true }));
});

describe("toCodeVerifyResult", () => {
  it.each<[string, ApiError, string]>([
    ["code_invalid", httpErr(400, { code: "code_invalid" }), "wrong"],
    ["a malformed code (422)", httpErr(422), "wrong"],
    ["code_expired", httpErr(400, { code: "code_expired" }), "expired"],
    ["too_many_attempts", httpErr(400, { code: "too_many_attempts" }), "expired"],
    ["auth_failed", httpErr(400, { code: "auth_failed" }), "network"],
    ["a 429", httpErr(429, { code: "rate_limited", retryAfter: "5" }), "network"],
    ["a 503", { kind: "unavailable", op: "x", status: 503, message: "m" }, "network"],
    ["no answer", { kind: "network", op: "x", message: "m" }, "network"],
  ])("maps %s", (_name, e, reason) => {
    expect(toCodeVerifyResult(err(e))).toEqual({ ok: false, reason });
  });

  it("maps success", () => expect(toCodeVerifyResult(ok({ redirectTo: "http://x.test" }))).toEqual({ ok: true }));
});

describe("authApi.sendCode (MSW)", () => {
  it("POSTs the email as JSON with cookies and gets the acknowledgement", async () => {
    let seen: { body: unknown; credentials: string; type: string | null } | undefined;
    server.use(http.post(SEND, async ({ request }) => {
      seen = { body: await request.json(), credentials: request.credentials, type: request.headers.get("content-type") };
      return HttpResponse.json({ sent: true }, { status: 202 });
    }));
    expect(await api.sendCode(EMAIL)).toEqual({ ok: true, value: { sent: true } });
    expect(seen).toEqual({ body: { email: EMAIL }, credentials: "include", type: "application/json" });
  });

  it("reads the countdown from Retry-After on a 429 (seconds or an HTTP date)", async () => {
    server.use(http.post(SEND, () => rateLimited("41")));
    expect(toCodeSendResult(await api.sendCode(EMAIL))).toEqual({ ok: false, reason: "rate-limited", retryAfter: 41 });
    const at = new Date(Date.now() + 30_000).toUTCString();
    server.use(http.post(SEND, () => rateLimited(at)));
    const r = toCodeSendResult(await api.sendCode(EMAIL));
    expect(r.ok === false && r.reason === "rate-limited" && r.retryAfter).toBeGreaterThanOrEqual(28);
    server.use(http.post(SEND, () => rateLimited(null)));
    expect(toCodeSendResult(await api.sendCode(EMAIL))).toEqual({ ok: false, reason: "rate-limited", retryAfter: 60 });
  });

  it("treats 5xx, a dropped connection and a timeout as network", async () => {
    server.use(http.post(SEND, () => codeError("auth_unavailable", 503)));
    expect(toCodeSendResult(await api.sendCode(EMAIL))).toEqual({ ok: false, reason: "network" });
    server.use(http.post(SEND, () => HttpResponse.error()));
    expect(toCodeSendResult(await api.sendCode(EMAIL))).toEqual({ ok: false, reason: "network" });
    const quick = authApiFor(testConfig({ apiTimeoutMs: 20 }));
    server.use(http.post(SEND, async () => { await delay(200); return HttpResponse.json({ sent: true }, { status: 202 }); }));
    const slow = await quick.sendCode(EMAIL);
    expect(!slow.ok && slow.error.kind).toBe("timeout");
    expect(toCodeSendResult(slow)).toEqual({ ok: false, reason: "network" });
  });
});

describe("authApi.verifyCode (MSW)", () => {
  it("POSTs email and code and decodes the redirect", async () => {
    let body: unknown;
    server.use(http.post(VERIFY, async ({ request }) => { body = await request.json(); return HttpResponse.json({ redirect_to: "http://localhost:3000" }); }));
    expect(await api.verifyCode(EMAIL, GOOD_CODE)).toEqual({ ok: true, value: { redirectTo: "http://localhost:3000" } });
    expect(body).toEqual({ email: EMAIL, code: GOOD_CODE });
  });

  it("maps the API's typed errors", async () => {
    expect(toCodeVerifyResult(await api.verifyCode(EMAIL, "000000"))).toEqual({ ok: false, reason: "wrong" });
    expect(toCodeVerifyResult(await api.verifyCode(EMAIL, EXPIRED_CODE))).toEqual({ ok: false, reason: "expired" });
    server.use(http.post(VERIFY, () => codeError("too_many_attempts")));
    expect(toCodeVerifyResult(await api.verifyCode(EMAIL, "000000"))).toEqual({ ok: false, reason: "expired" });
    server.use(http.post(VERIFY, () => codeError("auth_unavailable", 503)));
    expect(toCodeVerifyResult(await api.verifyCode(EMAIL, GOOD_CODE))).toEqual({ ok: false, reason: "network" });
  });

  it("treats a success without a usable redirect as no answer", async () => {
    server.use(http.post(VERIFY, () => HttpResponse.json({})));
    const r = await api.verifyCode(EMAIL, GOOD_CODE);
    expect(!r.ok && r.error.kind).toBe("invalid_response");
    expect(toCodeVerifyResult(r)).toEqual({ ok: false, reason: "network" });
  });
});
