import { describe, expect, it } from "vitest";
import { detailFromApi } from "./live";
import type { IntegrationDetailRow } from "@/lib/api/integrations";

const ROW: IntegrationDetailRow = {
  provider: "phoenix", status: "reauth", config: {}, connectedAt: "2026-09-14T08:00:00Z", lastEvent: null,
  account: { name: "erp.example.com" }, connectedById: "u1", statusAt: "2026-10-03T08:00:00Z",
  problem: { kind: "token-expired", since: "2026-10-03T08:00:00Z" },
  mapping: [{ erp: "account.name", from: "company" }, { erp: "deal.source", as: "text" }, { erp: "deal.stage", as: "blob" }], supportsTest: false,
};

describe("detailFromApi (the real API, not Bau's guessed shape)", () => {
  it("keeps what the API knows and maps the log", () => {
    const d = detailFromApi("phoenix", ROW, [
      { id: "l1", at: "2026-10-03T09:00:00Z", dir: "out", event: "deal.create", result: "retrying", detail: "503" },
      { id: "l2", at: "2026-10-03T08:00:00Z", dir: "in", event: "stage.changed", result: "exploded" },
    ]);
    expect(d).toEqual({
      id: "phoenix", account: { name: "erp.example.com" }, connectedAt: "2026-09-14T08:00:00Z", connectedById: "u1", supportsTest: false,
      problem: { kind: "token-expired", since: "2026-10-03T08:00:00Z" },
      mapping: [{ erp: "account.name", from: "company" }, { erp: "deal.source", as: "text" }, { erp: "deal.stage" }],
      logs: [
        { id: "l1", at: "2026-10-03T09:00:00Z", dir: "out", event: "deal.create", result: "retrying", detail: "503" },
        { id: "l2", at: "2026-10-03T08:00:00Z", dir: "in", event: "stage.changed", result: "ok" },
      ],
    });
  });

  it("makes nothing up when the API doesn't know it", () => {
    const d = detailFromApi("cal", { ...ROW, provider: "cal", status: "connected", account: null, connectedAt: undefined, connectedById: null, problem: null, mapping: null }, []);
    expect(d).toEqual({ id: "cal", supportsTest: false, logs: [], mapping: null });
    const odd = detailFromApi("cal", { ...ROW, problem: { kind: "melted", since: "2026-10-03T08:00:00Z" } }, []);
    expect(odd.problem).toBeUndefined();
    const noSince = detailFromApi("cal", { ...ROW, problem: { kind: "refused", since: null } }, []);
    expect(noSince.problem).toBeUndefined();
    expect(detailFromApi("cal", { ...ROW, problem: { kind: "refused", since: "2026-10-03T08:00:00Z" } }, []).problem?.kind).toBe("refused");
  });
});
