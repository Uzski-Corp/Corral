import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING, LOG_KIND, STANDARD_ERP_FIELDS, connKind, newestFirst, sameMapping, tokenValues } from "./live";
import { dealPayload, mappingIssues } from "./integrations";
import { CORRAL_FIELDS } from "@/components/app/handoff/data";
import { STATUS_TAG } from "@/lib/status/tags";

describe("M14 live integration helpers", () => {
  it("reads the connection and every log result in the shared vocabulary", () => {
    expect(connKind({})).toBe("connected");
    expect(connKind({ problem: { kind: "token-expired", since: "2026-10-03T10:00:00Z" } })).toBe("failed");
    expect(connKind({ problem: { kind: "token-expired", since: "x" }, reconnecting: true })).toBe("connecting");
    expect(STATUS_TAG[connKind({ problem: { kind: "token-expired", since: "x" } })].label).toBe("Failed");
    expect(Object.values(LOG_KIND).map((k) => STATUS_TAG[k].label)).toEqual(["Delivered", "Failed", "Retrying", "Rejected", "Ignored"]);
  });
  it("defaults cover every standard Phoenix field, have no issues and no custom fields", () => {
    expect(mappingIssues(DEFAULT_MAPPING, STANDARD_ERP_FIELDS, CORRAL_FIELDS)).toEqual([]);
    expect(STANDARD_ERP_FIELDS.some((f) => f.id.includes("custom"))).toBe(false);
    expect(sameMapping(DEFAULT_MAPPING, [...DEFAULT_MAPPING].reverse())).toBe(true);
    expect(sameMapping(DEFAULT_MAPPING, DEFAULT_MAPPING.map((r) => (r.erp === "deal.source" ? { erp: r.erp } : r)))).toBe(false);
  });
  it("previews the payload with tokens, never a person", () => {
    const p = dealPayload(DEFAULT_MAPPING, tokenValues(CORRAL_FIELDS.map((c) => c.id)), STANDARD_ERP_FIELDS);
    expect(p.body["account.name"]).toBe("{company}");
    expect(p.missing).toEqual([]);
  });
  it("sorts the log newest first", () => {
    const rows = newestFirst([{ id: "a", at: "2026-10-01T10:00:00Z", dir: "in", event: "x", result: "ok" }, { id: "b", at: "2026-10-03T10:00:00Z", dir: "in", event: "y", result: "ok" }]);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
