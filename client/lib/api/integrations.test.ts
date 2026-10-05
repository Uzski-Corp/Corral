// @vitest-environment node
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API, server, testConfig } from "@/test/msw";
import { integrationsApiFor } from "./index";

const api = integrationsApiFor(testConfig());
function reply(method: "get" | "put", path: string, body: unknown, seen: unknown[] = []) {
  server.use(http[method](`${API}${path}`, async ({ request }) => {
    if (method === "put") seen.push(await request.json());
    return HttpResponse.json(body as never);
  }));
  return seen;
}

const DETAIL = {
  provider: "phoenix", status: "reauth", config: {}, id: "phoenix", connectedAt: "2026-09-14T08:00:00Z",
  lastEvent: { event: "deal.create", at: "2026-10-03T09:00:00Z" }, account: { name: "erp.example.com", email: "" },
  connectedById: "u1", statusAt: "2026-10-03T08:00:00Z", problem: { kind: "token-expired", since: "2026-10-03T08:00:00Z" },
  mapping: [{ erp: "account.name", from: "company" }, { erp: "deal.source", as: "text" }, { from: "x" }, 3], supportsTest: false,
};

describe("integrations api: the connected page", () => {
  it("lists with the last event and when each was connected", async () => {
    reply("get", "/api/v1/integrations", [
      { provider: "cal", status: "connected", config: {}, connectedAt: "2026-09-14T08:00:00Z", lastEvent: { event: "PING", at: "2026-10-03T09:00:00Z", result: "ok" } },
      { provider: "autosend", status: "connected", config: {}, connectedAt: null, lastEvent: null },
      { provider: "phoenix", status: "off", config: {}, lastEvent: { event: "" } },
    ]);
    const r = await api.list();
    expect(r.ok && r.value).toEqual([
      { provider: "cal", status: "connected", config: {}, connectedAt: "2026-09-14T08:00:00Z", lastEvent: { event: "PING", at: "2026-10-03T09:00:00Z", result: "ok" } },
      { provider: "autosend", status: "connected", config: {}, lastEvent: null },
      { provider: "phoenix", status: "off", config: {}, lastEvent: null },
    ]);
  });

  it("reads a detail, keeping only what the API knows", async () => {
    reply("get", "/api/v1/integrations/phoenix", DETAIL);
    const r = await api.detail("phoenix");
    expect(r.ok && r.value).toMatchObject({
      account: { name: "erp.example.com" }, connectedById: "u1", statusAt: "2026-10-03T08:00:00Z", supportsTest: false,
      problem: { kind: "token-expired", since: "2026-10-03T08:00:00Z" },
      mapping: [{ erp: "account.name", from: "company" }, { erp: "deal.source", as: "text" }],
      lastEvent: { event: "deal.create", at: "2026-10-03T09:00:00Z", result: "ok" },
    });
    reply("get", "/api/v1/integrations/cal", { provider: "cal", status: "off", config: {}, account: { name: "" }, problem: { kind: "", since: null }, mapping: null, supportsTest: "yes" });
    const off = await api.detail("cal");
    expect(off.ok && off.value).toMatchObject({ account: null, problem: null, mapping: null, connectedById: null, statusAt: null, supportsTest: false });
    reply("get", "/api/v1/integrations/autosend", { provider: "autosend", status: "error", problem: { kind: "refused" } });
    const refused = await api.detail("autosend");
    expect(refused.ok && refused.value.problem).toEqual({ kind: "refused", since: null });
    reply("get", "/api/v1/integrations/zoom", { status: "off" });
    expect((await api.detail("zoom")).ok).toBe(false);
  });

  it("saves Phoenix's mapping", async () => {
    const seen = reply("put", "/api/v1/integrations/phoenix/mapping", { ...DETAIL, mapping: [{ erp: "account.name", from: "company" }] });
    const r = await api.saveMapping("phoenix", [{ erp: "account.name", from: "company" }]);
    expect(r.ok && r.value.mapping).toEqual([{ erp: "account.name", from: "company" }]);
    expect(seen).toEqual([{ rows: [{ erp: "account.name", from: "company" }] }]);
  });

  it("reads the log in one shape and rejects a broken one", async () => {
    reply("get", "/api/v1/integrations/cal/logs", [
      { id: "l1", at: "2026-10-03T09:00:00Z", dir: "in", event: "BOOKING_CREATED", result: "duplicate", detail: "bk_1" },
      { id: "l2", at: "2026-10-03T08:00:00Z", dir: "sideways", event: "", result: null, detail: null },
    ]);
    const r = await api.logs("cal");
    expect(r.ok && r.value).toEqual([
      { id: "l1", at: "2026-10-03T09:00:00Z", dir: "in", event: "BOOKING_CREATED", result: "duplicate", detail: "bk_1" },
      { id: "l2", at: "2026-10-03T08:00:00Z", dir: "out", event: "note", result: "ok" },
    ]);
    reply("get", "/api/v1/integrations/cal/logs", {});
    expect((await api.logs("cal")).ok).toBe(false);
    reply("get", "/api/v1/integrations/cal/logs", [{ id: "l1" }]);
    expect((await api.logs("cal")).ok).toBe(false);
  });
});
