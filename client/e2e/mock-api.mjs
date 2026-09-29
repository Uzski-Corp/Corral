// A stand-in for the Corral API auth endpoints (PR #2), so e2e runs without WorkOS or Postgres.
// It mirrors the real contract: cookie names, 303 redirects, status codes and JSON shapes.
// Control: POST /__mock/scenario {"deny": true} makes the next AuthKit round trip fail, {"down": true}
// makes /me answer 503 (API unreachable), {"sendLimited": 41} makes code sends answer 429 with Retry-After: 41;
// email codes (Magic Auth, eng-61b-magic-auth): 123456 signs in, 111111 has expired, 222222 is a verify 429
// (Retry-After: 42), 333333 is refused (auth_failed), 444444 is locked (too_many_attempts), 555555 is a 503 from the auth provider, anything else is wrong,
// and a 4th send for one address inside a minute is rate-limited, as WorkOS does;
// GET /__mock/calls lists requests seen; POST /__mock/reset clears both.
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3100";
const SELF = `http://localhost:${PORT}`;

const ME = {
  user: { id: "0b6b4c1e-1111-4a53-9c1e-2d3f5a7b9c01", email: "wanjiru@kilima.co.ke", first_name: "Wanjiru", last_name: "Mwangi", profile_picture_url: null },
  organization: { id: "5f2a0c8e-2222-4b1d-8e3f-6a7b8c9d0e12", name: "Kilima Dairies", slug: "kilima" },
  role: "owner",
};

const FRESH = { deny: false, down: false, sendLimited: 0 };
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, SELF);
  const path = url.pathname;
  if (!path.startsWith("/__mock")) calls.push(`${req.method} ${path}`);
  cors(req, res);

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.writeHead(204); return res.end();
  }
  if (path === "/health") return json(res, 200, { status: "ok" });
  if (path === "/__mock/scenario" && req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { scenario = { ...scenario, ...JSON.parse(body || "{}") }; json(res, 200, scenario); }); return;
  }
  if (path === "/__mock/reset" && req.method === "POST") { scenario = { ...FRESH }; calls = []; sends = new Map(); return json(res, 200, {}); }
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
  if (path === "/api/v1/auth/logout" && req.method === "POST") {
    return json(res, 200, { logout_url: `${FRONTEND}/` }, { "Set-Cookie": clearSession });
  }
  json(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => console.log(`mock Corral API on ${SELF}, frontend ${FRONTEND}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.closeAllConnections(); process.exit(0); });
