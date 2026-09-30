// @vitest-environment node
// (Node: its fetch and FormData/File are the same implementation; jsdom’s FormData can’t go through Node’s fetch.)
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server, testConfig } from "@/test/msw";
import { companyOut, companyRow, leads, leadsHandlers, resetLeads } from "@/test/leadsMock";
import {
  IMPORT_TIMEOUT_MS, LEADS_PATHS, PAGE_SIZE, createLeadsApi, decodeBulk, decodeCompany, decodeDryRun, decodeEnrollPlan, decodeImport, decodePage, decodePreview, decodeSegment, decodeSegments,
} from "./leads";
import { createApiClient } from "./client";
import { leadsApiFor } from "./index";

const api = leadsApiFor(testConfig());
beforeEach(() => { resetLeads(); server.use(...leadsHandlers); });
const bodyOf = (op: string) => leads.calls.filter((c) => c.op === op).at(-1)?.body as Record<string, unknown> | undefined;
const csv = (text: string) => new Blob([text], { type: "text/csv" });

describe("LEADS_PATHS", () => {
  it("encodes ids into the PR #71 routes", () => {
    expect(LEADS_PATHS.query).toBe("/api/v1/companies/query");
    expect(LEADS_PATHS.company("c 1")).toBe("/api/v1/companies/c%201");
    expect(LEADS_PATHS.merge("c1")).toBe("/api/v1/companies/c1/merge");
    expect(LEADS_PATHS.bulk).toBe("/api/v1/companies/bulk");
    expect(LEADS_PATHS.enrollPlan).toBe("/api/v1/companies/enroll-plan");
    expect(LEADS_PATHS.lead("l/1")).toBe("/api/v1/leads/l%2F1");
    expect(LEADS_PATHS.unsubscribe("l1")).toBe("/api/v1/leads/l1/unsubscribe");
    expect(LEADS_PATHS.segments).toBe("/api/v1/segments");
    expect(LEADS_PATHS.preview).toBe("/api/v1/segments/preview");
    expect(LEADS_PATHS.segment("s1")).toBe("/api/v1/segments/s1");
    expect(LEADS_PATHS.members("s1")).toBe("/api/v1/segments/s1/companies");
    expect(LEADS_PATHS.imports).toBe("/api/v1/lead-imports");
    expect(LEADS_PATHS.import("i1")).toBe("/api/v1/lead-imports/i1");
    expect(LEADS_PATHS.errorsCsv("i1")).toBe("/api/v1/lead-imports/i1/errors.csv");
  });
});

describe("decoders", () => {
  const row = () => companyOut(leads.companies[0]);
  it("camel-cases a company row with its primary person and fit", () => {
    const r = decodePage({ data: [row()], next_cursor: null, has_more: false, total: 1 });
    expect(r).toMatchObject({ ok: true, value: { total: 1, hasMore: false, nextCursor: null, data: [{ id: "c1", name: "Kilima Dairies", replyStatus: "interested", fit: 94, source: "search", size: "51-200",
      primary: { id: "l1", email: "wanjiru@kilima.co.ke", emailStatus: "verified", isPrimary: true, firstName: "Wanjiru" } }] } });
  });
  it("reads a company without a person or a fit", () => {
    const r = decodePage({ data: [{ ...row(), primary: null, fit: null, size: null }], next_cursor: "x", has_more: true, total: 9 });
    expect(r).toMatchObject({ ok: true, value: { nextCursor: "x", data: [{ primary: null, fit: null, size: null }] } });
  });
  it.each([
    ["reply_status", { reply_status: "maybe" }, /companies.data\[0\].reply_status: expected one of/],
    ["source", { source: "fax" }, /source/],
    ["size", { size: "huge" }, /size/],
    ["fit", { fit: "90" }, /fit: expected number, got string/],
    ["primary", { primary: { id: "p" } }, /primary.email_status/],
  ])("rejects a bad %s", (_k, over, msg) => {
    const r = decodePage({ data: [{ ...row(), ...over }], next_cursor: null, has_more: false, total: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
  it("reads a company detail with its people and fits", () => {
    const r = decodeCompany({ ...row(), people: [row().primary], fits: [{ product_id: "p1", score: 94 }] });
    expect(r).toMatchObject({ ok: true, value: { people: [{ id: "l1" }], fits: [{ productId: "p1", score: 94 }] } });
  });
  it("reads segments, their rules, and rejects a rule value that isn't a number, text or list", () => {
    expect(decodeSegments([{ id: "s1", name: "A", match: "any", created_at: "t", updated_at: "t" }])).toMatchObject({ ok: true, value: [{ id: "s1", match: "any" }] });
    const d = { id: "s1", name: "A", match: "all", created_at: "t", updated_at: "t", pinned: 2, count: 5, rules: [{ field: "fit", op: "gte", value: 80, product_id: "p1" }, { field: "country", op: "is", value: ["Kenya"] }, { field: "title", op: "contains", value: "ops" }] };
    expect(decodeSegment(d)).toMatchObject({ ok: true, value: { pinned: 2, count: 5, rules: [{ field: "fit", product_id: "p1" }, { value: ["Kenya"] }, { value: "ops" }] } });
    expect(decodeSegment({ ...d, rules: [{ field: "country", op: "is", value: [1] }] })).toMatchObject({ ok: false, error: expect.stringMatching(/segment.rules\[0\].value/) });
    expect(decodeSegment({ ...d, rules: [{ field: "colour", op: "is", value: [] }] }).ok).toBe(false);
  });
  it("reads bulk results, the enroll dry run, previews, imports and a dry run", () => {
    expect(decodeBulk({ matched: 3, changed: 2, skipped: [{ reason: "unsubscribed", n: 1 }] })).toMatchObject({ ok: true, value: { changed: 2, skipped: [{ reason: "unsubscribed", n: 1 }] } });
    expect(decodeEnrollPlan({ matched: 3, will_enroll: 2, skipped: [], sends_per_day: 210, days: 1 })).toMatchObject({ ok: true, value: { willEnroll: 2, sendsPerDay: 210 } });
    expect(decodePreview({ count: 1, peek: [row()] })).toMatchObject({ ok: true, value: { count: 1, peek: [{ id: "c1" }] } });
    const imp = { id: "i1", filename: "a.csv", byte_size: 9, policy: "fill", status: "running", progress_pct: 40, total_rows: null, created_count: 1, updated_count: 2, skipped_count: 3, error_count: 4, in_file_duplicates: 5, existing_duplicates: 6, people_created: 7, failure: null, note: null, has_errors_file: true, finished_at: null, created_at: "t", updated_at: "t" };
    expect(decodeImport(imp)).toMatchObject({ ok: true, value: { progressPct: 40, created: 1, updated: 2, skipped: 3, errors: 4, inFileDuplicates: 5, existingDuplicates: 6, peopleCreated: 7, hasErrorsFile: true, totalRows: null } });
    expect(decodeImport({ ...imp, status: "paused" }).ok).toBe(false);
    expect(decodeDryRun({ plan: { total: 3, create: 1, update: 1, skipped: 0, errors: 1, in_file: 0, existing: 1 }, headers: ["Company"], errors: [{ row: 2, field: "email", value: "x", message: "Not an email" }] }))
      .toMatchObject({ ok: true, value: { plan: { inFile: 0, existing: 1 }, headers: ["Company"], errors: [{ row: 2 }] } });
  });
});

describe("createLeadsApi", () => {
  it("queries with defaults, then with rules, sort, product and a cursor", async () => {
    const r = await api.query({});
    expect(r).toMatchObject({ ok: true, value: { total: 3 } });
    expect(bodyOf("POST /companies/query")).toEqual({ rules: [], match: "all", sort: { key: "created", dir: "desc" }, limit: PAGE_SIZE });
    const r2 = await api.query({ rules: [{ field: "industry", op: "is", value: ["Dairy"] }], match: "any", sort: { key: "fit", dir: "desc" }, productId: "p1", cursor: "0", limit: 1 });
    expect(r2).toMatchObject({ ok: true, value: { total: 1, data: [{ id: "c1" }] } });
    expect(bodyOf("POST /companies/query")).toEqual({ rules: [{ field: "industry", op: "is", value: ["Dairy"] }], match: "any", sort: { key: "fit", dir: "desc" }, limit: 1, product_id: "p1", cursor: "0" });
  });

  it("reads, updates, deletes and merges companies", async () => {
    expect(await api.company("c1")).toMatchObject({ ok: true, value: { people: [{ id: "l1" }], fits: [{ score: 94 }] } });
    expect(await api.company("nope")).toMatchObject({ ok: false, error: { kind: "http", status: 404 } });
    expect(await api.updateCompany("c2", { reply_status: "meeting_booked" })).toMatchObject({ ok: true, value: { replyStatus: "meeting_booked" } });
    server.use(http.delete(`${API}/api/v1/companies/c3`, () => new HttpResponse(null, { status: 204 })));
    expect(await api.deleteCompany("c3")).toEqual({ ok: true, value: undefined });
    expect(await api.merge("c1", "c2")).toMatchObject({ ok: true, value: { id: "c1", people: [{ id: "l1" }, { id: "l2" }] } });
    expect(bodyOf("POST /companies/c1/merge")).toEqual({ duplicate_id: "c2" });
  });

  it("runs bulk actions over ids or everything matching, with confirm", async () => {
    expect(await api.bulk({ action: "set_reply_status", reply_status: "contacted" }, { ids: ["c2", "c3"] })).toMatchObject({ ok: true, value: { matched: 2, changed: 2 } });
    expect(bodyOf("POST /companies/bulk")).toEqual({ action: "set_reply_status", reply_status: "contacted", selection: { ids: ["c2", "c3"] }, confirm: false });
    expect(await api.bulk({ action: "add_to_segment", segment_id: "s1" }, { all: true, rules: [], match: "all" }, { confirm: true })).toMatchObject({ ok: true, value: { changed: 3 } });
    expect(bodyOf("POST /companies/bulk")).toMatchObject({ selection: { all: true, rules: [], match: "all" }, confirm: true });
    expect(await api.enrollPlan({ ids: ["c1", "c3"] })).toMatchObject({ ok: true, value: { matched: 2, willEnroll: 1, skipped: [{ reason: "no_verified_email", n: 1 }] } });
  });

  it("changes a person's email status and unsubscribes them", async () => {
    expect(await api.updatePerson("l3", { email_status: "bounced" })).toMatchObject({ ok: true, value: { emailStatus: "bounced" } });
    expect(await api.unsubscribe("l2")).toMatchObject({ ok: true, value: { unsubscribedAt: expect.any(String) } });
    expect(leads.companies.find((c) => c.id === "c2")?.reply_status).toBe("unsubscribed");
  });

  it("lists, previews, creates, reads, updates segments and pages their members", async () => {
    expect(await api.segments()).toMatchObject({ ok: true, value: [{ id: "s1", name: "Kenya dairy" }] });
    expect(await api.segment("s1")).toMatchObject({ ok: true, value: { count: 1, rules: [{ field: "industry" }] } });
    expect(await api.preview([{ field: "industry", op: "is", value: ["Seafood"] }], "all")).toMatchObject({ ok: true, value: { count: 1, peek: [{ id: "c2" }] } });
    const made = await api.createSegment({ name: "Pinned", rules: [], match: "all", company_ids: ["c3"] });
    expect(made).toMatchObject({ ok: true, value: { name: "Pinned", pinned: 1, count: 1 } });
    expect(await api.createSegment({ name: "Pinned", rules: [], match: "all" })).toMatchObject({ ok: false, error: { status: 409, code: "duplicate" } });
    expect(bodyOf("POST /segments")).toEqual({ company_ids: [], name: "Pinned", rules: [], match: "all" });
    expect(await api.updateSegment("s1", { match: "any", rules: [{ field: "industry", op: "is", value: ["Dairy", "Seafood"] }] })).toMatchObject({ ok: true, value: { count: 2, match: "any" } });
    expect(await api.members("s1", { sort: { key: "company", dir: "asc" } })).toMatchObject({ ok: true, value: { total: 2, data: [{ id: "c1" }, { id: "c2" }] } });
  });

  it("sends a dry run and an import as multipart, and follows its progress", async () => {
    const input = { file: csv("Company,Email\nA,a@a.co\nB,b@b.co\n"), name: "list.csv", mapping: ["company", "email"], policy: "fill" as const };
    expect(await api.dryRun(input)).toMatchObject({ ok: true, value: { plan: { total: 2, create: 1, update: 1 } } });
    expect(bodyOf("POST /lead-imports (dry run)")).toEqual({ name: "list.csv", mapping: ["company", "email"], policy: "fill" });
    const started = await api.startImport(input);
    expect(started).toMatchObject({ ok: true, value: { status: "queued", filename: "list.csv", policy: "fill" } });
    const id = started.ok ? started.value.id : "";
    expect(await api.getImport(id)).toMatchObject({ ok: true, value: { status: "running", progressPct: 50 } });
    expect(await api.getImport(id)).toMatchObject({ ok: true, value: { status: "done", progressPct: 100, created: 1, hasErrorsFile: true } });
    expect(api.errorsUrl(id)).toBe(`${API}/api/v1/lead-imports/${id}/errors.csv`);
  });

  it("gives imports the long upload deadline", async () => {
    const seen: number[] = [];
    const client = createApiClient({ baseUrl: API, timeoutMs: 10, fetch: async (input, init) => { seen.push(init?.signal ? 1 : 0); return globalThis.fetch(input, init); } });
    const slow = createLeadsApi(client);
    server.use(http.post(`${API}/api/v1/lead-imports`, async () => { await new Promise((r) => setTimeout(r, 40)); return HttpResponse.json({ plan: { total: 0, create: 0, update: 0, skipped: 0, errors: 0, in_file: 0, existing: 0 }, headers: [], errors: [] }); }));
    expect(await slow.dryRun({ file: csv("a\n1"), name: "a.csv", mapping: ["company"], policy: "skip" })).toMatchObject({ ok: true });
    expect(IMPORT_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(seen).toEqual([1]);
  });

  it("turns a malformed page into invalid_response", async () => {
    server.use(http.post(`${API}/api/v1/companies/query`, () => HttpResponse.json({ data: [companyRow({ id: "x", name: "X" })], total: 1 })));
    expect(await api.query({})).toMatchObject({ ok: false, error: { kind: "invalid_response" } });
  });
});
