// A stand-in for the Corral API auth endpoints (PR #2), so e2e runs without WorkOS or Postgres.
// It mirrors the real contract: cookie names, 303 redirects, status codes and JSON shapes.
// Control: POST /__mock/scenario {"deny": true} makes the next AuthKit round trip fail, {"down": true}
// makes /me answer 503 (API unreachable), {"sendLimited": 41} makes code sends answer 429 with Retry-After: 41;
// email codes (Magic Auth, eng-61b-magic-auth): 123456 signs in, 111111 has expired, 222222 is a verify 429
// (Retry-After: 42), 333333 is refused (auth_failed), 444444 is locked (too_many_attempts), 555555 is a 503 from the auth provider, anything else is wrong,
// and a 4th send for one address inside a minute is rate-limited, as WorkOS does;
// GET /__mock/calls lists requests seen; POST /__mock/reset clears both.
// Knowledge base (PR #67 contract, signed in only): one product with three sources; a new or re-read source
// is processing for ~3s (scan → parse → chunk → embed), then ready. Scenarios: {"kbDown": true} makes
// /products answer 503, {"kbEmpty": true} starts with no product, {"kbSlow": true} keeps new sources
// processing until the next reset, {"deleteFails": true} makes removing a source a 503.
// Lead CRM (PR #71 contract, signed in only): six companies (one a probable duplicate), their people, fits for p1 and one
// segment; POST /companies/query filters, sorts and pages; bulk, merge, unsubscribe, segments and CSV imports (an import
// runs for ~2s of polls). {"leadsDown": true} makes /companies/query answer 503, {"leadsEmpty": true} starts with none.
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3100";
const SELF = `http://localhost:${PORT}`;

const ME = {
  user: { id: "0b6b4c1e-1111-4a53-9c1e-2d3f5a7b9c01", email: "wanjiru@kilima.co.ke", first_name: "Wanjiru", last_name: "Mwangi", profile_picture_url: null },
  organization: { id: "5f2a0c8e-2222-4b1d-8e3f-6a7b8c9d0e12", name: "Kilima Dairies", slug: "kilima" },
  role: "owner",
};

const FRESH = { deny: false, down: false, sendLimited: 0, kbDown: false, kbEmpty: false, kbSlow: false, deleteFails: false, leadsDown: false, leadsEmpty: false, activity: false };
let scenario = { ...FRESH };
let sends = new Map();
let calls = [];
let n = 0;

const cookies = (req) => Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, v.join("=")]));
const cors = (req, res) => {
  if (req.headers.origin === FRONTEND) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Expose-Headers", "Retry-After");
  }
};
const json = (res, status, body, extra = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...extra }); res.end(JSON.stringify(body)); };
const redirect = (res, to, setCookie = []) => { res.writeHead(303, { Location: to, "Set-Cookie": setCookie }); res.end(); };
const readJson = (req) => new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clearSession = "wos_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
const signedIn = (req) => (cookies(req).wos_session ?? "").startsWith("sealed-");

/* ------------------------------------------------------------ knowledge base */
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const STAGES = ["scan", "parse", "chunk", "embed"];
const READ_MS = 3_000;
let kb = { products: [], sources: [], seq: 0 };
const sourceRow = (over) => ({
  product_id: "p1", kind: "pdf", url: null, scope: null, byte_size: 2_400_000, status: "ready", stage: null, stage_pct: 0, progress: null,
  failure: null, failure_stage: null, pages_total: 12, pages_read: 12, skipped: null, skipped_reason: null, note: null, passage_count: 40,
  attempts: 1, added_by_user_id: ME.user.id, created_at: iso(Date.now() - 86_400_000), updated_at: iso(Date.now() - 3_600_000),
  processed_at: iso(Date.now() - 3_600_000), deleted_at: null, ...over,
});
function resetKb() {
  const t = Date.now();
  kb = {
    seq: 0,
    products: scenario.kbEmpty ? [] : [{ id: "p1", name: "Kilima milk sensors", description: null, created_at: iso(t - 7 * 86_400_000), updated_at: iso(t - 7 * 86_400_000) }],
    sources: scenario.kbEmpty ? [] : [
      sourceRow({ id: "s1", name: "Cold-room SOP.pdf" }),
      sourceRow({ id: "s2", name: "Pricing 2026.docx", kind: "docx", status: "failed", failure: "unreadable", failure_stage: "parse", pages_total: null, pages_read: null, passage_count: 0 }),
      sourceRow({ id: "s3", name: "kilima.co.ke/faq", kind: "url", url: "https://kilima.co.ke/faq", scope: "section", byte_size: null, status: "partial",
        pages_total: 9, pages_read: 7, skipped: "/faq/old, /faq/print", skipped_reason: "unreadable", note: "2 pages didn’t load", passage_count: 18 }),
      // M10c/M11: the server's skipped_reason and attempts reach Bau's partial-mixed and "tried n times" states.
      sourceRow({ id: "s4", name: "Install guide 2025.pdf", byte_size: 18_000_000, status: "partial", pages_total: 240, pages_read: 180,
        skipped: "pp. 181–240", skipped_reason: "mixed", note: null, passage_count: 310 }),
      sourceRow({ id: "s5", name: "Warranty terms.pdf", status: "failed", failure: "interrupted", failure_stage: "embed", attempts: 3,
        pages_total: 8, pages_read: null, passage_count: 0 }),
    ],
  };
}
/** Where a processing source is by now: ~3s through the stages, then ready (unless kbSlow). */
function advanced(s) {
  if (s.status !== "processing" || scenario.kbSlow) return s;
  const ms = Date.now() - Date.parse(s.updated_at);
  if (ms >= READ_MS) return { ...s, status: "ready", stage: null, stage_pct: 0, attempts: 1, passage_count: 12, processed_at: iso() };
  const f = (ms / READ_MS) * STAGES.length;
  return { ...s, stage: STAGES[Math.floor(f)], stage_pct: Math.round((f % 1) * 100), attempts: 1 };
}
const putSource = (row) => { kb.sources = [row, ...kb.sources.filter((x) => x.id !== row.id)]; return row; };
const readBody = (req) => new Promise((resolve) => { const parts = []; req.on("data", (c) => parts.push(c)); req.on("end", () => resolve(Buffer.concat(parts))); });
/** Just enough multipart parsing for one file and one text field. */
function multipart(req, buf) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(req.headers["content-type"] ?? "");
  const out = {};
  if (!boundary) return out;
  for (const part of buf.toString("latin1").split(`--${boundary[1] ?? boundary[2]}`)) {
    const head = /name="([^"]+)"(?:; filename="([^"]*)")?/.exec(part);
    if (!head) continue;
    const body = part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
    out[head[1]] = head[2] === undefined ? body : { filename: head[2], size: body.length, text: body };
  }
  return out;
}
const KB_ROUTE = /^\/api\/v1\/products(?:\/([^/]+)\/knowledge\/(sources|search)(?:\/(files|urls|[^/]+))?(?:\/(passages|restore|reread))?)?$/;

function kbRoute(req, res, path, url) {
  const m = KB_ROUTE.exec(path);
  if (!m) return false;
  if (!signedIn(req)) { json(res, 401, { detail: "Not signed in" }); return true; }
  const [, pid, area, sub, action] = m;
  const method = req.method;
  if (!pid) {
    if (scenario.kbDown) { json(res, 503, { detail: "Service Unavailable" }); return true; }
    if (method === "GET") { json(res, 200, kb.products); return true; }
    if (method === "POST") {
      readJson(req).then(({ name }) => {
        const p = { id: `p${kb.products.length + 1}`, name, description: null, created_at: iso(), updated_at: iso() };
        kb.products.push(p); json(res, 201, p);
      });
      return true;
    }
  }
  if (!kb.products.some((p) => p.id === pid)) { json(res, 404, { error: "not_found", detail: "No such product." }); return true; }
  if (area === "search") { readJson(req).then(() => json(res, 200, [])); return true; }
  kb.sources = kb.sources.map(advanced);
  if (!sub && method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? 50), offset = Number(url.searchParams.get("offset") ?? 0);
    json(res, 200, kb.sources.filter((s) => s.product_id === pid && !s.deleted_at).slice(offset, offset + limit)); return true;
  }
  if (sub === "files" && method === "POST") {
    readBody(req).then((buf) => {
      const form = multipart(req, buf);
      const file = form.file;
      if (!file || typeof file === "string") return json(res, 422, { error: "no_file", detail: "No file." });
      const replace = typeof form.replace_source_id === "string" ? form.replace_source_id : undefined;
      if (file.size === 0) return json(res, 422, { error: "empty", detail: "The file is empty." });
      const dup = kb.sources.find((s) => s.name === file.filename && !s.deleted_at && s.id !== replace);
      if (dup) return json(res, 409, { error: "duplicate", detail: "That file is already in the knowledge base.", existing_source_id: dup.id });
      const ext = file.filename.split(".").pop().toLowerCase();
      json(res, 202, putSource(sourceRow({
        id: replace ?? `n${++kb.seq}`, product_id: pid, name: file.filename, kind: ext === "docx" ? "docx" : ext === "md" ? "md" : "pdf", byte_size: file.size,
        pages_total: ext === "md" ? null : 3, pages_read: null, status: "processing", stage: null, stage_pct: 0, attempts: 0, passage_count: 0,
        created_at: iso(), updated_at: iso(), processed_at: null,
      })));
    });
    return true;
  }
  if (sub === "urls" && method === "POST") {
    readJson(req).then(({ url: u, scope }) => {
      json(res, 202, putSource(sourceRow({ id: `n${++kb.seq}`, product_id: pid, name: u.replace(/^https?:\/\//, ""), kind: "url", url: u, scope, byte_size: null,
        pages_total: null, pages_read: null, status: "processing", stage: null, attempts: 0, passage_count: 0, created_at: iso(), updated_at: iso(), processed_at: null })));
    });
    return true;
  }
  const s = kb.sources.find((x) => x.id === sub && x.product_id === pid);
  if (!s) { json(res, 404, { error: "not_found", detail: "No such source." }); return true; }
  if (!action && method === "GET") { json(res, 200, s); return true; }
  if (!action && method === "DELETE") {
    if (scenario.deleteFails) { json(res, 503, { detail: "Service Unavailable" }); return true; }
    json(res, 200, putSource({ ...s, deleted_at: iso() })); return true;
  }
  if (action === "restore" && method === "POST") { json(res, 200, putSource({ ...s, deleted_at: null })); return true; }
  if (action === "reread" && method === "POST") {
    json(res, 202, putSource({ ...s, status: "processing", stage: null, stage_pct: 0, failure: null, failure_stage: null, attempts: 0, updated_at: iso() })); return true;
  }
  if (action === "passages" && method === "GET") {
    json(res, 200, [
      { id: `${s.id}-1`, ordinal: 0, loc: "p. 1", text: "Cold rooms hold 2–4 °C; sensors report every five minutes." },
      { id: `${s.id}-2`, ordinal: 1, loc: "p. 2", text: "An alert goes to the on-call phone after ten minutes above 6 °C." },
    ]);
    return true;
  }
  json(res, 405, { detail: "Method Not Allowed" });
  return true;
}

/* ------------------------------------------------------------ lead CRM */
let crm = { companies: [], people: [], fits: {}, segments: [], imports: [], seq: 0 };
const company = (over) => ({ domain: `${over.id}.co.ke`, country: "Kenya", size: "51-200", industry: "Dairy", notes: null, source: "search", reply_status: "not_contacted",
  reply_status_set_by: "corral", last_activity_at: null, import_id: null, created_at: iso(Date.now() - 20 * 86_400_000), updated_at: iso(Date.now() - 86_400_000), ...over });
const person = (over) => ({ email: null, first_name: null, last_name: null, title: null, phone: null, linkedin_url: null, email_status: "verified", is_primary: true,
  unsubscribed_at: null, created_at: iso(Date.now() - 20 * 86_400_000), updated_at: iso(Date.now() - 86_400_000), ...over });
function resetCrm() {
  const day = (d) => iso(Date.now() - d * 86_400_000);
  crm = { seq: 0, imports: [], companies: [], people: [], fits: {}, segments: [] };
  if (scenario.leadsEmpty) return;
  crm.companies = [
    company({ id: "c1", name: "Kilima Dairies", domain: "kilima.co.ke", size: "201-1000", reply_status: "interested", last_activity_at: iso(Date.now() - 2 * 3_600_000), created_at: day(30), notes: "Board meeting in November." }),
    company({ id: "c2", name: "Pwani Fresh", domain: "pwanifresh.com", industry: "Seafood", reply_status: "objection", last_activity_at: day(1), created_at: day(29) }),
    company({ id: "c3", name: "Savanna Juice Co.", domain: "savannajuice.africa", industry: "Beverages", source: "import", created_at: day(28) }),
    company({ id: "c4", name: "Tamu Bakeries", domain: "tamu.ug", country: "Uganda", industry: "Bakery", reply_status: "contacted", last_activity_at: day(3), created_at: day(27) }),
    company({ id: "c5", name: "Mara Cold Stores", domain: "maracold.com", industry: "Cold storage", source: "manual", created_at: day(26) }),
    company({ id: "c6", name: "Kilima Dairies Ltd", domain: null, source: "import", created_at: day(1), import_id: "i0" }),
  ];
  crm.people = [
    person({ id: "l1", company_id: "c1", email: "wanjiru@kilima.co.ke", first_name: "Wanjiru", last_name: "Mwangi", title: "Head of Supply Chain" }),
    person({ id: "l1b", company_id: "c1", email: "joseph@kilima.co.ke", first_name: "Joseph", last_name: "Kariuki", title: "Plant Manager, Nakuru", is_primary: false, email_status: "catch_all" }),
    person({ id: "l2", company_id: "c2", email: "brian@pwanifresh.com", first_name: "Brian", last_name: "Kamau", title: "COO" }),
    person({ id: "l3", company_id: "c3", email: "amara@savannajuice.africa", first_name: "Amara", last_name: "Nwosu", title: "Ops Director", email_status: "catch_all" }),
    person({ id: "l4", company_id: "c4", email: "reza@tamu.ug", first_name: "Reza", last_name: "Santos", title: "Plant Manager", email_status: "unverified" }),
    person({ id: "l6", company_id: "c6", email: "wanjiru.m@kilima.co.ke", first_name: "Wanjiru", last_name: "M.", title: "Supply Chain", email_status: "unverified" }),
  ];
  crm.fits = { c1: 94, c2: 91, c3: 88, c4: 72, c6: 85 };
  crm.segments = [{ id: "sg1", name: "Kenya dairy", rules: [{ field: "industry", op: "is", value: ["Dairy"] }, { field: "country", op: "is", value: ["Kenya"] }], match: "all", pins: [], created_at: day(10) }];
}
const primaryOf = (c) => crm.people.find((p) => p.company_id === c.id && p.is_primary) ?? null;
const fitOf = (c) => (c.id in crm.fits ? crm.fits[c.id] : null);
function ruleHit(c, r) {
  if (r.field === "fit") { const f = fitOf(c); return f !== null && (r.op === "gte" ? f >= r.value : f <= r.value); }
  if (r.field === "title") return String(primaryOf(c)?.title ?? "").toLowerCase().includes(String(r.value).toLowerCase());
  const got = r.field === "email" ? primaryOf(c)?.email_status : r.field === "reply" ? c.reply_status : c[r.field];
  const hit = got != null && r.value.map((v) => v.toLowerCase()).includes(String(got).toLowerCase());
  return r.op === "is" ? hit : !hit;
}
const matches = (c, rules = [], match = "all", empty = true) => (!rules.length ? empty : match === "any" ? rules.some((r) => ruleHit(c, r)) : rules.every((r) => ruleHit(c, r)));
const inSegment = (s, c) => s.pins.includes(c.id) || matches(c, s.rules, s.match, false);
const companyOut = (c) => ({ ...c, fit: fitOf(c), primary: primaryOf(c) });
const detailOut = (c) => ({ ...companyOut(c), people: crm.people.filter((p) => p.company_id === c.id), fits: c.id in crm.fits ? [{ product_id: "p1", score: crm.fits[c.id] }] : [] });
const segmentOut = (s) => ({ id: s.id, name: s.name, match: s.match, created_at: s.created_at, updated_at: s.created_at });
const segmentDetail = (s) => ({ ...segmentOut(s), rules: s.rules, pinned: s.pins.length, count: crm.companies.filter((c) => inSegment(s, c)).length });
const REPLY_ORDER = ["meeting_booked", "interested", "objection", "referral", "ooo", "contacted", "not_contacted", "not_interested", "unsubscribed"];
function pageOf(rows, b) {
  const sort = b.sort ?? { key: "created", dir: "desc" };
  const hits = rows.filter((c) => matches(c, b.rules, b.match, true));
  const key = (c) => sort.key === "company" ? c.name.toLowerCase() : sort.key === "fit" ? fitOf(c) ?? -1 : sort.key === "reply" ? REPLY_ORDER.indexOf(c.reply_status)
    : sort.key === "person" ? [primaryOf(c)?.first_name, primaryOf(c)?.last_name].join(" ").toLowerCase() : c.created_at;
  hits.sort((a, z) => { const x = key(a), y = key(z); return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === "asc" ? 1 : -1) || a.id.localeCompare(z.id); });
  const start = b.cursor ? Number(b.cursor) : 0, limit = Math.min(200, b.limit ?? 50);
  const next = start + limit < hits.length ? String(start + limit) : null;
  return { data: hits.slice(start, start + limit).map(companyOut), next_cursor: next, has_more: next !== null, total: hits.length };
}
const selected = (sel) => (Array.isArray(sel?.ids) ? crm.companies.filter((c) => sel.ids.includes(c.id)) : crm.companies.filter((c) => matches(c, sel?.rules, sel?.match, true)));
const LEADS_ROUTE = /^\/api\/v1\/(companies|segments|leads|lead-imports)(?:\/([^/]+))?(?:\/([^/]+))?$/;
const IMPORT_MS = 2_000;
function importNow(row) {
  const ms = Date.now() - Date.parse(row.created_at);
  if (ms >= IMPORT_MS) {
    if (row.status !== "done") {
      row.status = "done"; row.progress_pct = 100; row.finished_at = iso();
      for (const [i, name] of row.names.entries()) {
        const id = `ci${++crm.seq}`;
        crm.companies.push(company({ id, name, domain: null, source: "import", import_id: row.id, created_at: iso() }));
        if (i === 0) crm.fits[id] = 82;
      }
      row.created_count = row.names.length;
    }
  } else { row.status = "running"; row.progress_pct = Math.round((ms / IMPORT_MS) * 100); }
  const { names: _n, ...out } = row; void _n;
  return out;
}

function leadsRoute(req, res, path) {
  const m = LEADS_ROUTE.exec(path);
  if (!m) return false;
  if (!signedIn(req)) { json(res, 401, { detail: "Session invalid or expired" }); return true; }
  const [, kind, id, action] = m;
  const method = req.method;
  const write = method !== "GET" && !(kind === "companies" && id === "query") && !(action === "companies") && !(id === "preview") && !(id === "enroll-plan");
  if (write && req.headers.origin !== FRONTEND) { json(res, 403, { detail: "Origin not allowed" }); return true; }
  const nf = () => json(res, 404, { error: "not_found", detail: "Not found." });
  if (kind === "leads" && !id && method === "GET") {
    const people = scenario.activity ? [{ id: "p1", email: "grace@nyota.co.tz", first_name: "Grace", last_name: "Holloway", company_name: "Nyota Beverages", company_id: null, title: "VP Operations", phone: null, linkedin_url: null, email_status: "verified", is_primary: true, unsubscribed_at: null, source: "manual", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }] : [];
    json(res, 200, people);
    return true;
  }
  if (kind === "lead-imports") {
    if (method === "POST" && !id) {
      readBody(req).then((buf) => {
        const f = multipart(req, buf);
        const lines = String(f.file?.text ?? "").trim().split(/\r?\n/).slice(1).filter(Boolean);
        const mapping = JSON.parse(f.mapping ?? "[]"), col = mapping.indexOf("company");
        const names = lines.map((l) => l.split(",")[Math.max(0, col)]?.trim()).filter(Boolean);
        const known = names.filter((n) => crm.companies.some((c) => c.name.toLowerCase() === n.toLowerCase()));
        const fresh = names.filter((n) => !known.includes(n));
        if (f.dry_run === "true") {
          const update = f.policy === "skip" ? 0 : known.length;
          return json(res, 200, { plan: { total: names.length, create: fresh.length, update, skipped: known.length - update, errors: 0, in_file: 0, existing: known.length }, headers: [], errors: [] });
        }
        const row = { id: `i${++crm.seq}`, filename: f.file?.filename ?? "import.csv", byte_size: f.file?.size ?? 0, policy: f.policy ?? "skip", status: "queued", progress_pct: 0,
          total_rows: names.length, created_count: 0, updated_count: 0, skipped_count: known.length, error_count: 0, in_file_duplicates: 0, existing_duplicates: known.length,
          people_created: 0, failure: null, note: null, has_errors_file: false, finished_at: null, created_at: iso(), updated_at: iso(), names: fresh };
        crm.imports.push(row);
        json(res, 202, importNow(row));
      });
      return true;
    }
    const row = crm.imports.find((x) => x.id === id);
    if (method === "GET" && row) { json(res, 200, importNow(row)); return true; }
    nf(); return true;
  }
  readJson(req).then((b) => {
    if (kind === "companies") {
      if (id === "query" && method === "POST") return scenario.leadsDown ? json(res, 503, { detail: "Service Unavailable" }) : json(res, 200, pageOf(crm.companies, b));
      if (id === "bulk" && method === "POST") {
        const rows = selected(b.selection);
        if (b.action === "set_reply_status") {
          const locked = rows.filter((c) => c.reply_status === "unsubscribed");
          for (const c of rows) if (c.reply_status !== "unsubscribed") { c.reply_status = b.reply_status; c.reply_status_set_by = "user"; }
          return json(res, 200, { matched: rows.length, changed: rows.length - locked.length, skipped: locked.length ? [{ reason: "unsubscribed", n: locked.length }] : [] });
        }
        if (b.action === "add_to_segment") {
          const s = crm.segments.find((x) => x.id === b.segment_id); if (!s) return nf();
          const fresh = rows.filter((c) => !s.pins.includes(c.id)); s.pins.push(...fresh.map((c) => c.id));
          return json(res, 200, { matched: rows.length, changed: fresh.length, skipped: [] });
        }
        crm.companies = crm.companies.filter((c) => !rows.includes(c));
        return json(res, 200, { matched: rows.length, changed: rows.length, skipped: [] });
      }
      if (id === "enroll-plan" && method === "POST") {
        const rows = selected(b.selection);
        const unsub = rows.filter((c) => c.reply_status === "unsubscribed" || c.reply_status === "not_interested").length;
        const noMail = rows.filter((c) => !["unsubscribed", "not_interested"].includes(c.reply_status) && primaryOf(c)?.email_status !== "verified").length;
        const will = rows.length - unsub - noMail;
        return json(res, 200, { matched: rows.length, will_enroll: will, skipped: [...(unsub ? [{ reason: "unsubscribed", n: unsub }] : []), ...(noMail ? [{ reason: "no_verified_email", n: noMail }] : [])], sends_per_day: 210, days: Math.ceil(will / 210) });
      }
      const c = crm.companies.find((x) => x.id === id); if (!c) return nf();
      if (!action && method === "GET") return json(res, 200, detailOut(c));
      if (!action && method === "PATCH") { Object.assign(c, b); return json(res, 200, detailOut(c)); }
      if (action === "merge" && method === "POST") {
        const dup = crm.companies.find((x) => x.id === b.duplicate_id); if (!dup) return nf();
        for (const k of ["domain", "country", "size", "industry", "notes"]) if (c[k] == null) c[k] = dup[k];
        for (const p of crm.people) if (p.company_id === dup.id) { p.company_id = c.id; p.is_primary = false; }
        crm.companies = crm.companies.filter((x) => x.id !== dup.id);
        return json(res, 200, detailOut(c));
      }
      return json(res, 405, { detail: "Method Not Allowed" });
    }
    if (kind === "leads") {
      const p = crm.people.find((x) => x.id === id); if (!p) return nf();
      if (action === "unsubscribe" && method === "POST") { p.unsubscribed_at = iso(); const c = crm.companies.find((x) => x.id === p.company_id); if (c) c.reply_status = "unsubscribed"; return json(res, 200, { ...p, company_name: null }); }
      if (!action && method === "PATCH") { Object.assign(p, b); return json(res, 200, { ...p, company_name: null }); }
      return json(res, 405, { detail: "Method Not Allowed" });
    }
    // segments
    if (!id && method === "GET") return json(res, 200, [...crm.segments].sort((a, z) => z.created_at.localeCompare(a.created_at)).map(segmentOut));
    if (id === "preview" && method === "POST") {
      const hits = crm.companies.filter((c) => matches(c, b.rules, b.match, false));
      return json(res, 200, { count: hits.length, peek: hits.slice(0, 5).map((c) => ({ ...companyOut(c), primary: null })) });
    }
    if (!id && method === "POST") {
      if (crm.segments.some((s) => s.name === b.name)) return json(res, 409, { error: "duplicate", detail: "A segment with this name already exists." });
      const pins = [...(b.company_ids ?? []), ...(b.from_import_id ? crm.companies.filter((c) => c.import_id === b.from_import_id).map((c) => c.id) : [])];
      const s = { id: `sg${++crm.seq + 1}`, name: b.name, rules: b.rules ?? [], match: b.match ?? "all", pins, created_at: iso() };
      crm.segments.push(s);
      return json(res, 201, segmentDetail(s));
    }
    const s = crm.segments.find((x) => x.id === id); if (!s) return nf();
    if (!action && method === "GET") return json(res, 200, segmentDetail(s));
    if (!action && method === "PATCH") { Object.assign(s, b); return json(res, 200, segmentDetail(s)); }
    if (action === "companies" && method === "POST") return json(res, 200, pageOf(crm.companies.filter((c) => inSegment(s, c)), b));
    return json(res, 405, { detail: "Method Not Allowed" });
  });
  return true;
}

/* ------------------------------------------------------------ workspace (onboarding) */
let workspace = null;
function freshWorkspace() {
  return {
    id: ME.organization.id, name: ME.organization.name, slug: ME.organization.slug,
    timezone: null, team_size: null, logo_url: null, website: null, onboarded: false,
    skipped: [], site_pages: [], site_highlights: [], invites: [],
    product: null,
  };
}
function resetWorkspace() { workspace = freshWorkspace(); }
function workspaceRoute(req, res, path) {
  if (!path.startsWith("/api/v1/workspace")) return false;
  if (!signedIn(req)) return json(res, 401, { detail: "Not signed in" }), true;
  if (path === "/api/v1/workspace" && req.method === "GET") return json(res, 200, workspace), true;
  if (path === "/api/v1/workspace" && req.method === "PATCH") {
    readJson(req).then((b) => {
      if (b.name) workspace.name = b.name;
      if (b.slug) workspace.slug = b.slug;
      if (b.timezone) workspace.timezone = b.timezone;
      if (b.team_size) workspace.team_size = b.team_size;
      if (Array.isArray(b.skipped)) workspace.skipped = b.skipped;
      if (Array.isArray(b.invites)) workspace.invites = b.invites.filter((i) => i.email);
      if (b.complete) workspace.onboarded = true;
      json(res, 200, workspace);
    });
    return true;
  }
  if (path === "/api/v1/workspace/logo" && req.method === "POST") {
    workspace.logo_url = "https://assets.test/logos/logo.png";
    return json(res, 200, workspace), true;
  }
  if (path === "/api/v1/workspace/site" && req.method === "POST") {
    readJson(req).then((b) => {
      const host = String(b.url ?? "").replace(/^https?:\/\//, "").split("/")[0] || "site";
      workspace.website = `https://${host}/`;
      workspace.site_pages = [{ path: "/", title: host }];
      workspace.site_highlights = [`${host} home`];
      json(res, 200, workspace);
    });
    return true;
  }
  return false;
}

const BRIAN = {
  id: "brian", name: "Brian Kamau", company: "Pwani Fresh", title: "Cold Chain Lead", email: "brian@pwanifresh.com",
  fit: 88, status: "Interested", snippet: "Four rooms", subject: "Re: Spoilage", body: "Thursday?", avatar: "", time: "09:40",
  unread: true, handled: false, needs_you: true, receipts: [], history: [{ from: "them", who: "Brian Kamau", at: "Today", body: "Thursday?" }],
};
function activityRoute(req, res, path) {
  if (!signedIn(req)) return false;
  const on = !!scenario.activity;
  if (path === "/api/v1/inbox/summary" && req.method === "GET") return json(res, 200, { needs_you: on ? 1 : 0 }), true;
  if (path === "/api/v1/inbox" && req.method === "GET") return json(res, 200, on ? [BRIAN] : []), true;
  if (path.startsWith("/api/v1/inbox/") && (req.method === "PATCH" || req.method === "POST")) return json(res, 200, BRIAN), true;
  if (path === "/api/v1/sequences" && req.method === "GET") return json(res, 200, on ? [{ id: "pilot", name: "Cold-room pilot", status: "running", steps: [], audience: { label: "F&B", count: 6 }, missing: {}, window: "Morning", by: "Tomás", updated: "Sep 14" }] : []), true;
  if (path === "/api/v1/mailboxes" && req.method === "GET") return json(res, 200, { mailboxes: on ? [{ id: "tomas", address: "tomas@coldtrace.io", owner: "Tomas", provider: "google", state: "warm", cap: 35, sentToday: 31, bouncedToday: 0, bounce30: 0, complaints30: 0, auth: { spf: true, dkim: true, dmarc: true }, sequences: 1 }] : [], sent: on ? 31 : 0, cap: on ? 35 : 0, attention: 0 }), true;
  if (path === "/api/v1/discovery/runs" && req.method === "GET") return json(res, 200, { runs: on ? [{ id: "dairy", name: "Dairy & cold rooms · East Africa", status: "running", product: "ColdTrace Sensors", by: "Tomás", criteria: { industries: [], countries: [], sizes: [], queries: [] }, limit: 10, enrichAt: 70, stages: { search: { done: 1, total: 1, state: "done" }, read: { done: 0, total: 1, state: "waiting" }, score: { done: 0, total: null, state: "waiting" }, people: { done: 0, total: null, state: "waiting" }, verify: { done: 0, total: null, state: "waiting" } }, found: 6, added: 0, updated: 0, fits: 4, credits: { used: 1, estimate: 2 } }] : [], credits: { month: on ? 2000 : 0, used: on ? 540 : 0, left: on ? 1460 : 0 } }), true;
  if (path === "/api/v1/discovery/credits" && req.method === "GET") return json(res, 200, { month: 0, used: 0, left: 0 }), true;
  if (path === "/api/v1/integrations" && req.method === "GET") return json(res, 200, on ? [{ provider: "cal", status: "connected", config: {} }] : []), true;
  if (path === "/api/v1/workspace/members" && req.method === "GET") return json(res, 200, [{ id: "u", name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "owner" }]), true;
  if (path === "/api/v1/developers/keys" && req.method === "GET") return json(res, 200, on ? [{ id: "key_n8n", name: "n8n lead sync", env: "live", last4: "7Qa2", scopes: ["leads:read"], by: "Tomás", created: "2026-08-12T10:00:00Z", expires: null, calls7d: 3 }] : []), true;
  if (path === "/api/v1/developers/connections" && req.method === "GET") return json(res, 200, []), true;
  if (path === "/api/v1/leads" && req.method === "GET") return json(res, 200, on ? [{ id: "p1", email: "grace@nyota.co.tz", first_name: "Grace", last_name: "Holloway", company_name: "Nyota Beverages", company_id: null, title: "VP Operations", phone: null, linkedin_url: null, email_status: "verified", is_primary: true, unsubscribed_at: null, source: "manual", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }] : []), true;
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, SELF);
  const path = url.pathname;
  if (!path.startsWith("/__mock")) calls.push(`${req.method} ${path}`);
  cors(req, res);

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.writeHead(204); return res.end();
  }
  if (path === "/health") return json(res, 200, { status: "ok" });
  if (path === "/__mock/scenario" && req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const was = scenario.kbEmpty, wasLeads = scenario.leadsEmpty;
      scenario = { ...scenario, ...JSON.parse(body || "{}") };
      if (scenario.kbEmpty !== was) resetKb();
      if (scenario.leadsEmpty !== wasLeads) resetCrm();
      json(res, 200, scenario);
    }); return;
  }
  if (path === "/__mock/reset" && req.method === "POST") { scenario = { ...FRESH }; calls = []; sends = new Map(); resetKb(); resetCrm(); resetWorkspace(); return json(res, 200, {}); }
  if (path === "/__mock/calls") return json(res, 200, calls);

  if (path === "/api/v1/auth/login" && req.method === "GET") {
    const state = `st-${++n}`;
    return redirect(res, `${SELF}/__mock/authkit?state=${state}`, [`wos_auth_state=${state}; Path=/api/v1/auth; Max-Age=600; HttpOnly; SameSite=Lax`]);
  }
  // Stands in for the hosted AuthKit page: approves (or denies) at once.
  if (path === "/__mock/authkit") {
    const state = url.searchParams.get("state");
    const q = scenario.deny ? `error=access_denied&state=${state}` : `code=code-${n}&state=${state}`;
    return redirect(res, `${SELF}/api/v1/auth/callback?${q}`);
  }
  if (path === "/api/v1/auth/callback") {
    const clearState = "wos_auth_state=; Path=/api/v1/auth; Max-Age=0";
    if (url.searchParams.get("error")) return redirect(res, `${FRONTEND}/sign-in?error=provider_error`, [clearState]);
    const expected = cookies(req).wos_auth_state;
    if (!expected || expected !== url.searchParams.get("state")) return redirect(res, `${FRONTEND}/sign-in?error=invalid_state`, [clearState]);
    return redirect(res, FRONTEND, [`wos_session=sealed-${n}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`, clearState]);
  }
  if (path === "/api/v1/auth/me" && req.method === "GET") {
    if (scenario.down) return json(res, 503, { detail: "Service Unavailable" });
    return signedIn(req) ? json(res, 200, ME) : json(res, 401, { detail: "Session invalid or expired" }, { "Set-Cookie": clearSession });
  }
  if (path === "/api/v1/auth/refresh" && req.method === "POST") {
    return signedIn(req) ? json(res, 200, { refreshed: true }, { "Set-Cookie": `wos_session=sealed-r${++n}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` }) : json(res, 401, { detail: "Not signed in" });
  }
  if ((path === "/api/v1/auth/code/send" || path === "/api/v1/auth/code/verify") && req.method === "POST") {
    if (req.headers.origin !== FRONTEND) return json(res, 403, { detail: "Origin not allowed" });
    readJson(req).then((body) => {
      if (typeof body.email !== "string" || !EMAIL.test(body.email)) return json(res, 422, { detail: "email: not a valid address" });
      const email = body.email.toLowerCase();
      if (path.endsWith("/send")) {
        if (scenario.sendLimited) return json(res, 429, { error: "rate_limited", detail: "Too many requests.", retry_after: scenario.sendLimited }, { "Retry-After": String(scenario.sendLimited) });
        const now = Date.now();
        const recent = (sends.get(email) ?? []).filter((t) => now - t < 60_000);
        if (recent.length >= 3) {
          const wait = Math.ceil((60_000 - (now - recent[0])) / 1000);
          return json(res, 429, { error: "rate_limited", detail: "Too many requests.", retry_after: wait }, { "Retry-After": String(wait) });
        }
        sends.set(email, [...recent, now]);
        return json(res, 202, { sent: true });
      }
      if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) return json(res, 422, { detail: "code: six digits" });
      if (body.code === "111111") return json(res, 400, { error: "code_expired", detail: "That code has expired." });
      if (body.code === "222222") return json(res, 429, { error: "rate_limited", detail: "Too many requests.", retry_after: 42 }, { "Retry-After": "42" });
      if (body.code === "444444") return json(res, 400, { error: "too_many_attempts", detail: "Too many attempts." });
      if (body.code === "333333") return json(res, 400, { error: "auth_failed", detail: "Sign-in failed." });
      if (body.code === "555555") return json(res, 503, { error: "auth_unavailable", detail: "Sign-in is unavailable." });
      if (body.code !== "123456") return json(res, 400, { error: "code_invalid", detail: "That code isn't right." });
      return json(res, 200, { redirect_to: FRONTEND }, { "Set-Cookie": `wos_session=sealed-c${++n}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` });
    });
    return;
  }
  if (workspaceRoute(req, res, path)) return;
  if (kbRoute(req, res, path, url)) return;
  if (leadsRoute(req, res, path)) return;
  if (activityRoute(req, res, path)) return;
  if (path === "/api/v1/auth/logout" && req.method === "POST") {
    return json(res, 200, { logout_url: `${FRONTEND}/` }, { "Set-Cookie": clearSession });
  }
  json(res, 404, { detail: "Not Found" });
});

resetKb();
resetCrm();
resetWorkspace();
server.listen(PORT, () => console.log(`mock Corral API on ${SELF}, frontend ${FRONTEND}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.closeAllConnections(); process.exit(0); });
