// A stand-in for the Corral API auth endpoints (PR #2), so e2e runs without WorkOS or Postgres.
// It mirrors the real contract: cookie names, 303 redirects, status codes and JSON shapes.
// Control: POST /__mock/scenario {"deny": true} makes the next AuthKit round trip fail;
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

let scenario = { deny: false };
let calls = [];
let n = 0;

const cookies = (req) => Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, v.join("=")]));
const cors = (req, res) => {
  if (req.headers.origin === FRONTEND) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
};
const json = (res, status, body, extra = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...extra }); res.end(JSON.stringify(body)); };
const redirect = (res, to, setCookie = []) => { res.writeHead(303, { Location: to, "Set-Cookie": setCookie }); res.end(); };
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
  if (path === "/__mock/reset" && req.method === "POST") { scenario = { deny: false }; calls = []; return json(res, 200, {}); }
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
    return signedIn(req) ? json(res, 200, ME) : json(res, 401, { detail: "Session invalid or expired" }, { "Set-Cookie": clearSession });
  }
  if (path === "/api/v1/auth/refresh" && req.method === "POST") {
    return signedIn(req) ? json(res, 200, { refreshed: true }, { "Set-Cookie": `wos_session=sealed-r${++n}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` }) : json(res, 401, { detail: "Not signed in" });
  }
  if (path === "/api/v1/auth/logout" && req.method === "POST") {
    return json(res, 200, { logout_url: `${FRONTEND}/` }, { "Set-Cookie": clearSession });
  }
  json(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => console.log(`mock Corral API on ${SELF}, frontend ${FRONTEND}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.closeAllConnections(); process.exit(0); });
