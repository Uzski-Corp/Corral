/**
 * Email sign-in with a six-digit code (WorkOS Magic Auth, ENG-80). Plain module: the rules the
 * "Check your email" screen follows, and the result shapes Krak's API layer returns to it.
 *
 * WorkOS owns the truth: it issues the code, expires it after 10 minutes and rate-limits sending to
 * 3 per minute. The client only mirrors those numbers in copy and in a soft resend cooldown.
 */
export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const RESEND_PER_MINUTE = 3;
/** 60s / 3 sends: waiting this long between sends never hits the WorkOS limit from one tab. */
export const RESEND_COOLDOWN_SECONDS = 60 / RESEND_PER_MINUTE;

/** Digits only, at most six: accepts "123 456", "123-456" and "Your code is 123456" pasted whole. */
export function sanitizeCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}
export const isCompleteCode = (code: string) => code.length === CODE_LENGTH && /^\d+$/.test(code);

/** 41 -> "0:41", 75 -> "1:15". Never negative. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * What verifying a code can come back with. `network` = no answer (offline, 5xx, timeout) · `failed` = the API refused the
 * sign-in for another reason (send a new code) · `rate-limited` = too many tries, `retryAfter` seconds from 429 Retry-After.
 */
export type CodeVerifyResult = { ok: true } | { ok: false; reason: "wrong" | "expired" | "failed" | "network" } | { ok: false; reason: "rate-limited"; retryAfter: number };
/** What sending (or resending) a code can come back with. `retryAfter` in seconds, from 429 Retry-After. */
export type CodeSendResult = { ok: true } | { ok: false; reason: "rate-limited"; retryAfter: number } | { ok: false; reason: "network" };

/** Retry-After as seconds: a number of seconds or an HTTP date; falls back to a full minute. */
export function retryAfterSeconds(header: string | null | undefined, now = Date.now()): number {
  if (!header) return 60;
  const n = Number(header.trim());
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return 60;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** Sample outcomes for Bau's review flow (no API): 123456 signs in, 111111 has expired, anything else is wrong. */
export function reviewVerify(code: string): CodeVerifyResult {
  if (code === "123456") return { ok: true };
  if (code === "111111") return { ok: false, reason: "expired" };
  return { ok: false, reason: "wrong" };
}
