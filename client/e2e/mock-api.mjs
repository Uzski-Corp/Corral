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
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3100";
const SELF = `http://localhost:${PORT}`;

const ME = {
  user: { id: "0b6b4c1e-1111-4a53-9c1e-2d3f5a7b9c01", email: "wanjiru@kilima.co.ke", first_name: "Wanjiru", last_name: "Mwangi", profile_picture_url: null },
  organization: { id: "5f2a0c8e-2222-4b1d-8e3f-6a7b8c9d0e12", name: "Kilima Dairies", slug: "kilima" },
  role: "owner",
};

const FRESH = { deny: false, down: false, sendLimited: 0, kbDown: false, kbEmpty: false, kbSlow: false, deleteFails: false };
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
    out[head[1]] = head[2] === undefined ? body : { filename: head[2], size: body.length };
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
      const was = scenario.kbEmpty;
      scenario = { ...scenario, ...JSON.parse(body || "{}") };
      if (scenario.kbEmpty !== was) resetKb();
      json(res, 200, scenario);
    }); return;
  }
  if (path === "/__mock/reset" && req.method === "POST") { scenario = { ...FRESH }; calls = []; sends = new Map(); resetKb(); return json(res, 200, {}); }
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
  if (kbRoute(req, res, path, url)) return;
  if (path === "/api/v1/auth/logout" && req.method === "POST") {
    return json(res, 200, { logout_url: `${FRONTEND}/` }, { "Set-Cookie": clearSession });
  }
  json(res, 404, { detail: "Not Found" });
});

resetKb();
server.listen(PORT, () => console.log(`mock Corral API on ${SELF}, frontend ${FRONTEND}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.closeAllConnections(); process.exit(0); });
