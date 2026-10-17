/* POST /api/pricing-intent: the pricing gate's lead capture (design: Bau's pricing-gate handoff, Oct 17).

   JSON { fullName, industry, otherText?, email, phone?, source?, website?, "cf-turnstile-response"? }
     202 { status: "queued" }                        stored (or a repeat / honeypot: never says "exists"), email on its way
     422 { error: "invalid_field", field }           fullName | industry | otherText | email | phone
     429 + Retry-After                               per-IP limit, or a failed Turnstile check
     404 (flag off) 400 403 405 413 415 500          anything else reads as the form's failure state

   Order: method, flag, origin, content type, capped body, JSON, honeypot, Turnstile, validation, limits, insert, then the
   AutoSend email after the response (ctx.waitUntil). A mail failure is logged and never changes the answer.
   Limits: RATE_LIMIT.ip new rows per IP hash per 10 minutes (429), RATE_LIMIT.email per address per hour (the
   over-limit address still gets 202, but nothing is stored or sent, so the form cannot be used to mail-bomb someone). */
import { sendPricingEmail, type PricingMailEnv } from "./pricing-email";
import { TURNSTILE_VERIFY_URL } from "./pricing-config";
import { checkFields } from "./pricing-validate";
import { countryOf, hashIp, readCapped } from "./waitlist";

export interface PricingEnv extends PricingMailEnv {
  WAITLIST_DB: D1Database;
  /** Optional secret mixed into the IP hash. */
  IP_HASH_SALT?: string;
  /** "1" turns the endpoint on. Anything else answers 404. */
  PRICING_INTENT_ENABLED?: string;
  /** Optional Worker secret. When set, the Turnstile token is required and verified. */
  TURNSTILE_SECRET?: string;
}

export const PRICING_INTENT_PATH = "/api/pricing-intent";
export const MAX_BODY_BYTES = 4096;
export const RATE_LIMIT = { ip: { max: 5, windowMs: 10 * 60 * 1000 }, email: { max: 3, windowMs: 60 * 60 * 1000 } } as const;
const RETRY_AFTER = String(RATE_LIMIT.ip.windowMs / 1000);
const BASE_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function json(status: number, body: Record<string, string>, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", ...headers } });
}
const queued = () => json(202, { status: "queued" });

export async function verifyTurnstile(secret: string, token: unknown, ip: string | null, fetcher: typeof fetch): Promise<boolean> {
  if (typeof token !== "string" || token === "" || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const res = await fetcher(TURNSTILE_VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: unknown }).success === true;
  } catch {
    return false;
  }
}

async function count(db: D1Database, column: "ip_hash" | "email", value: string, windowMs: number, now: Date): Promise<number> {
  const since = new Date(now.getTime() - windowMs).toISOString();
  const sql = column === "ip_hash"
    ? "SELECT COUNT(*) AS n FROM pricing_intents WHERE ip_hash = ?1 AND created_at > ?2"
    : "SELECT COUNT(*) AS n FROM pricing_intents WHERE email = ?1 AND created_at > ?2";
  return Number(await db.prepare(sql).bind(value, since).first<number>("n"));
}

export async function handlePricingIntent(
  request: Request,
  env: PricingEnv,
  ctx?: Pick<ExecutionContext, "waitUntil">,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });
  if (env.PRICING_INTENT_ENABLED !== "1") return json(404, { error: "not_found" });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json(403, { error: "forbidden_origin" });
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") return json(415, { error: "unsupported_media_type" });

  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return json(413, { error: "payload_too_large" });
  let input: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return json(400, { error: "invalid_body" });
    input = value as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_body" });
  }

  // The honeypot: a bot that fills the hidden field is told it worked, and nothing is stored or sent.
  if (typeof input.website === "string" && input.website !== "") return queued();

  const ip = request.headers.get("cf-connecting-ip");
  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env.TURNSTILE_SECRET, input["cf-turnstile-response"], ip, fetcher))) {
    return json(429, { error: "challenge_failed" }, { "retry-after": RETRY_AFTER });
  }

  const checked = checkFields(input);
  if (!checked.ok) return json(422, { error: "invalid_field", field: checked.field });
  const lead = checked.value;

  try {
    const db = env.WAITLIST_DB;
    const now = new Date();
    const ipHash = await hashIp(ip ?? "unknown", env.IP_HASH_SALT);
    if ((await count(db, "ip_hash", ipHash, RATE_LIMIT.ip.windowMs, now)) >= RATE_LIMIT.ip.max) {
      return json(429, { error: "rate_limited" }, { "retry-after": RETRY_AFTER });
    }
    if ((await count(db, "email", lead.email, RATE_LIMIT.email.windowMs, now)) >= RATE_LIMIT.email.max) return queued();

    const result = await db
      .prepare(
        "INSERT INTO pricing_intents (email, full_name, industry, other_text, phone, free_mail, source, country, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      )
      .bind(lead.email, lead.fullName, lead.industry, lead.otherText, lead.phone, lead.freeMail ? 1 : 0, lead.source, countryOf(request), ipHash, now.toISOString())
      .run();
    ctx?.waitUntil(deliver(env, { id: result.meta.last_row_id, email: lead.email, fullName: lead.fullName }, fetcher));
    return queued();
  } catch (err) {
    console.error("pricing-intent: store failed", err instanceof Error ? err.name : "error");
    return json(500, { error: "server_error" });
  }
}

/** Sends the email, then stamps emailed_at when AutoSend accepted it. Never throws. */
export async function deliver(env: PricingEnv, row: { id: number; email: string; fullName: string }, fetcher: typeof fetch = fetch): Promise<void> {
  const sent = await sendPricingEmail(env, row, fetcher);
  if (sent !== "sent") return;
  try {
    await env.WAITLIST_DB.prepare("UPDATE pricing_intents SET emailed_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), row.id).run();
  } catch (err) {
    console.error("pricing-intent: could not stamp emailed_at", err instanceof Error ? err.name : "error");
  }
}
