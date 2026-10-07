/* POST /api/waitlist: the landing pages' waitlist capture.
   The contract is Bau's (client/lib/marketing/waitlist.ts and the landing-v HANDOFF):

   JSON  { email, source: "v1" | "v2" | "v3" | "v4" | "home" }
     201 { status: "joined" }   new address
     200 { status: "exists" }   already on the list
     422 { error: "invalid_email" }
     anything else (400, 403, 405, 413, 415, 429, 500) reads as the form's error state.
   Form  application/x-www-form-urlencoded, fields email + source (the form with JS off)
     303 back to the Referer path (same origin only, else /) with #waitlist-joined, -exists, -invalid or -error.

   Server side: trim + lowercase + re-validate, dedupe on the primary key (INSERT ... ON CONFLICT DO NOTHING),
   country from request.cf, a SHA-256 of the IP instead of the IP, a capped body, and at most RATE_LIMIT.max new
   addresses per IP hash per RATE_LIMIT.windowMs. No email is sent from here. */

export interface WaitlistEnv {
  WAITLIST_DB: D1Database;
  /** Optional secret mixed into the IP hash, so stored hashes can't be reversed by hashing every IPv4 address. */
  IP_HASH_SALT?: string;
}

export const WAITLIST_PATH = "/api/waitlist";
export const MAX_BODY_BYTES = 2048;
export const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 } as const;
export const SOURCES = ["v1", "v2", "v3", "v4", "home"] as const;
export type Source = (typeof SOURCES)[number] | "unknown";
export type Outcome = "joined" | "exists" | "invalid" | "error";

const MAX_EMAIL = 254;
/** One @, a local part of at most 64 characters, dot-separated non-empty domain labels and a 2+ character TLD,
    no whitespace or control characters. A little stricter than the client's isEmail, never looser. */
const EMAIL = /^[^\s@\p{Cc}]{1,64}@(?:[^\s@.\p{Cc}]+\.)+[^\s@.\p{Cc}]{2,}$/u;
const COUNTRY = /^[A-Z0-9]{2}$/;
const FORM_TYPE = "application/x-www-form-urlencoded";
const JSON_TYPE = "application/json";

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= MAX_EMAIL && EMAIL.test(email) ? email : null;
}

export function normalizeSource(raw: unknown): Source {
  return (SOURCES as readonly unknown[]).includes(raw) ? (raw as Source) : "unknown";
}

export async function hashIp(ip: string, salt?: string): Promise<string> {
  const data = new TextEncoder().encode(salt ? `${salt}:${ip}` : ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function countryOf(request: Request): string | null {
  const country = (request as { cf?: { country?: unknown } }).cf?.country;
  return typeof country === "string" && COUNTRY.test(country) ? country : null;
}

/** Reads at most `max` bytes of the body; null when it is larger (declared or streamed). */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const BASE_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function json(status: number, body: Record<string, string>, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** 303 back to where the form was (same origin only), with the fragment the page's CSS :target shows. */
export function formRedirect(request: Request, outcome: Outcome): Response {
  const here = new URL(request.url);
  let path = "/";
  const referer = request.headers.get("referer");
  if (referer && URL.canParse(referer)) {
    const from = new URL(referer);
    if (from.origin === here.origin) path = `${from.pathname}${from.search}`;
  }
  const location = new URL(`${path}#waitlist-${outcome}`, here.origin).toString();
  return new Response(null, { status: 303, headers: { ...BASE_HEADERS, location } });
}

type Fields = { email?: unknown; source?: unknown };
type Parsed = { ok: true; fields: Fields } | { ok: false; status: number; error: string };

function parse(text: string, form: boolean): Parsed {
  if (form) {
    const params = new URLSearchParams(text);
    return { ok: true, fields: { email: params.get("email") ?? undefined, source: params.get("source") ?? undefined } };
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return { ok: true, fields: value as Fields };
  } catch {
    // fall through
  }
  return { ok: false, status: 400, error: "invalid_body" };
}

type Stored = "joined" | "exists" | "rate_limited";

async function store(env: WaitlistEnv, row: { email: string; source: Source; country: string | null; ipHash: string }): Promise<Stored> {
  const db = env.WAITLIST_DB;
  const now = new Date();
  const since = new Date(now.getTime() - RATE_LIMIT.windowMs).toISOString();
  const recent = Number(
    await db
      .prepare("SELECT COUNT(*) AS n FROM waitlist WHERE ip_hash = ?1 AND created_at > ?2")
      .bind(row.ipHash, since)
      .first<number>("n"),
  );
  if (recent >= RATE_LIMIT.max) {
    // Over the limit no new address goes in, but someone already on the list still hears "exists".
    const known = await db.prepare("SELECT 1 AS hit FROM waitlist WHERE email = ?1").bind(row.email).first<number>("hit");
    return known ? "exists" : "rate_limited";
  }
  const result = await db
    .prepare(
      "INSERT INTO waitlist (email, source, country, created_at, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (email) DO NOTHING",
    )
    .bind(row.email, row.source, row.country, now.toISOString(), row.ipHash)
    .run();
  return result.meta.changes > 0 ? "joined" : "exists";
}

export async function handleWaitlist(request: Request, env: WaitlistEnv): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json(403, { error: "forbidden_origin" });

  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const form = type === FORM_TYPE;
  if (!form && type !== JSON_TYPE) return json(415, { error: "unsupported_media_type" });

  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return form ? formRedirect(request, "error") : json(413, { error: "payload_too_large" });

  const parsed = parse(text, form);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });

  const email = normalizeEmail(parsed.fields.email);
  if (!email) return form ? formRedirect(request, "invalid") : json(422, { error: "invalid_email" });

  try {
    const ipHash = await hashIp(request.headers.get("cf-connecting-ip") ?? "unknown", env.IP_HASH_SALT);
    const stored = await store(env, { email, source: normalizeSource(parsed.fields.source), country: countryOf(request), ipHash });
    if (stored === "rate_limited") {
      return form
        ? formRedirect(request, "error")
        : json(429, { error: "rate_limited" }, { "retry-after": String(RATE_LIMIT.windowMs / 1000) });
    }
    if (form) return formRedirect(request, stored);
    return stored === "joined" ? json(201, { status: "joined" }) : json(200, { status: "exists" });
  } catch (err) {
    console.error("waitlist: store failed", err);
    return form ? formRedirect(request, "error") : json(500, { error: "server_error" });
  }
}
