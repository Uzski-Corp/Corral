import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { kbApiFor, leadsApiFor, type LeadsApi } from "@/lib/api";
import { API, server, testConfig } from "@/test/msw";
import { kbHandlers, productRow, resetKb } from "@/test/kbMock";
import { companyRow, leads, leadsHandlers, personRow, resetLeads } from "@/test/leadsMock";
import type { Rule, Sort } from "@/lib/leads/segment";
import { useLeadProduct, useLiveLeads, useLivePreview, useLiveSegments, type LiveSegments } from "./live";

const toast = vi.fn();
vi.mock("../Toaster", () => ({ useToast: () => toast }));

let api: LeadsApi;
beforeEach(() => { resetLeads(); resetKb(); server.use(...leadsHandlers, ...kbHandlers); api = leadsApiFor(testConfig()); toast.mockReset(); });
const lastToast = () => toast.mock.calls.at(-1)?.[0] as { children: string; meta?: string; tone?: string; action?: { label: string; onClick(): void } };
const bodies = (op: string) => leads.calls.filter((c) => c.op === op).map((c) => c.body as Record<string, unknown>);
const NOW = () => new Date("2026-09-30T06:00:00Z");
const FIT: Sort = { key: "fit", dir: "desc" };
type View = { seg?: string; tab: string; rules: Rule[]; match: "all" | "any"; sort: Sort };

function setup(view: Partial<View> = {}, o: { productId?: string | null; segments?: LiveSegments | null } = {}) {
  const input = { api, productId: o.productId === undefined ? "p1" : o.productId, productReady: true, segments: o.segments ?? null };
  return renderHook((v: View) => useLiveLeads(input, { ...v, now: NOW }), { initialProps: { tab: "all", rules: [], match: "all", sort: FIT, ...view } });
}
const ready = async (r: { current: ReturnType<typeof useLiveLeads> }) => { await waitFor(() => expect(r.current?.phase).toBe("ready")); return r.current!; };

/* ------------------------------------------------------------ product and segments */
describe("useLeadProduct", () => {
  it("is idle without an API, then picks the oldest product", async () => {
    expect(renderHook(() => useLeadProduct(null)).result.current).toEqual({ productId: null, ready: false });
    resetKb({ products: [productRow("p2", "Gateway", "2026-09-30T08:00:00Z"), productRow("p1", "Sensors", "2026-09-01T08:00:00Z")] });
    const { result } = renderHook(() => useLeadProduct(kbApiFor(testConfig())));
    await waitFor(() => expect(result.current).toEqual({ productId: "p1", productName: "Sensors", ready: true }));
  });
  it("still loads the table when there's no product or no answer", async () => {
    server.use(http.get(`${API}/api/v1/products`, () => HttpResponse.json({ detail: "down" }, { status: 503 })));
    const { result } = renderHook(() => useLeadProduct(kbApiFor(testConfig())));
    await waitFor(() => expect(result.current).toEqual({ productId: null, productName: null, ready: true }));
  });
});

describe("useLiveSegments", () => {
  it("is null without an API", () => expect(renderHook(() => useLiveSegments(null)).result.current).toBeNull());
  it("loads each segment's count and rules, oldest first, and refreshes", async () => {
    leads.segments.push({ id: "s9", name: "Replied", rules: [{ field: "reply", op: "is", value: ["interested"] }], match: "any", pins: ["c3"], created_at: "2026-09-30T07:00:00Z" });
    const { result } = renderHook(() => useLiveSegments(api));
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    expect(result.current!.list.map((s) => [s.name, s.count, s.match])).toEqual([["Kenya dairy", 1, "all"], ["Replied", 2, "any"]]);
    expect(result.current!.byName("Replied")?.rules[0]).toMatchObject({ field: "reply", value: ["Interested"] });
    expect(result.current!.byName("nope")).toBeUndefined();
    leads.segments[0].pins.push("c2");
    act(() => result.current!.refresh());
    await waitFor(() => expect(result.current!.byName("Kenya dairy")?.count).toBe(2));
  });
  it("reports a failed list, and keeps a segment whose detail failed with no count", async () => {
    server.use(http.get(`${API}/api/v1/segments`, () => HttpResponse.json({}, { status: 503 }), { once: true }));
    const { result } = renderHook(() => useLiveSegments(api));
    await waitFor(() => expect(result.current?.phase).toBe("error"));
    server.use(http.get(`${API}/api/v1/segments/s1`, () => HttpResponse.json({}, { status: 500 })));
    act(() => result.current!.refresh());
    await waitFor(() => expect(result.current?.phase).toBe("ready"));
    expect(result.current!.list).toEqual([{ id: "s1", name: "Kenya dairy", count: 0, rules: [], match: "all" }]);
  });
});

/* ------------------------------------------------------------ preview */
describe("useLivePreview", () => {
  const r = (value: string[]): Rule => ({ id: "r1", field: "industry", op: "is", value });
  it("asks the API for finished rules, debounced, and maps the first matches", async () => {
    const { result, rerender } = renderHook((p: { rules: Rule[] }) => useLivePreview(api, { rules: p.rules, match: "all", productId: "p1", enabled: true, now: NOW }), { initialProps: { rules: [r(["Dairy"])] } });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.count).toBe(1));
    expect(result.current!.peek[0]).toMatchObject({ company: "Kilima Dairies" });
    rerender({ rules: [r(["Dairy", "Seafood"])] });
    expect(result.current).toBeNull();   // stale until the new rules answer
    await waitFor(() => expect(result.current?.count).toBe(2));
    expect(bodies("POST /segments/preview").at(-1)).toEqual({ rules: [{ field: "industry", op: "is", value: ["Dairy", "Seafood"] }], match: "all" });
  });
  it("does nothing while closed, without an API, or with only unfinished rules", async () => {
    renderHook(() => useLivePreview(api, { rules: [r([])], match: "all", productId: "p1", enabled: true }));
    renderHook(() => useLivePreview(api, { rules: [r(["Dairy"])], match: "all", productId: "p1", enabled: false }));
    renderHook(() => useLivePreview(null, { rules: [r(["Dairy"])], match: "all", productId: "p1", enabled: true }));
    await new Promise((res) => setTimeout(res, 350));
    expect(bodies("POST /segments/preview")).toEqual([]);
  });
});

/* ------------------------------------------------------------ the table */
describe("useLiveLeads: loading", () => {
  it("is null without an API", () => {
    expect(renderHook(() => useLiveLeads(null, { tab: "all", rules: [], match: "all", sort: FIT })).result.current).toBeNull();
  });
  it("loads the first page sorted by fit for the product, with the tab counts", async () => {
    const { result } = setup();
    expect(result.current?.phase).toBe("loading");
    const lv = await ready(result);
    expect(lv.rows.map((l) => [l.company, l.fit, l.reply])).toEqual([["Kilima Dairies", 94, "Interested"], ["Pwani Fresh", 91, "Objection"], ["Savanna Juice Co.", 0, "Not contacted"]]);
    expect(lv.total).toBe(3);
    expect(lv.hasMore).toBe(false);
    expect(lv.fitOf("c3")).toEqual({ kind: "none", why: "new" });
    expect(lv.fitOf("c1")).toBeUndefined();
    expect(lv.fitOf("zz")).toBeUndefined();
    expect(bodies("POST /companies/query")[0]).toEqual({ rules: [], match: "all", sort: { key: "fit", dir: "desc" }, limit: 50, product_id: "p1" });
    await waitFor(() => expect(result.current!.counts).toEqual({ all: 3, fit: 2, seq: 0, rep: 2 }));
    expect(lv.empty).toBe(false);
  });
  it("waits for the product before asking", async () => {
    const input = { api, productId: null, productReady: false, segments: null };
    const { result } = renderHook(() => useLiveLeads(input, { tab: "all", rules: [], match: "all", sort: FIT }));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current?.phase).toBe("loading");
    expect(leads.calls).toEqual([]);
  });
  it("is empty (first run) when there are no companies at all", async () => {
    resetLeads({ companies: [], people: [] });
    const { result } = setup();
    await waitFor(() => expect(result.current?.empty).toBe(true));
  });
  it("shows the Fit 80+ tab as empty, and doesn't sort by fit, without a product", async () => {
    const { result } = setup({ tab: "fit" }, { productId: null });
    const lv = await ready(result);
    expect(lv.rows).toEqual([]);
    await waitFor(() => expect(result.current!.counts).toMatchObject({ all: 3, fit: 0 }));
    expect(bodies("POST /companies/query").every((b) => !("product_id" in b))).toBe(true);
  });
  it("asks again for the tab, the chips and the sort", async () => {
    const { result, rerender } = setup();
    await ready(result);
    rerender({ tab: "rep", rules: [{ id: "r", field: "industry", op: "is", value: ["Seafood"] }], match: "all", sort: { key: "company", dir: "asc" } });
    await waitFor(() => expect(result.current!.rows.map((l) => l.id)).toEqual(["c2"]));
    expect(bodies("POST /companies/query").at(-1)).toMatchObject({ sort: { key: "company", dir: "asc" }, rules: [{ field: "reply" }, { field: "industry", value: ["Seafood"] }] });
    rerender({ tab: "rep", rules: [{ id: "r", field: "industry", op: "is", value: ["Seafood"] }, { id: "q", field: "industry", op: "is", value: ["Beverages"] }], match: "any", sort: FIT });
    await waitFor(() => expect(result.current!.tabDropped).toBe(true));
    await waitFor(() => expect(result.current!.rows.map((l) => l.id)).toEqual(["c2", "c3"]));
  });
  it("pages on with the cursor and doesn't repeat rows", async () => {
    resetLeads({ companies: Array.from({ length: 60 }, (_, i) => companyRow({ id: `k${String(i).padStart(2, "0")}`, name: `Co ${i}`, created_at: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z` })), people: [], fits: {} });
    const { result } = setup({ sort: { key: "company", dir: "asc" } });
    const lv = await ready(result);
    expect(lv.rows).toHaveLength(50);
    expect(lv.hasMore).toBe(true);
    act(() => { lv.more(); lv.more(); });   // a second scroll while loading is ignored
    await waitFor(() => expect(result.current!.rows).toHaveLength(60));
    expect(result.current!.hasMore).toBe(false);
    expect(bodies("POST /companies/query").filter((b) => b.cursor === "50")).toHaveLength(1);
    act(() => result.current!.more());   // nothing more to load
    expect(bodies("POST /companies/query").filter((b) => b.cursor)).toHaveLength(1);
  });
  it("keeps the page when a next page fails", async () => {
    resetLeads({ companies: Array.from({ length: 55 }, (_, i) => companyRow({ id: `k${i}`, name: `Co ${i}` })), people: [], fits: {} });
    const { result } = setup({ sort: { key: "company", dir: "asc" } });
    const lv = await ready(result);
    server.use(http.post(`${API}/api/v1/companies/query`, () => HttpResponse.json({}, { status: 503 }), { once: true }));
    act(() => lv.more());
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current!.rows).toHaveLength(50);
    expect(result.current!.phase).toBe("ready");
  });
  it("shows the error with the request, and loads again on retry", async () => {
    server.use(http.post(`${API}/api/v1/companies/query`, () => HttpResponse.json({ detail: "down" }, { status: 503 })));
    const segs = { phase: "ready" as const, list: [], byName: () => undefined, refresh: vi.fn() };
    const { result } = setup({}, { segments: segs });
    await waitFor(() => expect(result.current?.phase).toBe("error"));
    expect(result.current!.errorDetail).toBe("POST /api/v1/companies/query · 503");
    server.resetHandlers(); server.use(...leadsHandlers, ...kbHandlers);
    act(() => result.current!.retry());
    await ready(result);
    expect(segs.refresh).toHaveBeenCalled();
  });
  it("reads a segment's members, and waits while the segments load", async () => {
    const seg = { id: "s1", name: "Kenya dairy", count: 1, rules: [], match: "all" as const };
    const loading: LiveSegments = { phase: "loading", list: [], byName: () => undefined, refresh: vi.fn() };
    const { result, rerender } = renderHook((p: { segments: LiveSegments }) => useLiveLeads({ api, productId: "p1", productReady: true, segments: p.segments }, { seg: "Kenya dairy", tab: "fit", rules: [], match: "all", sort: FIT }), { initialProps: { segments: loading } });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current?.phase).toBe("loading");
    rerender({ segments: { phase: "ready", list: [seg], byName: (n) => (n === seg.name ? seg : undefined), refresh: vi.fn() } });
    const lv = await ready(result);
    expect(lv.rows.map((l) => l.id)).toEqual(["c1"]);
    expect(bodies("POST /segments/s1/companies")[0]).toMatchObject({ rules: [], product_id: "p1" });
    expect(lv.empty).toBe(false);
    expect(bodies("POST /companies/query")).toEqual([]);   // no tab counts in a segment
  });
});

describe("useLiveLeads: status", () => {
  it("sets one company's reply status, then Undo puts it back", async () => {
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c2"], "Meeting booked"));
    expect(result.current!.rows.find((l) => l.id === "c2")?.reply).toBe("Meeting booked");   // optimistic
    await waitFor(() => expect(lastToast()?.children).toBe("Pwani Fresh set to Meeting booked"));
    expect(lastToast().meta).toBe("Corral changes it again only if they reply");
    expect(bodies("POST /companies/bulk")[0]).toEqual({ action: "set_reply_status", reply_status: "meeting_booked", selection: { ids: ["c2"] }, confirm: true });
    act(() => lastToast().action!.onClick());
    await waitFor(() => expect(bodies("POST /companies/bulk").at(-1)).toEqual({ action: "set_reply_status", reply_status: "objection", selection: { ids: ["c2"] }, confirm: true }));
    expect(result.current!.rows.find((l) => l.id === "c2")?.reply).toBe("Objection");
  });
  it("sets many, and Undo restores each one's own status", async () => {
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c1", "c2", "c3"], "Not interested"));
    await waitFor(() => expect(lastToast()?.children).toBe("3 companies set to Not interested"));
    expect(lastToast().meta).toBe("removed from sequences");
    act(() => lastToast().action!.onClick());
    await waitFor(() => expect(bodies("POST /companies/bulk")).toHaveLength(4));
    expect(bodies("POST /companies/bulk").slice(1).map((b) => [b.reply_status, (b.selection as { ids: string[] }).ids])).toEqual([["interested", ["c1"]], ["objection", ["c2"]], ["not_contacted", ["c3"]]]);
  });
  it("sets everything the view matches in one call, without Undo, and reloads", async () => {
    const { result } = setup({ rules: [{ id: "r", field: "industry", op: "is", value: ["Dairy", "Seafood"] }] });
    const lv = await ready(result);
    const before = bodies("POST /companies/query").length;
    act(() => lv.setStatus("all", "Contacted"));
    await waitFor(() => expect(lastToast()?.children).toBe("2 companies set to Contacted"));
    expect(lastToast().action).toBeUndefined();
    expect(bodies("POST /companies/bulk")[0]).toMatchObject({ selection: { all: true, match: "all", rules: [{ field: "industry", value: ["Dairy", "Seafood"] }] } });
    await waitFor(() => expect(bodies("POST /companies/query").length).toBeGreaterThan(before));
  });
  it("unsubscribes one company's person (final, so no Undo)", async () => {
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c1"], "Unsubscribed"));
    await waitFor(() => expect(lastToast()?.children).toBe("Kilima Dairies set to Unsubscribed"));
    expect(leads.calls.map((c) => c.op)).toContain("POST /leads/l1/unsubscribe");
    expect(lastToast().action).toBeUndefined();
    expect(leads.people.find((p) => p.id === "l1")?.unsubscribed_at).not.toBeNull();
  });
  it("unsubscribes a company without a person through the bulk action", async () => {
    resetLeads({ people: [] });
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c1"], "Unsubscribed"));
    await waitFor(() => expect(bodies("POST /companies/bulk")[0]).toMatchObject({ reply_status: "unsubscribed" }));
  });
  it("says so when a status isn't one the API stores", async () => {
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c1"], "Disqualified"));
    expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t set Kilima Dairies to Disqualified", meta: "Disqualified isn’t a status Corral stores yet" });
    expect(bodies("POST /companies/bulk")).toEqual([]);
  });
  it("puts the row back and offers Try again when the API refuses", async () => {
    server.use(http.post(`${API}/api/v1/companies/bulk`, () => HttpResponse.json({ error: "confirm_required", detail: "Confirm." }, { status: 409 }), { once: true }));
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c2"], "Interested"));
    await waitFor(() => expect(lastToast()?.tone).toBe("error"));
    expect(lastToast()).toMatchObject({ children: "Couldn’t set Pwani Fresh to Interested", meta: "POST /api/v1/companies/bulk · 409" });
    expect(result.current!.rows.find((l) => l.id === "c2")?.reply).toBe("Objection");
    act(() => lastToast().action!.onClick());
    await waitFor(() => expect(lastToast()?.children).toBe("Pwani Fresh set to Interested"));
  });
  it("sets the primary person's email status, with Undo", async () => {
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c3"], "Bounced", "email"));
    expect(result.current!.rows.find((l) => l.id === "c3")?.email).toBe("Bounced");
    await waitFor(() => expect(lastToast()?.children).toBe("Savanna Juice Co. set to Bounced"));
    expect(bodies("PATCH /leads/l3")[0]).toEqual({ email_status: "bounced" });
    act(() => lastToast().action!.onClick());
    await waitFor(() => expect(bodies("PATCH /leads/l3").at(-1)).toEqual({ email_status: "catch_all" }));
    expect(result.current!.rows.find((l) => l.id === "c3")?.email).toBe("Catch-all");
  });
  it("reverts an email status the API refused, and ignores one without a person or a known status", async () => {
    server.use(http.patch(`${API}/api/v1/leads/:id`, () => HttpResponse.json({}, { status: 500 }), { once: true }));
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.setStatus(["c1"], "Catch-all", "email"));
    await waitFor(() => expect(lastToast()?.tone).toBe("error"));
    expect(result.current!.rows.find((l) => l.id === "c1")?.email).toBe("Verified");
    toast.mockReset();
    act(() => { lv.setStatus(["c1"], "Interested", "email"); lv.setStatus(["zz"], "Verified", "email"); });
    await new Promise((r) => setTimeout(r, 20));
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("useLiveLeads: segments", () => {
  const segs = (list = [{ id: "s1", name: "Kenya dairy", count: 1, rules: [] as Rule[], match: "all" as const }]) => ({ phase: "ready" as const, list, byName: (n?: string) => list.find((s) => s.name === n), refresh: vi.fn() });
  it("pins the selection to a segment", async () => {
    const s = segs();
    const { result } = setup({}, { segments: s });
    const lv = await ready(result);
    act(() => lv.addToSegment(s.list[0], ["c2", "c3"]));
    await waitFor(() => expect(lastToast()?.children).toBe("Added 2 to Kenya dairy"));
    expect(lastToast().meta).toBe("pinned, even if rules change");
    expect(leads.segments[0].pins).toEqual(["c2", "c3"]);
    expect(s.refresh).toHaveBeenCalled();
    server.use(http.post(`${API}/api/v1/companies/bulk`, () => HttpResponse.json({}, { status: 404 }), { once: true }));
    act(() => lv.addToSegment(s.list[0], "all"));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t add to Kenya dairy" }));
  });
  it("saves a new segment from rules, pins or an import", async () => {
    const s = segs();
    const { result } = setup({}, { segments: s });
    const lv = await ready(result);
    let saved = false;
    await act(async () => { saved = await lv.createSegment({ name: "  Seafood ", rules: [{ id: "r", field: "industry", op: "is", value: ["Seafood"] }], match: "all", companyIds: ["c1"], fromImportId: "i7" }); });
    expect(saved).toBe(true);
    expect(bodies("POST /segments")[0]).toEqual({ name: "Seafood", rules: [{ field: "industry", op: "is", value: ["Seafood"] }], match: "all", company_ids: ["c1"], from_import_id: "i7" });
    expect(lastToast()).toMatchObject({ children: "Saved segment “Seafood”", meta: "in the sidebar under Saved segments" });
    expect(s.refresh).toHaveBeenCalled();
    await act(async () => { saved = await lv.createSegment({ name: "Seafood", rules: [], match: "all" }); });
    expect(saved).toBe(false);
    expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t save “Seafood”", meta: "POST /api/v1/segments · 409" });
  });
  it("saves a segment's edited rules and reloads its members", async () => {
    const s = segs();
    const { result } = setup({ seg: "Kenya dairy" }, { segments: s });
    const lv = await ready(result);
    let saved = false;
    await act(async () => { saved = await lv.saveSegmentRules([{ id: "r", field: "industry", op: "is", value: ["Dairy", "Seafood"] }], "any"); });
    expect(saved).toBe(true);
    expect(bodies("PATCH /segments/s1")[0]).toEqual({ rules: [{ field: "industry", op: "is", value: ["Dairy", "Seafood"] }], match: "any" });
    expect(lastToast()).toMatchObject({ children: "Saved Kenya dairy", meta: "2 companies match" });
    await waitFor(() => expect(result.current!.rows).toHaveLength(2));
    server.use(http.patch(`${API}/api/v1/segments/s1`, () => HttpResponse.json({}, { status: 500 }), { once: true }));
    await act(async () => { saved = await result.current!.saveSegmentRules([], "all"); });
    expect(saved).toBe(false);
    expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t save Kenya dairy" });
  });
  it("can't save rules outside a segment", async () => {
    const { result } = setup();
    const lv = await ready(result);
    let saved = true;
    await act(async () => { saved = await lv.saveSegmentRules([], "all"); });
    expect(saved).toBe(false);
  });
});

describe("useLiveLeads: duplicates, detail, enroll", () => {
  const dupSeed = () => resetLeads({
    companies: [companyRow({ id: "c1", name: "Kilima Dairies", created_at: "2026-09-01T00:00:00Z", domain: "kilima.co.ke", notes: null }), companyRow({ id: "c9", name: "Kilima Dairies Ltd", domain: null, notes: "Met at booth 14", created_at: "2026-09-29T00:00:00Z" })],
    people: [personRow({ id: "l1", company_id: "c1" }), personRow({ id: "l9", company_id: "c9", first_name: "Joseph" })], fits: { c1: 90 },
  });
  it("flags the newer of two look-alikes and merges it into the older one", async () => {
    dupSeed();
    const { result } = setup();
    const lv = await ready(result);
    expect(lv.rows.find((l) => l.id === "c9")?.dupOf).toBe("c1");
    expect(lv.findLead("c1")?.company).toBe("Kilima Dairies");
    let kept: string | null = null;
    await act(async () => { kept = await lv.merge("c9"); });
    expect(kept).toBe("c1");
    expect(bodies("POST /companies/c1/merge")[0]).toEqual({ duplicate_id: "c9" });
    expect(lastToast().children).toBe("Merged into Kilima Dairies");
    await waitFor(() => expect(result.current!.rows.map((l) => l.id)).toEqual(["c1"]));
    expect(result.current!.detailOf("c1")?.people).toHaveLength(2);
    expect(result.current!.detailOf("c1")?.notes).toBe("Met at booth 14");
  });
  it("says why a merge failed, and does nothing for a row that isn't a duplicate", async () => {
    dupSeed();
    server.use(http.post(`${API}/api/v1/companies/:id/merge`, () => HttpResponse.json({}, { status: 404 }), { once: true }));
    const { result } = setup();
    const lv = await ready(result);
    let kept: string | null = "x";
    await act(async () => { kept = await lv.merge("c9"); });
    expect(kept).toBeNull();
    expect(lastToast()).toMatchObject({ tone: "error", children: "Couldn’t merge into Kilima Dairies" });
    await act(async () => { kept = await lv.merge("c1"); });
    expect(kept).toBeNull();
  });
  it("keeps both when asked, for the session", async () => {
    dupSeed();
    const { result } = setup();
    const lv = await ready(result);
    act(() => lv.keepBoth("c9"));
    expect(result.current!.rows.find((l) => l.id === "c9")?.dupOf).toBeUndefined();
    expect(lastToast().children).toBe("Kept both. Corral won't ask about this pair again.");
  });
  it("shows the row's person at once, then the company's people from the API", async () => {
    resetLeads();
    leads.people.push(personRow({ id: "l7", company_id: "c1", is_primary: false, first_name: "Joseph", last_name: "Kariuki", title: "Plant Manager", email: "joseph@kilima.co.ke" }));
    const { result } = setup();
    const lv = await ready(result);
    expect(lv.detailOf("c1")?.people.map((p) => p.name)).toEqual(["Wanjiru Mwangi"]);
    expect(lv.detailOf("zz")).toBeUndefined();
    act(() => lv.loadDetail("c1"));
    await waitFor(() => expect(result.current!.detailOf("c1")?.people.map((p) => p.name)).toEqual(["Wanjiru Mwangi", "Joseph Kariuki"]));
    const gets = leads.calls.length;
    act(() => { result.current!.loadDetail("c1"); result.current!.loadDetail("zz"); });
    expect(leads.calls.length).toBe(gets);
  });
  it("asks the API's dry run what an enrollment would do", async () => {
    const { result } = setup();
    const lv = await ready(result);
    let plan: Awaited<ReturnType<typeof lv.enrollPlan>> | undefined;
    await act(async () => { plan = await lv.enrollPlan(["c1", "c3"]); });
    expect(plan).toMatchObject({ ok: true, value: { willEnroll: 1, skipped: [{ reason: "no_verified_email", n: 1 }] } });
    await act(async () => { plan = await lv.enrollPlan("all"); });
    expect(bodies("POST /companies/enroll-plan").at(-1)).toMatchObject({ selection: { all: true } });
  });
  it("lists what's loaded for the import's duplicate check, and reloads when an import finishes", async () => {
    const { result } = setup();
    const lv = await ready(result);
    expect(lv.existing[0]).toEqual({ id: "c1", company: "Kilima Dairies", domain: "kilima.co.ke", email: "wanjiru@kilima.co.ke" });
    const before = bodies("POST /companies/query").length;
    // jsdom's FormData can't go through fetch (see import.live.test.ts): answer the upload directly, already done.
    vi.spyOn(api, "startImport").mockResolvedValue({ ok: true, value: { id: "i1", filename: "a.csv", byteSize: 9, policy: "skip", status: "done", progressPct: 100, totalRows: 2, created: 2, updated: 0, skipped: 0, errors: 0, inFileDuplicates: 0, existingDuplicates: 0, peopleCreated: 0, failure: null, note: null, hasErrorsFile: false, finishedAt: null, createdAt: "t" } });
    await act(async () => { await lv.importer.run({ file: new Blob(["Company\nA\nB"]), name: "a.csv", mapping: ["company"], policy: "skip" }, () => {}); });
    await waitFor(() => expect(bodies("POST /companies/query").length).toBeGreaterThan(before));
  }, 10_000);
});
