/**
 * An in-memory lead CRM (PR #71 contract) for MSW: companies with a primary person and a fit,
 * rule filtering, sorting and cursor pages, bulk actions, merge, unsubscribe, segments with
 * preview and members, and CSV imports that advance on each poll. Tests seed `leads` or override
 * single routes with server.use; `leads.calls` records "METHOD path" plus the JSON body.
 */
import { http, HttpResponse } from "msw";
import { API } from "./msw";

type Json = Record<string, unknown>;
export type PersonRow = Json & { id: string; company_id: string; email: string | null; email_status: string; is_primary: boolean; unsubscribed_at: string | null };
export type CompanyRow = Json & { id: string; name: string; domain: string | null; reply_status: string; source: string; created_at: string };
export type SegmentRow = { id: string; name: string; rules: Json[]; match: "all" | "any"; pins: string[]; created_at: string };
const T0 = "2026-09-30T06:00:00Z";

export function personRow(over: Partial<PersonRow> & { id: string; company_id: string }): PersonRow {
  return {
    email: `${over.id}@example.test`, first_name: "Wanjiru", last_name: "Mwangi", title: "Head of Supply Chain", phone: null, linkedin_url: null,
    email_status: "verified", is_primary: true, unsubscribed_at: null, created_at: T0, updated_at: T0, ...over,
  };
}
export function companyRow(over: Partial<CompanyRow> & { id: string; name: string }): CompanyRow {
  return {
    domain: `${over.id}.co.ke`, country: "Kenya", size: "51-200", industry: "Dairy", notes: null, source: "search", reply_status: "not_contacted",
    reply_status_set_by: "corral", last_activity_at: null, import_id: null, created_at: T0, updated_at: T0, ...over,
  };
}

export type LeadsMock = {
  companies: CompanyRow[]; people: PersonRow[]; fits: Record<string, number>; segments: SegmentRow[];
  imports: Json[]; importPolls: number; seq: number; calls: { op: string; body?: unknown }[];
};
export const leads: LeadsMock = { companies: [], people: [], fits: {}, segments: [], imports: [], importPolls: 2, seq: 0, calls: [] };

/** Three companies (Kilima 94, Pwani 91, Savanna unscored) and one segment, unless seeded. */
export function resetLeads(seed: Partial<Pick<LeadsMock, "companies" | "people" | "fits" | "segments" | "importPolls">> = {}) {
  leads.companies = seed.companies ?? [
    companyRow({ id: "c1", name: "Kilima Dairies", domain: "kilima.co.ke", reply_status: "interested", last_activity_at: "2026-09-30T04:00:00Z", created_at: "2026-09-01T06:00:00Z" }),
    companyRow({ id: "c2", name: "Pwani Fresh", domain: "pwanifresh.com", industry: "Seafood", reply_status: "objection", created_at: "2026-09-02T06:00:00Z" }),
    companyRow({ id: "c3", name: "Savanna Juice Co.", domain: "savannajuice.africa", industry: "Beverages", source: "import", created_at: "2026-09-03T06:00:00Z" }),
  ];
  leads.people = seed.people ?? [
    personRow({ id: "l1", company_id: "c1", email: "wanjiru@kilima.co.ke" }),
    personRow({ id: "l2", company_id: "c2", email: "brian@pwanifresh.com", first_name: "Brian", last_name: "Kamau", title: "COO" }),
    personRow({ id: "l3", company_id: "c3", email: "amara@savannajuice.africa", first_name: "Amara", last_name: "Nwosu", title: "Ops Director", email_status: "catch_all" }),
  ];
  leads.fits = seed.fits ?? { c1: 94, c2: 91 };
  leads.segments = seed.segments ?? [{ id: "s1", name: "Kenya dairy", rules: [{ field: "industry", op: "is", value: ["Dairy"] }], match: "all", pins: [], created_at: T0 }];
  leads.imports = []; leads.importPolls = seed.importPolls ?? 2; leads.seq = 0; leads.calls = [];
}

/* ------------------------------------------------------------ rules and rows */
const primaryOf = (c: CompanyRow) => leads.people.find((p) => p.company_id === c.id && p.is_primary) ?? null;
const fitOf = (c: CompanyRow) => (c.id in leads.fits ? leads.fits[c.id] : null);
function ruleHit(c: CompanyRow, r: Json): boolean {
  const field = r.field as string, op = r.op as string, value = r.value;
  if (field === "fit") { const f = fitOf(c); return f !== null && (op === "gte" ? f >= Number(value) : f <= Number(value)); }
  if (field === "title") return String(primaryOf(c)?.title ?? "").toLowerCase().includes(String(value).toLowerCase());
  const got = field === "email" ? primaryOf(c)?.email_status : field === "reply" ? c.reply_status : (c[field] as string | null);
  const list = (value as string[]).map((v) => v.toLowerCase());
  const hit = got != null && list.includes(String(got).toLowerCase());
  return op === "is" ? hit : !hit;
}
const matches = (c: CompanyRow, rules: Json[], match: string, empty: boolean) =>
  !rules.length ? empty : match === "any" ? rules.some((r) => ruleHit(c, r)) : rules.every((r) => ruleHit(c, r));
const inSegment = (s: SegmentRow, c: CompanyRow) => s.pins.includes(c.id) || matches(c, s.rules, s.match, false);

export const companyOut = (c: CompanyRow) => { const p = primaryOf(c); return { ...c, fit: fitOf(c), primary: p }; };
const detailOut = (c: CompanyRow) => ({ ...companyOut(c), people: leads.people.filter((p) => p.company_id === c.id), fits: c.id in leads.fits ? [{ product_id: "p1", score: leads.fits[c.id] }] : [] });
const segmentOut = (s: SegmentRow) => ({ id: s.id, name: s.name, match: s.match, created_at: s.created_at, updated_at: s.created_at });
const segmentDetail = (s: SegmentRow) => ({ ...segmentOut(s), rules: s.rules, pinned: s.pins.length, count: leads.companies.filter((c) => inSegment(s, c)).length });

function page(rows: CompanyRow[], body: Json) {
  const rules = (body.rules as Json[]) ?? [], match = (body.match as string) ?? "all";
  const sort = (body.sort as { key: string; dir: string }) ?? { key: "created", dir: "desc" };
  const hits = rows.filter((c) => matches(c, rules, match, true));
  const key = (c: CompanyRow): string | number => sort.key === "company" ? c.name.toLowerCase() : sort.key === "fit" ? fitOf(c) ?? -1 : sort.key === "reply" ? c.reply_status : c.created_at;
  hits.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === "asc" ? 1 : -1) || a.id.localeCompare(b.id); });
  const start = body.cursor ? Number(body.cursor) : 0, limit = Number(body.limit ?? 50);
  const data = hits.slice(start, start + limit).map(companyOut);
  const next = start + limit < hits.length ? String(start + limit) : null;
  return { data, next_cursor: next, has_more: next !== null, total: hits.length };
}
function select(sel: Json): CompanyRow[] {
  if (Array.isArray(sel.ids)) return leads.companies.filter((c) => (sel.ids as string[]).includes(c.id));
  return leads.companies.filter((c) => matches(c, (sel.rules as Json[]) ?? [], (sel.match as string) ?? "all", true));
}
const notFound = () => HttpResponse.json({ error: "not_found", detail: "Not found." }, { status: 404 });
const log = (op: string, body?: unknown) => { leads.calls.push({ op, body }); };
const C = `${API}/api/v1/companies`, S = `${API}/api/v1/segments`, L = `${API}/api/v1/leads`, I = `${API}/api/v1/lead-imports`;

function importRow(over: Json): Json {
  return {
    id: `i${++leads.seq}`, filename: "list.csv", byte_size: 100, policy: "skip", status: "queued", progress_pct: 0, total_rows: 2,
    created_count: 0, updated_count: 0, skipped_count: 0, error_count: 0, in_file_duplicates: 0, existing_duplicates: 0, people_created: 0,
    failure: null, note: null, has_errors_file: false, finished_at: null, created_at: T0, updated_at: T0, ...over,
  };
}

export const leadsHandlers = [
  http.post(`${C}/query`, async ({ request }) => { const b = (await request.json()) as Json; log("POST /companies/query", b); return HttpResponse.json(page(leads.companies, b)); }),
  http.post(`${C}/bulk`, async ({ request }) => {
    const b = (await request.json()) as Json; log("POST /companies/bulk", b);
    const rows = select(b.selection as Json);
    if (b.action === "set_reply_status") {
      const locked = rows.filter((c) => c.reply_status === "unsubscribed");
      for (const c of rows) if (c.reply_status !== "unsubscribed") { c.reply_status = b.reply_status as string; c.reply_status_set_by = "user"; }
      return HttpResponse.json({ matched: rows.length, changed: rows.length - locked.length, skipped: locked.length ? [{ reason: "unsubscribed", n: locked.length }] : [] });
    }
    if (b.action === "add_to_segment") {
      const s = leads.segments.find((x) => x.id === b.segment_id); if (!s) return notFound();
      const fresh = rows.filter((c) => !s.pins.includes(c.id)); s.pins.push(...fresh.map((c) => c.id));
      return HttpResponse.json({ matched: rows.length, changed: fresh.length, skipped: [] });
    }
    leads.companies = leads.companies.filter((c) => !rows.includes(c));
    return HttpResponse.json({ matched: rows.length, changed: rows.length, skipped: [] });
  }),
  http.post(`${C}/enroll-plan`, async ({ request }) => {
    const b = (await request.json()) as Json; log("POST /companies/enroll-plan", b);
    const rows = select(b.selection as Json);
    const unsub = rows.filter((c) => c.reply_status === "unsubscribed").length;
    const noMail = rows.filter((c) => c.reply_status !== "unsubscribed" && primaryOf(c)?.email_status !== "verified").length;
    const will = rows.length - unsub - noMail;
    return HttpResponse.json({ matched: rows.length, will_enroll: will, skipped: [...(unsub ? [{ reason: "unsubscribed", n: unsub }] : []), ...(noMail ? [{ reason: "no_verified_email", n: noMail }] : [])], sends_per_day: 210, days: Math.ceil(will / 210) });
  }),
  http.get(`${C}/:id`, ({ params }) => { const c = leads.companies.find((x) => x.id === params.id); return c ? HttpResponse.json(detailOut(c)) : notFound(); }),
  http.patch(`${C}/:id`, async ({ params, request }) => {
    const b = (await request.json()) as Json; log(`PATCH /companies/${params.id}`, b);
    const c = leads.companies.find((x) => x.id === params.id); if (!c) return notFound();
    Object.assign(c, b); return HttpResponse.json(detailOut(c));
  }),
  http.post(`${C}/:id/merge`, async ({ params, request }) => {
    const b = (await request.json()) as Json; log(`POST /companies/${params.id}/merge`, b);
    const keep = leads.companies.find((x) => x.id === params.id), dup = leads.companies.find((x) => x.id === b.duplicate_id);
    if (!keep || !dup) return notFound();
    for (const k of ["domain", "country", "size", "industry", "notes"]) if (keep[k] == null) keep[k] = dup[k];
    for (const p of leads.people) if (p.company_id === dup.id) { p.company_id = keep.id; p.is_primary = false; }
    leads.companies = leads.companies.filter((x) => x.id !== dup.id);
    return HttpResponse.json(detailOut(keep));
  }),
  http.patch(`${L}/:id`, async ({ params, request }) => {
    const b = (await request.json()) as Json; log(`PATCH /leads/${params.id}`, b);
    const p = leads.people.find((x) => x.id === params.id); if (!p) return notFound();
    Object.assign(p, b); return HttpResponse.json({ ...p, company_name: null });
  }),
  http.post(`${L}/:id/unsubscribe`, ({ params }) => {
    log(`POST /leads/${params.id}/unsubscribe`);
    const p = leads.people.find((x) => x.id === params.id); if (!p) return notFound();
    p.unsubscribed_at = T0;
    const c = leads.companies.find((x) => x.id === p.company_id); if (c) c.reply_status = "unsubscribed";
    return HttpResponse.json({ ...p, company_name: null });
  }),
  http.get(S, () => HttpResponse.json([...leads.segments].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(segmentOut))),
  http.post(`${S}/preview`, async ({ request }) => {
    const b = (await request.json()) as Json; log("POST /segments/preview", b);
    const hits = leads.companies.filter((c) => matches(c, b.rules as Json[], b.match as string, false));
    return HttpResponse.json({ count: hits.length, peek: hits.slice(0, 5).map((c) => ({ ...companyOut(c), fit: null, primary: null })) });
  }),
  http.post(S, async ({ request }) => {
    const b = (await request.json()) as Json; log("POST /segments", b);
    if (leads.segments.some((s) => s.name === b.name)) return HttpResponse.json({ error: "duplicate", detail: "A segment with this name already exists." }, { status: 409 });
    const fromImport = b.from_import_id ? leads.companies.filter((c) => c.import_id === b.from_import_id).map((c) => c.id) : [];
    const s: SegmentRow = { id: `s${++leads.seq}`, name: b.name as string, rules: (b.rules as Json[]) ?? [], match: (b.match as "all" | "any") ?? "all", pins: [...((b.company_ids as string[]) ?? []), ...fromImport], created_at: new Date(Date.parse(T0) + leads.seq * 1000).toISOString() };
    leads.segments.push(s); return HttpResponse.json(segmentDetail(s), { status: 201 });
  }),
  http.get(`${S}/:id`, ({ params }) => { const s = leads.segments.find((x) => x.id === params.id); return s ? HttpResponse.json(segmentDetail(s)) : notFound(); }),
  http.patch(`${S}/:id`, async ({ params, request }) => {
    const b = (await request.json()) as Json; log(`PATCH /segments/${params.id}`, b);
    const s = leads.segments.find((x) => x.id === params.id); if (!s) return notFound();
    Object.assign(s, b); return HttpResponse.json(segmentDetail(s));
  }),
  http.post(`${S}/:id/companies`, async ({ params, request }) => {
    const b = (await request.json()) as Json; log(`POST /segments/${params.id}/companies`, b);
    const s = leads.segments.find((x) => x.id === params.id); if (!s) return notFound();
    return HttpResponse.json(page(leads.companies.filter((c) => inSegment(s, c)), b));
  }),
  http.post(I, async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file") as File, mapping = JSON.parse(String(form.get("mapping"))) as string[], policy = String(form.get("policy") ?? "skip");
    const dry = form.get("dry_run") === "true";
    log(dry ? "POST /lead-imports (dry run)" : "POST /lead-imports", { name: file.name, mapping, policy });
    const rows = (await file.text()).trim().split("\n").length - 1;
    if (dry) return HttpResponse.json({ plan: { total: rows, create: rows - 1, update: policy === "skip" ? 0 : 1, skipped: policy === "skip" ? 1 : 0, errors: 0, in_file: 0, existing: 1 }, headers: [], errors: [] });
    const row = importRow({ filename: file.name, policy, total_rows: rows });
    leads.imports.push(row);
    return HttpResponse.json(row, { status: 202 });
  }),
  http.get(`${I}/:id`, ({ params }) => {
    const row = leads.imports.find((x) => x.id === params.id); if (!row) return notFound();
    const n = ((row.polls as number | undefined) ?? 0) + 1; row.polls = n;
    if (n >= leads.importPolls) Object.assign(row, { status: "done", progress_pct: 100, created_count: Number(row.total_rows) - 1, updated_count: 0, skipped_count: 1, error_count: 1, has_errors_file: true, finished_at: T0 });
    else Object.assign(row, { status: "running", progress_pct: Math.round((100 * n) / leads.importPolls) });
    const { polls: _p, ...out } = row; void _p;
    return HttpResponse.json(out);
  }),
];
