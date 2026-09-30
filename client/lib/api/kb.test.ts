// @vitest-environment node
// (Node: its fetch and FormData/File are the same implementation; jsdom’s FormData can’t go through Node’s fetch.)
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API, server, testConfig } from "@/test/msw";
import { kb, kbHandlers, productRow, resetKb, sourceRow } from "@/test/kbMock";
import { KB_PATHS, MAX_PAGE, UPLOAD_TIMEOUT_MS, decodeHits, decodePassages, decodeProduct, decodeSource, decodeSources } from "./kb";
import { createApiClient } from "./client";
import { createKbApi } from "./kb";
import { kbApiFor } from "./index";

const api = kbApiFor(testConfig());
beforeEach(() => { resetKb(); server.use(...kbHandlers); });

describe("KB_PATHS", () => {
  it("encodes ids into the PR #67 routes", () => {
    expect(KB_PATHS.sources("p 1")).toBe("/api/v1/products/p%201/knowledge/sources");
    expect(KB_PATHS.product("p1")).toBe("/api/v1/products/p1");
    expect(KB_PATHS.files("p1")).toBe("/api/v1/products/p1/knowledge/sources/files");
    expect(KB_PATHS.urls("p1")).toBe("/api/v1/products/p1/knowledge/sources/urls");
    expect(KB_PATHS.passages("p1", "s/1")).toBe("/api/v1/products/p1/knowledge/sources/s%2F1/passages");
    expect(KB_PATHS.restore("p1", "s1")).toMatch(/s1\/restore$/);
    expect(KB_PATHS.reread("p1", "s1")).toMatch(/s1\/reread$/);
    expect(KB_PATHS.search("p1")).toBe("/api/v1/products/p1/knowledge/search");
  });
});

describe("decoders", () => {
  it("camel-cases a SourceOut and fills defaults", () => {
    const { attempts: _a, ...noAttempts } = sourceRow({ id: "s1", name: "Spec.pdf", skipped_reason: "scanned" });
    void _a;
    const r = decodeSource(noAttempts);
    expect(r).toMatchObject({ ok: true, value: { id: "s1", productId: "p1", kind: "pdf", byteSize: 2_400_000, skippedReason: "scanned", attempts: 0, deletedAt: null, passageCount: 40 } });
  });

  it.each([
    ["kind", { kind: "xls" }, /source.kind: expected one of pdf \| docx \| md \| url, got string/],
    ["status", { status: "done" }, /source.status/],
    ["stage", { stage: "boil" }, /source.stage/],
    ["stage_pct", { stage_pct: "5" }, /source.stage_pct: expected number, got string/],
    ["failure", { failure: "meh" }, /source.failure/],
    ["skipped_reason", { skipped_reason: "why" }, /source.skipped_reason/],
    ["name", { name: null as unknown as string }, /source.name: expected string, got null/],
  ])("rejects a bad %s", (_n, over, msg) => {
    const r = decodeSource(sourceRow({ id: "s1", name: "x", ...over }));
    expect(!r.ok && r.error).toMatch(msg);
  });

  it("reports the index of a bad row in a list", () => {
    const r = decodeSources([sourceRow({ id: "a", name: "a" }), { id: 3 }]);
    expect(!r.ok && r.error).toMatch(/^sources\[1\]\.id: expected string, got number/);
    expect(decodeSources({}).ok).toBe(false);
  });

  it("decodes products, passages and search hits", () => {
    expect(decodeProduct(productRow("p1", "A"))).toMatchObject({ ok: true, value: { id: "p1", name: "A", description: null } });
    expect(decodePassages([{ id: "x", ordinal: 2, loc: null, text: "t" }])).toEqual({ ok: true, value: [{ id: "x", ordinal: 2, loc: null, text: "t" }] });
    expect(decodeHits([{ passage_id: "x", source_id: "s", source_name: "n", source_kind: "url", loc: "§1", text: "t", score: 1 }]))
      .toMatchObject({ ok: true, value: [{ sourceKind: "url", score: 1 }] });
    expect(decodeHits([{ passage_id: "x" }]).ok).toBe(false);
  });
});

describe("createKbApi", () => {
  it("lists and creates products", async () => {
    expect(await api.listProducts()).toMatchObject({ ok: true, value: [{ id: "p1", name: "Kilima Dairies" }] });
    expect(await api.createProduct({ name: "Gateway" })).toMatchObject({ ok: true, value: { id: "p2", name: "Gateway" } });
    expect(await api.createProduct({ name: "Gateway" })).toMatchObject({ ok: false, error: { kind: "http", status: 409, code: "name_taken" } });
  });

  it("follows pages until a short one", async () => {
    resetKb({ sources: Array.from({ length: MAX_PAGE + 3 }, (_, i) => sourceRow({ id: `s${i}`, name: `f${i}.pdf` })) });
    const r = await api.listSources("p1");
    expect(r.ok && r.value).toHaveLength(MAX_PAGE + 3);
    expect(kb.lists).toBe(2);
  });

  it("asks for removed sources only when told to", async () => {
    resetKb({ sources: [sourceRow({ id: "a", name: "a", deleted_at: "2026-09-30T07:00:00Z" })] });
    expect((await api.listSources("p1")).ok && (await api.listSources("p1"))).toMatchObject({ value: [] });
    expect(await api.listSources("p1", { includeRemoved: true })).toMatchObject({ ok: true, value: [{ id: "a" }] });
  });

  it("stops at a safety limit instead of paging forever", async () => {
    const full = Array.from({ length: MAX_PAGE }, (_, i) => sourceRow({ id: `s${i}`, name: `f${i}` }));
    server.use(http.get(`${API}/api/v1/products/p1/knowledge/sources`, () => HttpResponse.json(full)));
    expect(await api.listSources("p1")).toMatchObject({ ok: false, error: { kind: "invalid_response", message: /more than/ } });
  });

  it("returns the first failed page", async () => {
    server.use(http.get(`${API}/api/v1/products/p1/knowledge/sources`, () => HttpResponse.json({ detail: "down" }, { status: 503 })));
    expect(await api.listSources("p1")).toMatchObject({ ok: false, error: { kind: "unavailable", status: 503 } });
  });

  it("uploads a file as multipart, with the source it replaces", async () => {
    const file = new File(["hello"], "Spec.pdf", { type: "application/pdf" });
    expect(await api.uploadFile("p1", file)).toMatchObject({ ok: true, value: { id: "s1", status: "processing", byteSize: 5 } });
    expect(await api.uploadFile("p1", new File(["hello!"], "Spec.pdf"), { replaceSourceId: "s1" })).toMatchObject({ ok: true, value: { id: "s1" } });
    expect(kb.calls).toEqual(["upload Spec.pdf", "upload Spec.pdf replacing s1"]);
  });

  it("names a nameless blob and keeps the duplicate's id", async () => {
    resetKb({ sources: [sourceRow({ id: "s9", name: "upload" })] });
    const r = await api.uploadFile("p1", new Blob(["x"]));
    expect(r).toMatchObject({ ok: false, error: { status: 409, code: "duplicate", details: { existing_source_id: "s9" } } });
  });

  it("gives uploads a longer deadline and reports progress through the client", async () => {
    const request = vi.fn(async () => ({ ok: true as const, value: {} }));
    const k = createKbApi({ baseUrl: API, url: () => API, request } as never);
    const onProgress = vi.fn();
    await k.uploadFile("p1", new File(["x"], "a.md"), { onProgress });
    expect(request).toHaveBeenCalledWith(KB_PATHS.files("p1"), expect.objectContaining({ method: "POST", timeoutMs: UPLOAD_TIMEOUT_MS, onUploadProgress: onProgress, form: expect.any(FormData) }));
  });

  it("adds web pages and reads one source", async () => {
    const r = await api.addUrl("p1", { url: "https://kilima.co.ke/docs", scope: "section" });
    expect(r).toMatchObject({ ok: true, value: { kind: "url", scope: "section", url: "https://kilima.co.ke/docs" } });
    expect(await api.getSource("p1", "s1")).toMatchObject({ ok: true, value: { id: "s1" } });
    expect(await api.getSource("p1", "nope")).toMatchObject({ ok: false, error: { status: 404, code: "not_found" } });
  });

  it("removes, restores and re-reads", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" })] });
    expect(await api.remove("p1", "s1")).toMatchObject({ ok: true, value: { deletedAt: expect.any(String) } });
    expect(await api.restore("p1", "s1")).toMatchObject({ ok: true, value: { deletedAt: null } });
    expect(await api.reread("p1", "s1")).toMatchObject({ ok: true, value: { status: "processing", stage: "scan" } });
    expect(kb.calls).toEqual(["delete s1", "restore s1", "reread s1"]);
  });

  it("reads passages with a limit and searches", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" })] });
    let limit: string | null = null;
    server.use(http.get(`${API}/api/v1/products/p1/knowledge/sources/s1/passages`, ({ request }) => {
      limit = new URL(request.url).searchParams.get("limit");
      return HttpResponse.json([{ id: "a", ordinal: 0, loc: "p. 1", text: "t" }]);
    }));
    expect(await api.passages("p1", "s1", { limit: 3 })).toMatchObject({ ok: true, value: [{ loc: "p. 1" }] });
    expect(limit).toBe("3");
    await api.passages("p1", "s1");
    expect(limit).toBeNull();
    let body: unknown;
    server.use(http.post(`${API}/api/v1/products/p1/knowledge/search`, async ({ request }) => { body = await request.json(); return HttpResponse.json([]); }));
    expect(await api.search("p1", "alerts", { limit: 5 })).toEqual({ ok: true, value: [] });
    expect(body).toEqual({ query: "alerts", limit: 5 });
    await api.search("p1", "alerts");
    expect(body).toEqual({ query: "alerts" });
  });

  it("works with an injected fetch too", async () => {
    const k = createKbApi(createApiClient({ baseUrl: API, timeoutMs: 1000, fetch: (i, init) => fetch(i, init) }));
    expect((await k.listProducts()).ok).toBe(true);
  });
});
