// @vitest-environment node
// (Node: its fetch and FormData/File are the same implementation; jsdom’s FormData can’t go through Node’s fetch.)
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadsApiFor, type LeadsApi } from "@/lib/api";
import { API, server, testConfig } from "@/test/msw";
import { leadsHandlers, resetLeads } from "@/test/leadsMock";
import { importRunner } from "./live";

let api: LeadsApi;
beforeEach(() => { resetLeads(); server.use(...leadsHandlers); api = leadsApiFor(testConfig()); });

/* ------------------------------------------------------------ import */
describe("importRunner", () => {
  const input = () => ({ file: new Blob(["Company,Email\nA,a@a.co\nB,b@b.co"]), name: "list.csv", mapping: ["company", "email"], policy: "skip" as const });
  it("uploads, follows progress to done and says when it finished", async () => {
    const onFinished = vi.fn();
    const pct: number[] = [];
    const r = await importRunner(api, { pollMs: 5, onFinished }).run(input(), (p) => pct.push(p));
    expect(r).toMatchObject({ ok: true, value: { status: "done", created: 1, hasErrorsFile: true } });
    expect(pct).toEqual([0, 50, 100]);
    expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
  });
  it("backs off through a failed poll, and stops when cancelled", async () => {
    server.use(http.get(`${API}/api/v1/lead-imports/:id`, () => HttpResponse.json({}, { status: 503 }), { once: true }));
    const r = await importRunner(api, { pollMs: 5 }).run(input(), () => {});
    expect(r).toMatchObject({ ok: true, value: { status: "done" } });
    const c = new AbortController();
    const running = importRunner(api, { pollMs: 50 }).run(input(), () => c.abort(), c.signal);
    expect(await running).toMatchObject({ ok: false, error: { kind: "aborted" } });
  });
  it("returns the refusal when the upload is refused, and plans with a dry run", async () => {
    server.use(http.post(`${API}/api/v1/lead-imports`, () => HttpResponse.json({ error: "too_large", detail: "Over 20 MB." }, { status: 413 }), { once: true }));
    expect(await importRunner(api).run(input(), () => {})).toMatchObject({ ok: false, error: { status: 413, code: "too_large" } });
    expect(await importRunner(api).plan(input())).toMatchObject({ ok: true, value: { plan: { total: 2 } } });
    expect(importRunner(api).errorsUrl("i1")).toBe(`${API}/api/v1/lead-imports/i1/errors.csv`);
  });
  it("stops following a poll that was cancelled mid-request", async () => {
    const c = new AbortController();
    server.use(http.get(`${API}/api/v1/lead-imports/:id`, async () => { c.abort(); await new Promise((r) => setTimeout(r, 20)); return HttpResponse.json({}); }));
    expect(await importRunner(api, { pollMs: 1 }).run(input(), () => {}, c.signal)).toMatchObject({ ok: false, error: { kind: "aborted" } });
  });
});

