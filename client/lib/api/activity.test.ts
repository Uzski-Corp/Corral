// @vitest-environment node
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API, server, testConfig } from "@/test/msw";
import { developersApiFor, discoveryApiFor, inboxApiFor, integrationsApiFor, sequencesApiFor } from "./index";
import { looseList, looseObject } from "./loose";

const cfg = testConfig();
type Seen = { method: string; path: string; search: string; body: unknown };

function capture(method: "get" | "post" | "patch" | "delete", path: string, reply: unknown, status = 200) {
  const seen: Seen[] = [];
  server.use(http[method](`${API}${path}`, async ({ request }) => {
    const url = new URL(request.url);
    const text = request.method === "GET" || request.method === "DELETE" ? "" : await request.text();
    seen.push({ method: request.method, path: url.pathname, search: url.search, body: text ? JSON.parse(text) : undefined });
    return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(reply as never, { status });
  }));
  return seen;
}

describe("loose decoders", () => {
  it("keeps objects and lists of objects, rejects anything else", () => {
    expect(looseObject({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
    expect(looseObject([1]).ok).toBe(false);
    expect(looseList([{ a: 1 }]).ok).toBe(true);
    expect(looseList([1]).ok).toBe(false);
    expect(looseList({}).ok).toBe(false);
  });
});

describe("inbox api", () => {
  const api = inboxApiFor(cfg);
  it("lists by tab, reads the summary, patches and sends", async () => {
    const list = capture("get", "/api/v1/inbox", [{ id: "t1" }]);
    expect(await api.list("handled")).toEqual({ ok: true, value: [{ id: "t1" }] });
    expect(list[0].search).toBe("?tab=handled");
    capture("get", "/api/v1/inbox/summary", { needs_you: 3 });
    expect(await api.summary()).toEqual({ ok: true, value: { needs_you: 3 } });
    const patch = capture("patch", "/api/v1/inbox/a%2Fb", { id: "a/b", unread: false });
    expect((await api.patch("a/b", { unread: false })).ok).toBe(true);
    expect(patch[0].body).toEqual({ unread: false });
    const send = capture("post", "/api/v1/inbox/t1/send", { id: "t1" });
    expect((await api.send("t1", "Hello")).ok).toBe(true);
    expect(send[0].body).toEqual({ body: "Hello" });
  });
  it("rejects a summary without a count", async () => {
    capture("get", "/api/v1/inbox/summary", { needs_you: "3" });
    expect((await api.summary()).ok).toBe(false);
    capture("get", "/api/v1/inbox/summary", null);
    expect((await api.summary()).ok).toBe(false);
  });
});

describe("sequences api", () => {
  const api = sequencesApiFor(cfg);
  it("lists, creates, updates and reads the mailbox pool", async () => {
    capture("get", "/api/v1/sequences", [{ id: "s1" }]);
    expect((await api.list()).ok).toBe(true);
    const created = capture("post", "/api/v1/sequences", { id: "s1" });
    expect((await api.create({ id: "s1", name: "A" })).ok).toBe(true);
    expect(created[0].body).toEqual({ id: "s1", name: "A" });
    const upd = capture("patch", "/api/v1/sequences/s1", { id: "s1", status: "paused" });
    expect((await api.update("s1", { status: "paused" })).ok).toBe(true);
    expect(upd[0].method).toBe("PATCH");
    capture("get", "/api/v1/mailboxes", { mailboxes: [{ id: "m" }], sent: 4, cap: 40, attention: 1 });
    expect(await api.mailboxes()).toEqual({ ok: true, value: { mailboxes: [{ id: "m" }], sent: 4, cap: 40, attention: 1 } });
  });
  it("defaults a missing cap and attention, and rejects a bad pool", async () => {
    capture("get", "/api/v1/mailboxes", { mailboxes: [], sent: 0 });
    expect(await api.mailboxes()).toEqual({ ok: true, value: { mailboxes: [], sent: 0, cap: 0, attention: 0 } });
    capture("get", "/api/v1/mailboxes", { mailboxes: [] });
    expect((await api.mailboxes()).ok).toBe(false);
  });
});

describe("discovery api", () => {
  const api = discoveryApiFor(cfg);
  it("reads runs with credits, credits alone, and queues a run", async () => {
    capture("get", "/api/v1/discovery/runs", { runs: [{ id: "r1" }], credits: { month: 500, used: 20, left: 480 } });
    expect(await api.runs()).toEqual({ ok: true, value: { runs: [{ id: "r1" }], credits: { month: 500, used: 20, left: 480 } } });
    capture("get", "/api/v1/discovery/credits", { month: 500, left: 500 });
    expect(await api.credits()).toEqual({ ok: true, value: { month: 500, used: 0, left: 500 } });
    const post = capture("post", "/api/v1/discovery/runs", { id: "r2", status: "queued" });
    expect((await api.create({ query: "clinics" })).ok).toBe(true);
    expect(post[0].body).toEqual({ query: "clinics" });
  });
  it("rejects runs without a list or with bad credits", async () => {
    capture("get", "/api/v1/discovery/runs", { runs: null });
    expect((await api.runs()).ok).toBe(false);
    capture("get", "/api/v1/discovery/runs", { runs: [], credits: { month: "x" } });
    expect((await api.runs()).ok).toBe(false);
  });
});

describe("integrations api", () => {
  const api = integrationsApiFor(cfg);
  it("lists, updates and reads members", async () => {
    capture("get", "/api/v1/integrations", [{ provider: "cal", status: "connected", config: { a: 1 } }, { provider: "phoenix", status: "off" }]);
    expect(await api.list()).toEqual({ ok: true, value: [{ provider: "cal", status: "connected", config: { a: 1 } }, { provider: "phoenix", status: "off", config: {} }] });
    const upd = capture("patch", "/api/v1/integrations/cal", { provider: "cal", status: "off" });
    expect((await api.update("cal", { status: "off" })).ok).toBe(true);
    expect(upd[0].body).toEqual({ status: "off" });
    capture("get", "/api/v1/workspace/members", [{ id: "u1", name: "Ama", email: "a@x.co", role: "owner" }, { name: "B", email: "b@x.co" }]);
    expect(await api.members()).toEqual({ ok: true, value: [{ id: "u1", name: "Ama", email: "a@x.co", role: "owner" }, { id: "", name: "B", email: "b@x.co", role: "member" }] });
  });
  it.each([
    ["not a list", {}],
    ["a bad row", [{ provider: 1 }]],
  ])("rejects integrations that are %s", async (_, body) => {
    capture("get", "/api/v1/integrations", body);
    expect((await api.list()).ok).toBe(false);
  });
  it.each([
    ["not a list", {}],
    ["a member without an email", [{ name: "A" }]],
  ])("rejects members that are %s", async (_, body) => {
    capture("get", "/api/v1/workspace/members", body);
    expect((await api.members()).ok).toBe(false);
  });
});

describe("developers api", () => {
  const api = developersApiFor(cfg);
  it("covers keys and connections", async () => {
    capture("get", "/api/v1/developers/keys", [{ id: "k1" }]);
    expect((await api.keys()).ok).toBe(true);
    const create = capture("post", "/api/v1/developers/keys", { id: "k2", secret: "ck_test_x" });
    expect((await api.createKey({ name: "CI", env: "test" })).ok).toBe(true);
    expect(create[0].body).toEqual({ name: "CI", env: "test" });
    capture("post", "/api/v1/developers/keys/k2/revoke", { id: "k2", revoked: true });
    expect((await api.revokeKey("k2")).ok).toBe(true);
    const rot = capture("post", "/api/v1/developers/keys/k2/rotate", { id: "k2", secret: "ck_test_y" });
    expect((await api.rotateKey("k2", false)).ok).toBe(true);
    expect(rot[0].body).toEqual({ overlap: false });
    capture("get", "/api/v1/developers/connections", [{ id: "c1" }]);
    expect((await api.connections()).ok).toBe(true);
    capture("post", "/api/v1/developers/connections", { id: "c2" });
    expect((await api.createConnection({ host: "claude" })).ok).toBe(true);
    capture("get", "/api/v1/developers/connections/c2/calls", [{ at: "2026-10-03T12:00:00Z", tool: "tools/list" }]);
    expect(await api.calls("c2")).toEqual({ ok: true, value: [{ at: "2026-10-03T12:00:00Z", tool: "tools/list" }] });
    const del = capture("delete", "/api/v1/developers/connections/c2", null, 204);
    expect(await api.deleteConnection("c2")).toEqual({ ok: true, value: undefined });
    expect(del[0].method).toBe("DELETE");
  });
  it("rejects a delete that returns a body", async () => {
    capture("delete", "/api/v1/developers/connections/c3", { gone: true });
    expect((await api.deleteConnection("c3")).ok).toBe(false);
  });
});
