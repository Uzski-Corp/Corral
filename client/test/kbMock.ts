/**
 * An in-memory knowledge-base API (PR #67 contract) for MSW: products, sources with processing
 * that advances on each list, uploads, web pages, remove/restore, re-read, passages and search.
 * Tests reach into `kb` to seed rows or flip behaviour, and override single routes with server.use.
 */
import { http, HttpResponse } from "msw";
import { API, ME_BODY } from "./msw";

type Row = Record<string, unknown> & { id: string; product_id: string; name: string; status: string };
const P = `${API}/api/v1/products`;
const T0 = "2026-09-30T06:00:00Z";

export function sourceRow(over: Partial<Row> & { id: string; name: string }): Row {
  return {
    product_id: "p1", kind: "pdf", url: null, scope: null, byte_size: 2_400_000, status: "ready",
    stage: null, stage_pct: 0, progress: null, failure: null, failure_stage: null, pages_total: 12, pages_read: 12,
    skipped: null, skipped_reason: null, note: null, passage_count: 40, attempts: 1,
    added_by_user_id: ME_BODY.user.id, created_at: T0, updated_at: T0, processed_at: T0, deleted_at: null, ...over,
  };
}
export const productRow = (id: string, name: string, created_at = T0, description: string | null = null) => ({ id, name, description, created_at, updated_at: created_at });

export type KbMock = {
  products: ReturnType<typeof productRow>[];
  sources: Row[];
  /** Lists before a processing source becomes ready (0 = stays processing). */
  readyAfter: number;
  lists: number;
  seq: number;
  calls: string[];
};
export const kb: KbMock = { products: [], sources: [], readyAfter: 0, lists: 0, seq: 0, calls: [] };

export function resetKb(seed: Partial<Pick<KbMock, "products" | "sources" | "readyAfter">> = {}) {
  kb.products = seed.products ?? [productRow("p1", "Kilima Dairies")];
  kb.sources = seed.sources ?? [];
  kb.readyAfter = seed.readyAfter ?? 0;
  kb.lists = 0; kb.seq = 0; kb.calls = [];
}

const find = (id: string) => kb.sources.find((s) => s.id === id);
const notFound = () => HttpResponse.json({ error: "not_found", detail: "No such source." }, { status: 404 });
const put = (row: Row) => { kb.sources = [row, ...kb.sources.filter((s) => s.id !== row.id)]; return row; };

export const kbHandlers = [
  http.get(P, () => HttpResponse.json(kb.products)),
  http.post(P, async ({ request }) => {
    const { name, description } = (await request.json()) as { name: string; description?: string | null };
    if (kb.products.some((p) => p.name === name)) return HttpResponse.json({ error: "name_taken", detail: "A product has that name." }, { status: 409 });
    const p = productRow(`p${kb.products.length + 1}`, name, new Date().toISOString(), description?.trim() || null);
    kb.products.push(p);
    return HttpResponse.json(p, { status: 201 });
  }),
  http.get(`${P}/:pid/knowledge/sources`, ({ params, request }) => {
    kb.lists++;
    kb.calls.push("list");
    if (kb.readyAfter && kb.lists >= kb.readyAfter)
      kb.sources = kb.sources.map((s) => (s.status === "processing" ? { ...s, status: "ready", stage: null, passage_count: 8, processed_at: new Date().toISOString() } : s));
    const u = new URL(request.url);
    const limit = Number(u.searchParams.get("limit") ?? 50);
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const rows = kb.sources.filter((s) => s.product_id === params.pid && (u.searchParams.get("include_removed") === "true" || !s.deleted_at));
    return HttpResponse.json(rows.slice(offset, offset + limit));
  }),
  http.post(`${P}/:pid/knowledge/sources/files`, async ({ params, request }) => {
    const form = await request.formData();
    const file = form.get("file") as File;
    const replace = form.get("replace_source_id");
    kb.calls.push(`upload ${file.name}${replace ? ` replacing ${String(replace)}` : ""}`);
    const dup = kb.sources.find((s) => s.name === file.name && !s.deleted_at && s.id !== replace);
    if (dup) return HttpResponse.json({ error: "duplicate", detail: "That file is already in the knowledge base.", existing_source_id: dup.id }, { status: 409 });
    const ext = file.name.split(".").pop();
    const row = sourceRow({
      id: typeof replace === "string" ? replace : `s${++kb.seq}`, product_id: String(params.pid), name: file.name,
      kind: ext === "docx" ? "docx" : ext === "md" ? "md" : "pdf", byte_size: file.size, status: "processing", stage: "scan", stage_pct: 0,
      passage_count: 0, attempts: 0, processed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    return HttpResponse.json(put(row), { status: 202 });
  }),
  http.post(`${P}/:pid/knowledge/sources/urls`, async ({ params, request }) => {
    const { url, scope } = (await request.json()) as { url: string; scope: string };
    kb.calls.push(`url ${url} ${scope}`);
    const row = sourceRow({
      id: `s${++kb.seq}`, product_id: String(params.pid), name: url.replace(/^https:\/\//, ""), kind: "url", url, scope, byte_size: null,
      status: "processing", stage: "upload", passage_count: 0, attempts: 0, processed_at: null,
    });
    return HttpResponse.json(put(row), { status: 202 });
  }),
  http.get(`${P}/:pid/knowledge/sources/:sid/passages`, ({ params }) => {
    const s = find(String(params.sid));
    if (!s) return notFound();
    return HttpResponse.json([
      { id: "pa1", ordinal: 0, loc: "p. 1", text: "Sensors report every five minutes." },
      { id: "pa2", ordinal: 1, loc: null, text: "Alerts go to the on-call phone." },
    ]);
  }),
  http.get(`${P}/:pid/knowledge/sources/:sid`, ({ params }) => { const s = find(String(params.sid)); return s ? HttpResponse.json(s) : notFound(); }),
  http.delete(`${P}/:pid/knowledge/sources/:sid`, ({ params }) => {
    const s = find(String(params.sid));
    if (!s) return notFound();
    kb.calls.push(`delete ${s.id}`);
    return HttpResponse.json(put({ ...s, deleted_at: new Date().toISOString() }));
  }),
  http.post(`${P}/:pid/knowledge/sources/:sid/restore`, ({ params }) => {
    const s = find(String(params.sid));
    if (!s) return notFound();
    kb.calls.push(`restore ${s.id}`);
    return HttpResponse.json(put({ ...s, deleted_at: null }));
  }),
  http.post(`${P}/:pid/knowledge/sources/:sid/reread`, ({ params }) => {
    const s = find(String(params.sid));
    if (!s) return notFound();
    kb.calls.push(`reread ${s.id}`);
    return HttpResponse.json(put({ ...s, status: "processing", stage: s.kind === "url" ? "upload" : "scan", stage_pct: 0, attempts: 0 }), { status: 202 });
  }),
  http.post(`${P}/:pid/knowledge/search`, async ({ request }) => {
    const { query } = (await request.json()) as { query: string };
    return HttpResponse.json([{ passage_id: "pa1", source_id: "s1", source_name: "Spec.pdf", source_kind: "pdf", loc: "p. 1", text: `… ${query} …`, score: 0.9 }]);
  }),
];
