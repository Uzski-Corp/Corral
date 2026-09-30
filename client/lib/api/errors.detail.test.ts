import { describe, expect, it } from "vitest";
import { errorDetail, extraFields, httpError } from "./errors";

describe("extraFields", () => {
  it("keeps the fields besides error and detail", () => {
    expect(extraFields({ error: "duplicate", detail: "x", existing_source_id: "s1" })).toEqual({ existing_source_id: "s1" });
    expect(extraFields({ error: "x", detail: "y" })).toBeUndefined();
    expect(extraFields(null)).toBeUndefined();
    expect(extraFields([1])).toBeUndefined();
    expect(extraFields("text")).toBeUndefined();
  });
  it("puts them on http errors", () => {
    expect(httpError("POST /f", 409, { error: "duplicate", detail: "Already there.", existing_source_id: "s1" }))
      .toEqual({ kind: "http", op: "POST /f", status: 409, message: "Already there.", code: "duplicate", details: { existing_source_id: "s1" } });
    expect(httpError("POST /f", 400, { error: "bad", detail: "Bad." })).not.toHaveProperty("details");
  });
});

describe("errorDetail", () => {
  it("is the op plus what went wrong", () => {
    expect(errorDetail({ kind: "unavailable", op: "GET /p", status: 503, message: "down" })).toBe("GET /p · 503");
    expect(errorDetail({ kind: "timeout", op: "GET /p", timeoutMs: 10_000, message: "t" })).toBe("GET /p · timed out after 10s");
    expect(errorDetail({ kind: "network", op: "GET /p", message: "n" })).toBe("GET /p · network");
  });
});
