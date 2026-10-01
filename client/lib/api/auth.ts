/**
 * The auth contract from PR #2 (server/app/auth/routes.py, eng-61-auth):
 *
 *   GET  /api/v1/auth/login[?screen_hint=sign-in|sign-up]  303 to WorkOS AuthKit
 *   GET  /api/v1/auth/callback                           303 to FRONTEND_URL, or FRONTEND_URL/sign-in?error=<code>
 *   POST /api/v1/auth/refresh   -> { refreshed: boolean }  (401 no/invalid session, 503 WorkOS down)
 *   POST /api/v1/auth/logout    -> { logout_url: string }  (always clears the cookie)
 *   GET  /api/v1/auth/me        -> { user, organization, role }  (401 signed out, 403 no membership)
 *
 * Email code sign-in (WorkOS Magic Auth, ENG-80 / eng-61b-magic-auth). JSON POSTs; errors are
 * { error, detail } and a 429 carries Retry-After (seconds):
 *
 *   POST /api/v1/auth/code/send    { email }        -> 202 { sent: true }  (same answer for unknown addresses)
 *                                                      429 rate_limited · 503 auth_unavailable · 422 bad email
 *   POST /api/v1/auth/code/verify  { email, code }  -> 200 { redirect_to } + the wos_session cookie
 *                                                      400 code_invalid | code_expired | too_many_attempts | auth_failed
 *                                                      429 rate_limited · 503 auth_unavailable · 422 malformed code
 *
 * The session is the HttpOnly `wos_session` cookie; the client never sees it.
 */
import { err, ok, type Result } from "../result";
import { retryAfterSeconds, type CodeSendResult, type CodeVerifyResult } from "../auth/code";
import type { ApiClient, Decoder } from "./client";
import type { ApiError } from "./errors";
import { field, isBoolean, isHttpUrl, isNonEmptyString, isOptionalString, isRecord, isString } from "./decode";

export const AUTH_PATHS = {
  login: "/api/v1/auth/login",
  callback: "/api/v1/auth/callback",
  refresh: "/api/v1/auth/refresh",
  logout: "/api/v1/auth/logout",
  me: "/api/v1/auth/me",
  codeSend: "/api/v1/auth/code/send",
  codeVerify: "/api/v1/auth/code/verify",
} as const;

export type User = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
};
export type Organization = { id: string; name: string; slug: string; onboarded: boolean; logoUrl: string | null };
/** Backend roles today are owner | admin | member; kept open so a new role doesn't break sign-in. */
export type Role = "owner" | "admin" | "member" | (string & {});
export type Me = { user: User; organization: Organization; role: Role };

const opt = (v: string | null | undefined): string | null => (v === undefined || v === "" ? null : v);

export const decodeMe: Decoder<Me> = (input) => {
  if (!isRecord(input)) return err("me: expected an object");
  const { user: u, organization: o } = input;
  if (!isRecord(u)) return err("me.user: expected an object");
  if (!isRecord(o)) return err("me.organization: expected an object");
  const id = field(u, "id", isNonEmptyString, "string", "me.user"); if (!id.ok) return id;
  const email = field(u, "email", isNonEmptyString, "string", "me.user"); if (!email.ok) return email;
  const first = field(u, "first_name", isOptionalString, "string or null", "me.user"); if (!first.ok) return first;
  const last = field(u, "last_name", isOptionalString, "string or null", "me.user"); if (!last.ok) return last;
  const pic = field(u, "profile_picture_url", isOptionalString, "string or null", "me.user"); if (!pic.ok) return pic;
  const orgId = field(o, "id", isNonEmptyString, "string", "me.organization"); if (!orgId.ok) return orgId;
  const name = field(o, "name", isString, "string", "me.organization"); if (!name.ok) return name;
  const slug = field(o, "slug", isString, "string", "me.organization"); if (!slug.ok) return slug;
  const role = field(input, "role", isNonEmptyString, "string", "me"); if (!role.ok) return role;
  const onboarded = o.onboarded === undefined ? false : o.onboarded;
  if (typeof onboarded !== "boolean") return err("me.organization.onboarded: expected boolean");
  const logo = o.logo_url === undefined ? null : o.logo_url;
  if (logo !== null && typeof logo !== "string") return err("me.organization.logo_url: expected string or null");
  return ok({
    user: {
      id: id.value, email: email.value, firstName: opt(first.value), lastName: opt(last.value),
      profilePictureUrl: isHttpUrl(pic.value) ? pic.value : null,
    },
    organization: { id: orgId.value, name: name.value, slug: slug.value, onboarded, logoUrl: isHttpUrl(logo) ? logo : null },
    role: role.value,
  });
};

export const decodeRefresh: Decoder<{ refreshed: boolean }> = (input) => {
  if (!isRecord(input)) return err("refresh: expected an object");
  const r = field(input, "refreshed", isBoolean, "boolean", "refresh");
  return r.ok ? ok({ refreshed: r.value }) : r;
};

export const decodeLogout: Decoder<{ logoutUrl: string }> = (input) => {
  if (!isRecord(input)) return err("logout: expected an object");
  const r = field(input, "logout_url", isHttpUrl, "an http(s) URL", "logout");
  return r.ok ? ok({ logoutUrl: r.value }) : r;
};

export const decodeCodeSent: Decoder<{ sent: true }> = (input) =>
  isRecord(input) && input.sent === true ? ok({ sent: true }) : err("code/send: expected { sent: true }");

export const decodeSignedIn: Decoder<{ redirectTo: string }> = (input) => {
  if (!isRecord(input)) return err("code/verify: expected an object");
  const r = field(input, "redirect_to", isHttpUrl, "an http(s) URL", "code/verify");
  return r.ok ? ok({ redirectTo: r.value }) : r;
};

/** HANDOFF §9: a 429 is `rate-limited` with Retry-After; anything else that isn't a 2xx is `network`. */
export function toCodeSendResult(r: Result<unknown, ApiError>): CodeSendResult {
  if (r.ok) return { ok: true };
  const e = r.error;
  if (e.kind === "http" && e.status === 429) return { ok: false, reason: "rate-limited", retryAfter: retryAfterSeconds(e.retryAfter) };
  return { ok: false, reason: "network" };
}

/**
 * HANDOFF §9: a wrong code is `wrong`; expired and already used are `expired`, and a code WorkOS locked
 * (one_time_code_too_many_attempts → `too_many_attempts`) is `attempts`: both offer "Send a new code". A 429 is `rate-limited` with Retry-After. Any other
 * refusal (`auth_failed`, another 4xx) is `failed`. Only no answer (network, timeout, a bad body) and
 * 5xx are `network` ("Couldn't check the code").
 */
export function toCodeVerifyResult(r: Result<unknown, ApiError>): CodeVerifyResult {
  if (r.ok) return { ok: true };
  const e = r.error;
  if (e.kind === "http") {
    if (e.code === "code_invalid" || e.status === 422) return { ok: false, reason: "wrong" };
    if (e.code === "code_expired") return { ok: false, reason: "expired" };
    if (e.code === "too_many_attempts") return { ok: false, reason: "attempts" };
    if (e.status === 429) return { ok: false, reason: "rate-limited", retryAfter: retryAfterSeconds(e.retryAfter) };
    if (e.status < 500) return { ok: false, reason: "failed" };
  }
  if (e.kind === "unauthorized" || e.kind === "forbidden") return { ok: false, reason: "failed" };
  return { ok: false, reason: "network" };
}

export type ScreenHint = "sign-in" | "sign-up";

export type AuthApi = {
  /** Full URL of the backend login redirect. Navigate the window to it; don't fetch it. */
  loginUrl(options?: { screenHint?: ScreenHint }): string;
  me(signal?: AbortSignal): Promise<Result<Me, ApiError>>;
  refresh(signal?: AbortSignal): Promise<Result<{ refreshed: boolean }, ApiError>>;
  logout(signal?: AbortSignal): Promise<Result<{ logoutUrl: string }, ApiError>>;
  /** Ask the API to email a six-digit sign-in code. */
  sendCode(email: string, signal?: AbortSignal): Promise<Result<{ sent: true }, ApiError>>;
  /** Exchange the code for a session; on success the API has set the session cookie. */
  verifyCode(email: string, code: string, signal?: AbortSignal): Promise<Result<{ redirectTo: string }, ApiError>>;
};

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    loginUrl: (o) => client.url(AUTH_PATHS.login, { screen_hint: o?.screenHint }),
    me: (signal) => client.request(AUTH_PATHS.me, { decode: decodeMe, signal }),
    refresh: (signal) => client.request(AUTH_PATHS.refresh, { method: "POST", decode: decodeRefresh, signal }),
    logout: (signal) => client.request(AUTH_PATHS.logout, { method: "POST", decode: decodeLogout, signal }),
    sendCode: (email, signal) => client.request(AUTH_PATHS.codeSend, { method: "POST", body: { email }, decode: decodeCodeSent, signal }),
    verifyCode: (email, code, signal) =>
      client.request(AUTH_PATHS.codeVerify, { method: "POST", body: { email, code }, decode: decodeSignedIn, signal }),
  };
}

/** "Wanjiru Mwangi", or the email when the profile has no name. */
export function displayName(u: User): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

/** "owner" -> "Owner". */
export function roleLabel(role: Role): string {
  return role ? role[0].toUpperCase() + role.slice(1) : role;
}
