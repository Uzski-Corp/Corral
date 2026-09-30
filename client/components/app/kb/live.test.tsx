import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { kbApiFor, type ApiError, type ApiSource, type KbApi, type Product } from "@/lib/api";
import { err, ok } from "@/lib/result";
import { API, ME_BODY, server, testConfig } from "@/test/msw";
import { kb, kbHandlers, productRow, resetKb, sourceRow } from "@/test/kbMock";
import { queueFailure, useKbProducts, useLiveKb, useLiveUploadQueue, passageRows, type KbProducts, type UploadTarget } from "./live";

const toast = vi.fn();
vi.mock("../Toaster", () => ({ useToast: () => toast }));

const me = { id: ME_BODY.user.id, name: "Wanjiru Mwangi" };
const SOURCES = `${API}/api/v1/products/p1/knowledge/sources`;
let api: KbApi;
beforeEach(() => { resetKb(); server.use(...kbHandlers); api = kbApiFor(testConfig()); toast.mockReset(); });

const httpErr = (status: number, code?: string, extra: Partial<Extract<ApiError, { kind: "http" }>> = {}): ApiError =>
  ({ kind: "http", op: "POST /x", status, message: "The server said no", ...(code ? { code } : {}), ...extra });
const product = (id = "p1", name = "Kilima Dairies"): Product => ({ id, name, description: null, createdAt: "2026-09-30T06:00:00Z", updatedAt: "2026-09-30T06:00:00Z" });
const productsOf = (over: Partial<KbProducts> = {}): KbProducts => ({
  phase: "ready", error: null, products: [product()], selected: product(), select: vi.fn(), retry: vi.fn(),
  ensure: vi.fn(async () => ok(product())), firstName: "Kilima Dairies", setFirstName: vi.fn(), ...over,
});
const apiSource = (over: Partial<ApiSource> = {}): ApiSource => ({
  id: "s1", productId: "p1", kind: "pdf", name: "Spec.pdf", url: null, scope: null, byteSize: 10, status: "processing", stage: "scan", stagePct: 0,
  progress: null, failure: null, failureStage: null, pagesTotal: null, pagesRead: null, skipped: null, skippedReason: null, note: null,
  passageCount: 0, attempts: 0, addedByUserId: me.id, createdAt: "2026-09-30T06:00:00Z", updatedAt: "2026-09-30T06:00:00Z", processedAt: null, deletedAt: null, ...over,
});
const lastToast = () => toast.mock.calls.at(-1)?.[0] as { children: string; tone?: string; action?: { label: string; onClick(): void } };

/* ------------------------------------------------------------ products */
describe("useKbProducts", () => {
  it("is null without an API (sample data)", () => {
    const { result } = renderHook(() => useKbProducts(null, { active: true, workspace: "W" }));
    expect(result.current).toBeNull();
  });

  it("waits until the knowledge base is open, then loads oldest first", async () => {
    resetKb({ products: [productRow("p2", "Gateway", "2026-09-30T08:00:00Z"), productRow("p1", "Sensors", "2026-09-01T08:00:00Z")] });
    const { result, rerender } = renderHook(({ active }) => useKbProducts(api, { active, workspace: "W" }), { initialProps: { active: false } });
    expect(result.current?.phase).toBe("idle");
    rerender({ active: true });
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    expect(result.current?.products.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(result.current?.selected?.id).toBe("p1");
    act(() => result.current?.select("p2"));
    expect(result.current?.selected?.name).toBe("Gateway");
    // Leaving and coming back doesn't reload.
    rerender({ active: false }); rerender({ active: true });
    expect(result.current?.phase).toBe("ready");
  });

  it("reports a failure and loads again on retry", async () => {
    server.use(http.get(`${API}/api/v1/products`, () => HttpResponse.json({ detail: "down" }, { status: 503 }), { once: true }));
    const { result } = renderHook(() => useKbProducts(api, { active: true, workspace: "W" }));
    await waitFor(() => expect(result.current?.phase).toBe("error"));
    expect(result.current?.error).toMatchObject({ kind: "unavailable" });
    act(() => result.current?.retry());
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    expect(result.current?.error).toBeNull();
  });

  it("creates the first product, named after the workspace, when asked to ensure one", async () => {
    resetKb({ products: [] });
    const { result } = renderHook(() => useKbProducts(api, { active: true, workspace: "Kilima Dairies" }));
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    expect(result.current?.selected).toBeNull();
    let made: Awaited<ReturnType<KbProducts["ensure"]>> | undefined;
    await act(async () => { made = await result.current!.ensure(); });
    expect(made).toMatchObject({ ok: true, value: { name: "Kilima Dairies" } });
    expect(result.current?.selected?.name).toBe("Kilima Dairies");
    await act(async () => { made = await result.current!.ensure(); });
    expect(kb.products).toHaveLength(1);
  });

  it("names the first product from the inline field (M11), and falls back to the workspace when it's blank", async () => {
    resetKb({ products: [] });
    const { result } = renderHook(() => useKbProducts(api, { active: true, workspace: "Kilima Dairies" }));
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    expect(result.current?.firstName).toBe("Kilima Dairies");
    act(() => result.current!.setFirstName("  "));
    expect(result.current?.firstName).toBe("  ");
    act(() => result.current!.setFirstName("Kilima Cold Rooms"));
    await act(async () => { await result.current!.ensure(); });
    expect(result.current?.selected?.name).toBe("Kilima Cold Rooms");
  });

  it("returns the create failure without selecting anything", async () => {
    resetKb({ products: [] });
    server.use(http.post(`${API}/api/v1/products`, () => HttpResponse.json({ error: "name_taken", detail: "Taken." }, { status: 409 })));
    const { result } = renderHook(() => useKbProducts(api, { active: true, workspace: "W" }));
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    let made: Awaited<ReturnType<KbProducts["ensure"]>> | undefined;
    await act(async () => { made = await result.current!.ensure(); });
    expect(made).toMatchObject({ ok: false, error: { code: "name_taken" } });
    expect(result.current?.selected).toBeNull();
  });
});

/* ------------------------------------------------------------ queue errors */
describe("queueFailure", () => {
  const pdf = { name: "Spec.pdf", size: 1000, kind: "pdf" as const };
  const url = { name: "kilima.co.ke/faq", kind: "url" as const };

  it("waits out a 429", () => {
    expect(queueFailure(httpErr(429, "rate_limited", { retryAfter: "7" }), pdf)).toEqual({ wait: 7 });
    expect(queueFailure(httpErr(429), pdf)).toEqual({ wait: 60 });
  });
  it("offers Replace for a duplicate file (with the id it duplicates), Skip for a page", () => {
    expect(queueFailure(httpErr(409, "duplicate", { details: { existing_source_id: "s9" } }), pdf))
      .toEqual({ error: { title: "Already in this knowledge base", fix: "Replace the old copy, or skip this one.", actions: ["replace", "skip"] }, existingId: "s9" });
    expect(queueFailure(httpErr(409, "duplicate"), url)).toMatchObject({ error: { actions: ["skip"] }, existingId: undefined });
  });
  it("gives each refusal code its own copy and recovery (M11), keeping the server's sentence where ours can't say more", () => {
    expect(queueFailure(httpErr(409, "kb_full"), pdf)).toEqual({ error: { title: "This knowledge base is full", fix: "The server said no. Remove a source you no longer need, then retry.", actions: ["retry", "skip"] } });
    expect(queueFailure(httpErr(409, "other"), pdf)).toEqual({ error: { title: "Couldn’t add this file", fix: "The server said no.", actions: ["retry", "skip"] } });
    expect(queueFailure({ ...httpErr(409, "other"), message: "Full." }, pdf)).toMatchObject({ error: { fix: "Full." } });
    expect(queueFailure(httpErr(415, "type_mismatch"), pdf)).toMatchObject({ error: { title: "This file isn’t what its name says", actions: ["replace", "skip"] } });
    expect(queueFailure(httpErr(422, "url_not_public"), url)).toMatchObject({ error: { title: "That page isn’t public", actions: ["skip"] } });
  });
  it("uses the designed file checks for size and empty files", () => {
    expect(queueFailure(httpErr(413, "too_large"), pdf)).toMatchObject({ error: { title: expect.stringMatching(/over the 25 MB limit/) } });
    expect(queueFailure(httpErr(413, "too_large"), { ...pdf, size: undefined })).toMatchObject({ error: { title: expect.stringMatching(/over the 25 MB limit/) } });
    expect(queueFailure(httpErr(422, "empty"), pdf)).toMatchObject({ error: { title: expect.stringMatching(/empty/i) } });
  });
  it("calls a refused type unreadable, and a refused page unaddable", () => {
    expect(queueFailure(httpErr(415, "unsupported"), pdf)).toMatchObject({ error: { title: "Corral couldn’t read this file", fix: "The server said no.", actions: ["skip"] } });
    expect(queueFailure(httpErr(422, "url_invalid"), url)).toMatchObject({ error: { title: "That isn’t a page Corral can open" } });
    expect(queueFailure(httpErr(415), url)).toMatchObject({ error: { title: "Couldn’t read this page", fix: "The server said no.", actions: ["retry", "skip"] } });
  });
  it("treats anything else as a dropped upload with Retry", () => {
    expect(queueFailure({ kind: "network", op: "x", message: "n" }, pdf)).toEqual({ error: { title: "Upload stopped", fix: "The connection dropped. Nothing was saved.", actions: ["retry"] } });
    expect(queueFailure(httpErr(500), url)).toMatchObject({ error: { actions: ["retry"] } });
  });
});

/* ------------------------------------------------------------ upload queue */
type Pending = { resolve(r: ReturnType<typeof ok<ApiSource>> | ReturnType<typeof err<ApiError>>): void; onProgress?: (p: number) => void; replaceSourceId?: string; signal: AbortSignal };
function scriptedTarget() {
  const uploads: Pending[] = [];
  const urls: { url: string; scope: string; resolve: Pending["resolve"] }[] = [];
  const target: UploadTarget = {
    upload: (_file, o) => new Promise((resolve) => uploads.push({ resolve, onProgress: o.onProgress, replaceSourceId: o.replaceSourceId, signal: o.signal })),
    addUrl: (url, scope) => new Promise((resolve) => urls.push({ url, scope, resolve })),
  };
  return { target, uploads, urls };
}
const file = (name: string, size = 10) => new File(["x".repeat(size)], name);

describe("useLiveUploadQueue", () => {
  it("uploads two at a time with progress, then hands each source over", async () => {
    const t = scriptedTarget();
    const onAdded = vi.fn();
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded }));
    act(() => result.current.addFiles([file("a.pdf"), file("b.docx"), file("c.md")]));
    await waitFor(() => expect(t.uploads).toHaveLength(2));
    expect(result.current.busy).toBe(true);
    expect(result.current.items.map((i) => i.state)).toEqual(["active", "active", "queued"]);
    act(() => t.uploads[0].onProgress?.(40));
    expect(result.current.items[0]).toMatchObject({ stage: "upload", pct: 40 });
    act(() => t.uploads[0].onProgress?.(100));
    expect(result.current.items[0]).toMatchObject({ stage: "scan", pct: 0 });
    await act(async () => t.uploads[0].resolve(ok(apiSource({ id: "s1", name: "a.pdf" }))));
    expect(result.current.items[0]).toMatchObject({ state: "done", pct: 100 });
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), expect.objectContaining({ name: "a.pdf" }));
    await waitFor(() => expect(t.uploads).toHaveLength(3));
    await act(async () => { t.uploads[1].resolve(ok(apiSource({ id: "s2" }))); t.uploads[2].resolve(ok(apiSource({ id: "s3" }))); });
    expect(result.current.busy).toBe(false);
    act(() => result.current.clearDone());
    expect(result.current.items).toEqual([]);
  });

  it("stops files the designs refuse before uploading, and caps a drop", () => {
    const t = scriptedTarget();
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded: vi.fn() }));
    act(() => result.current.addFiles([file("notes.xls"), file("Spec.pdf")], ["Spec.pdf"]));
    expect(result.current.items.map((i) => i.error?.title)).toEqual([expect.stringMatching(/./), "Already in this knowledge base"]);
    act(() => result.current.addFiles([{ name: "not-a-blob.pdf", size: 5 }]));
    expect(result.current.items[0].error?.title).toBe("Upload stopped");
    act(() => result.current.addFiles(Array.from({ length: 23 }, (_, i) => file(`f${i}.pdf`))));
    expect(result.current.items.find((i) => i.name === "3 more files")?.error?.title).toMatch(/^Only 20 files at a time$/);
    expect(t.uploads.length).toBeLessThanOrEqual(2);
  });

  it("shows a duplicate the server finds, and Replace uploads it over the old source", async () => {
    const t = scriptedTarget();
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded: vi.fn() }));
    act(() => result.current.addFiles([file("Spec.pdf")]));
    await waitFor(() => expect(t.uploads).toHaveLength(1));
    await act(async () => t.uploads[0].resolve(err(httpErr(409, "duplicate", { details: { existing_source_id: "s9" } }))));
    const dup = result.current.items[0];
    expect(dup).toMatchObject({ state: "error", error: { actions: ["replace", "skip"] } });
    expect(result.current.existingIdOf(dup.id)).toBe("s9");
    act(() => result.current.replace(dup));
    await waitFor(() => expect(t.uploads).toHaveLength(2));
    expect(t.uploads[1].replaceSourceId).toBe("s9");
    act(() => result.current.dismiss(dup.id));
    expect(result.current.items).toHaveLength(1);
    // Nothing to replace with: no-op.
    act(() => result.current.replace({ ...dup, id: "nope" }));
    expect(result.current.items).toHaveLength(1);
  });

  it("waits out a 429 and tries again on its own", async () => {
    const t = scriptedTarget();
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded: vi.fn() }));
    act(() => result.current.addFiles([file("a.pdf")]));
    await waitFor(() => expect(t.uploads).toHaveLength(1));
    await act(async () => t.uploads[0].resolve(err(httpErr(429, "rate_limited", { retryAfter: "0" }))));
    expect(result.current.items[0].state).toBe("queued");
    await waitFor(() => expect(t.uploads).toHaveLength(2));
  });

  it("retries a dropped upload, and a dismissed one is cancelled", async () => {
    const t = scriptedTarget();
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded: vi.fn() }));
    act(() => result.current.addFiles([file("a.pdf")]));
    await waitFor(() => expect(t.uploads).toHaveLength(1));
    await act(async () => t.uploads[0].resolve(err({ kind: "network", op: "x", message: "n" })));
    expect(result.current.items[0]).toMatchObject({ state: "error", error: { actions: ["retry"] } });
    act(() => result.current.retry(result.current.items[0].id));
    await waitFor(() => expect(t.uploads).toHaveLength(2));
    const id = result.current.items[0].id;
    act(() => result.current.dismiss(id));
    expect(t.uploads[1].signal.aborted).toBe(true);
    await act(async () => t.uploads[1].resolve(ok(apiSource())));
    expect(result.current.items).toEqual([]);
  });

  it("adds a web page (or a whole section)", async () => {
    const t = scriptedTarget();
    const onAdded = vi.fn();
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded }));
    act(() => { result.current.addUrl("kilima.co.ke", "/docs", true); result.current.addUrl("kilima.co.ke", "/faq", false); });
    await waitFor(() => expect(t.urls).toHaveLength(2));
    expect(t.urls.map((u) => `${u.url} ${u.scope}`).sort()).toEqual(["https://kilima.co.ke/docs section", "https://kilima.co.ke/faq page"]);
    expect(result.current.items[0]).toMatchObject({ kind: "url", host: "kilima.co.ke", state: "active", stage: "scan" });
    await act(async () => { for (const u of t.urls) u.resolve(ok(apiSource({ kind: "url" }))); });
    expect(onAdded).toHaveBeenCalledTimes(2);
  });

  it("the next file after “Replace file” replaces that source", async () => {
    const t = scriptedTarget();
    let pending: string | undefined = "s4";
    const takeReplace = () => { const id = pending; pending = undefined; return id; };
    const { result } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded: vi.fn(), takeReplace }));
    act(() => result.current.addFiles([file("Spec.pdf"), file("Other.pdf")], ["Spec.pdf"]));
    await waitFor(() => expect(t.uploads).toHaveLength(2));
    expect(t.uploads.map((u) => u.replaceSourceId).sort()).toEqual(["s4", undefined]);
  });

  it("does nothing without a target, and cancels uploads on unmount", async () => {
    const idle = renderHook(() => useLiveUploadQueue({ target: null, onAdded: vi.fn() }));
    act(() => idle.result.current.addFiles([file("a.pdf")]));
    expect(idle.result.current.items[0].state).toBe("queued");
    const t = scriptedTarget();
    const { result, unmount } = renderHook(() => useLiveUploadQueue({ target: t.target, onAdded: vi.fn() }));
    act(() => result.current.addFiles([file("a.pdf")]));
    await waitFor(() => expect(t.uploads).toHaveLength(1));
    unmount();
    expect(t.uploads[0].signal.aborted).toBe(true);
  });
});

/* ------------------------------------------------------------ sources */
const liveKb = (products: KbProducts = productsOf(), a: KbApi = api) =>
  renderHook(({ p }) => useLiveKb({ api: a, products: p, me, now: () => new Date("2026-09-30T09:15:00Z") }), { initialProps: { p: products } });

describe("useLiveKb", () => {
  it("loads the selected product's sources", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" }), sourceRow({ id: "s2", name: "Old.pdf", deleted_at: "2026-09-30T07:00:00Z" })] });
    const { result } = liveKb();
    expect(result.current.phase).toBe("loading");
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.sources).toEqual([expect.objectContaining({ id: "s1", name: "Spec.pdf", status: { s: "ready" }, by: { name: "Wanjiru Mwangi" } })]);
    expect(result.current.existing).toEqual(["Spec.pdf"]);
    expect(result.current.errorDetail).toBeUndefined();
  });

  it("is an empty knowledge base when there's no product yet, and loading while products load", () => {
    expect(liveKb(productsOf({ products: [], selected: null })).result.current).toMatchObject({ phase: "ready", sources: [] });
    expect(liveKb(productsOf({ phase: "loading", selected: null })).result.current.phase).toBe("loading");
  });

  it("fails with the products' error and retries them", () => {
    const products = productsOf({ phase: "error", selected: null, error: { kind: "unavailable", op: "GET /api/v1/products", status: 503, message: "down" } });
    const { result } = liveKb(products);
    expect(result.current).toMatchObject({ phase: "error", errorDetail: "GET /api/v1/products · 503" });
    act(() => result.current.retry());
    expect(products.retry).toHaveBeenCalled();
  });

  it("shows the sources' error and loads again on retry", async () => {
    server.use(http.get(SOURCES, () => HttpResponse.json({ detail: "down" }, { status: 503 }), { once: true }));
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.errorDetail).toMatch(/knowledge\/sources · 503$/);
    act(() => result.current.retry());
    expect(result.current.phase).toBe("loading");
    await waitFor(() => expect(result.current.phase).toBe("ready"));
  });

  it("polls while a source is being read and stops once it's ready", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf", status: "processing", stage: "embed", stage_pct: 40, processed_at: null })], readyAfter: 2 });
    const { result } = liveKb();
    await waitFor(() => expect(result.current.sources[0]?.status).toEqual({ s: "processing", stage: "embed", pct: 40, attempts: 1 }));
    await waitFor(() => expect(result.current.sources[0]?.status).toEqual({ s: "ready" }), { timeout: 4000 });
    const lists = kb.lists;
    await new Promise((r) => setTimeout(r, 2300));
    expect(kb.lists).toBe(lists);
  }, 10_000);

  it("keeps what's on screen when a poll fails", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf", status: "processing", stage: "scan", processed_at: null })] });
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    server.use(http.get(SOURCES, () => HttpResponse.json({ detail: "down" }, { status: 503 })));
    await new Promise((r) => setTimeout(r, 2300));
    expect(result.current.phase).toBe("ready");
    expect(result.current.sources).toHaveLength(1);
  }, 10_000);

  it("re-reads a source, showing it as processing straight away", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf", status: "failed", failure: "interrupted", failure_stage: "embed" })] });
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.reread("s1"));
    expect(result.current.sources[0].status).toMatchObject({ s: "processing", stage: "scan" });
    await waitFor(() => expect(lastToast()?.children).toBe("Reading Spec.pdf again"));
    expect(kb.calls).toContain("reread s1");
    act(() => result.current.reread("nope"));
  });

  it("puts a failed re-read back and offers Try again", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf", status: "failed", failure: "interrupted", failure_stage: "embed" })] });
    server.use(http.post(`${SOURCES}/s1/reread`, () => HttpResponse.json({ error: "removed", detail: "Gone." }, { status: 409 }), { once: true }));
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.reread("s1"));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t re-read Spec.pdf. The current version stays searchable." }));
    expect(result.current.sources[0].status).toMatchObject({ s: "failed" });
    act(() => lastToast().action!.onClick());
    await waitFor(() => expect(lastToast()?.children).toBe("Reading Spec.pdf again"));
  });

  it("waits out a 429 on re-read", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" })] });
    server.use(http.post(`${SOURCES}/s1/reread`, () => HttpResponse.json({ error: "rate_limited", detail: "Slow." }, { status: 429, headers: { "Retry-After": "0" } }), { once: true }));
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.reread("s1"));
    await waitFor(() => expect(lastToast()?.children).toBe("Reading Spec.pdf again"));
  });

  it("removes a source with Undo", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" }), sourceRow({ id: "s2", name: "B.pdf" })] });
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.setKnowledge([{ id: "k", title: "T", items: [{ id: "i", text: "x", cites: [{ src: "s1", loc: "p. 1" }] }] } as never]));
    act(() => result.current.remove("s1"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["s2"]);
    expect(result.current.knowledge[0].items[0]).toMatchObject({ flag: { f: "stale", removed: "Spec.pdf" } });
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "success", children: "Removed Spec.pdf" }));
    act(() => lastToast().action!.onClick());
    await waitFor(() => expect(result.current.sources.map((s) => s.id).sort()).toEqual(["s1", "s2"]));
    expect(result.current.knowledge[0].items[0]).not.toHaveProperty("flag");
    expect(kb.calls).toEqual(expect.arrayContaining(["delete s1", "restore s1"]));
    act(() => result.current.remove("nope"));
  });

  it("puts a source back when removing fails, and says when Undo fails", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" })] });
    server.use(http.delete(`${SOURCES}/s1`, () => HttpResponse.json({ detail: "down" }, { status: 503 }), { once: true }));
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.remove("s1"));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t remove Spec.pdf. It’s still in your sources." }));
    expect(result.current.sources).toHaveLength(1);
    server.use(http.post(`${SOURCES}/s1/restore`, () => HttpResponse.json({ error: "kb_full", detail: "Full." }, { status: 409 })));
    act(() => lastToast().action!.onClick());   // Try again
    await waitFor(() => expect(lastToast()?.children).toBe("Removed Spec.pdf"));
    act(() => lastToast().action!.onClick());   // Undo
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t bring back Spec.pdf. It’s still removed.", action: { label: "Try again" } }));
    server.use(http.post(`${SOURCES}/s1/restore`, () => HttpResponse.json(sourceRow({ id: "s1", name: "Spec.pdf" }))));
    act(() => lastToast().action!.onClick());   // Try again (restore)
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
  });

  it("loads a source's first passages once", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" }), sourceRow({ id: "s2", name: "Empty.pdf", passage_count: 0 })] });
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => { result.current.loadPassages("s2"); result.current.loadPassages("nope"); result.current.loadPassages("s1"); });
    await waitFor(() => expect(result.current.passages.s1).toEqual([{ loc: "p. 1", ordinal: 0, text: "Sensors report every five minutes." }, { loc: null, ordinal: 1, text: "Alerts go to the on-call phone." }]));
    expect(result.current.passages.s2).toBeUndefined();
    act(() => result.current.loadPassages("s1"));
    expect(passageRows([])).toEqual([]);
    expect(passageRows([{ id: "a", ordinal: 4, loc: "ColdTrace T4 wireless temperature sensors", text: "t" }, { id: "b", ordinal: 0, loc: "p. 14", text: "u" }]))
      .toEqual([{ loc: "ColdTrace T4 wireless temperature sensors", ordinal: 4, text: "t" }, { loc: "p. 14", ordinal: 0, text: "u" }]);
  });

  it("searches the selected product (M11), and answers empty without one", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" })] });
    const { result } = liveKb();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    const r = await result.current.search("battery", 8);
    expect(r).toMatchObject({ ok: true, value: [{ sourceId: "s1", sourceName: "Spec.pdf", loc: "p. 1" }] });
    const none = liveKb(productsOf({ products: [], selected: null }));
    expect(await none.result.current.search("battery", 8)).toEqual({ ok: true, value: [] });
  });

  it("adds uploads to the list, creating the product first when there is none", async () => {
    resetKb({ products: [] });
    const uploadFile = vi.fn(async (productId: string) => ok(apiSource({ id: "s7", productId, name: "a.pdf" })));
    const addUrl = vi.fn(async (productId: string) => ok(apiSource({ id: "s8", productId, kind: "url", name: "kilima.co.ke/faq", url: "https://kilima.co.ke/faq" })));
    const a = { ...api, uploadFile, addUrl };
    const { result } = renderHook(() => {
      const products = useKbProducts(a, { active: true, workspace: "Kilima Dairies" })!;
      return useLiveKb({ api: a, products, me });
    });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.q.addFiles([file("a.pdf")]));
    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith("p1", expect.any(File), expect.objectContaining({ onProgress: expect.any(Function) })));
    expect(kb.products).toMatchObject([{ id: "p1", name: "Kilima Dairies" }]);
    await waitFor(() => expect(result.current.q.items[0]?.state).toBe("done"));
    act(() => result.current.q.addUrl("kilima.co.ke", "/faq", false));
    await waitFor(() => expect(addUrl).toHaveBeenCalledWith("p1", { url: "https://kilima.co.ke/faq", scope: "page" }, expect.any(AbortSignal)));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
  });

  it("shows what was added straight away", async () => {
    const uploadFile = vi.fn(async () => ok(apiSource({ id: "s7", name: "a.pdf" })));
    const { result } = liveKb(productsOf(), { ...api, uploadFile });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.q.addFiles([file("a.pdf")]));
    await waitFor(() => expect(result.current.sources.map((s) => s.id)).toEqual(["s7"]));
  });

  it("passes the product failure to the queue", async () => {
    const ensure = vi.fn(async () => err<ApiError>({ kind: "network", op: "POST /api/v1/products", message: "n" }));
    const { result } = liveKb(productsOf({ products: [], selected: null, ensure }));
    act(() => { result.current.q.addFiles([file("a.pdf")]); result.current.q.addUrl("kilima.co.ke", "/", false); });
    await waitFor(() => expect(result.current.q.items.every((i) => i.state === "error")).toBe(true));
  });

  it("Replace file: the next upload replaces that source; Replace in the queue finds it by name", async () => {
    resetKb({ sources: [sourceRow({ id: "s1", name: "Spec.pdf" })] });
    const uploadFile = vi.fn(async () => ok(apiSource({ id: "s1", name: "Spec.pdf" })));
    const { result } = liveKb(productsOf(), { ...api, uploadFile });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.replace("s1"));
    act(() => result.current.q.addFiles([file("Spec.pdf")], result.current.existing));
    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith("p1", expect.any(File), expect.objectContaining({ replaceSourceId: "s1" })));
    // A local duplicate row (no server id yet): Replace looks the source up by name.
    act(() => result.current.q.addFiles([file("Spec.pdf")], result.current.existing));
    const dup = result.current.q.items[0];
    expect(dup.state).toBe("error");
    act(() => result.current.replaceFromQueue(dup));
    expect(lastToast()?.children).toBe("Replacing Spec.pdf");
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    expect(uploadFile).toHaveBeenLastCalledWith("p1", expect.any(File), expect.objectContaining({ replaceSourceId: "s1" }));
  });
});
