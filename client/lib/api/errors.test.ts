import { describe, expect, it } from "vitest";
import { describeApiError, detailMessage, httpError, isTransient, type ApiError } from "./errors";

describe("detailMessage", () => {
  it("reads FastAPI string and validation details", () => {
    expect(detailMessage({ detail: "Not signed in" })).toBe("Not signed in");
    expect(detailMessage({ detail: [{ msg: "field required" }, { msg: "too long" }, { nope: 1 }] })).toBe("field required; too long");
    expect(detailMessage({ detail: [] })).toBeUndefined();
    expect(detailMessage({ detail: 42 })).toBeUndefined();
    expect(detailMessage({ other: "x" })).toBeUndefined();
    expect(detailMessage(null)).toBeUndefined();
    expect(detailMessage("text")).toBeUndefined();
  });
});

describe("httpError", () => {
  it.each([
    [401, "unauthorized"], [403, "forbidden"], [502, "unavailable"], [503, "unavailable"], [504, "unavailable"], [500, "http"], [404, "http"],
  ] as const)("maps %i to %s", (status, kind) => {
    expect(httpError("GET /x", status, { detail: "why" })).toEqual({ kind, op: "GET /x", status, message: "why" });
  });

  it("falls back to the status when there is no detail", () => {
    expect(httpError("GET /x", 500, undefined).message).toBe("HTTP 500");
  });
});

describe("describeApiError / isTransient", () => {
  const e = (kind: ApiError["kind"]): ApiError => ({ kind, op: "GET /x", message: "m", status: 503, timeoutMs: 1 } as unknown as ApiError);

  it("formats with op and kind", () => {
    expect(describeApiError(e("timeout"))).toBe("GET /x: timeout: m");
  });

  it("treats timeouts, network failures and 5xx gateway errors as transient", () => {
    expect(["timeout", "network", "unavailable"].every((k) => isTransient(e(k as ApiError["kind"])))).toBe(true);
    expect(["unauthorized", "forbidden", "http", "invalid_response", "aborted"].some((k) => isTransient(e(k as ApiError["kind"])))).toBe(false);
  });
});
