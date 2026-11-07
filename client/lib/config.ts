/**
 * Client configuration, parsed once from the environment into a typed value.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so they have to be referenced literally
 * (see `readEnv`). Anything that fails to parse is a configuration error, reported with the
 * variable name and the value that was rejected.
 */
import { err, ok, type Result } from "./result";

/** `live` talks to the Corral API. `review` is the design-review build: no auth, sample data. */
export type AuthMode = "live" | "review";

export type ClientConfig = {
  readonly mode: AuthMode;
  /** Origin of the Corral API, without a trailing slash. Empty in review mode. */
  readonly apiUrl: string;
  /** Name of the sealed session cookie the API sets (backend SESSION_COOKIE_NAME). */
  readonly sessionCookie: string;
  /** Whether design-review query params (?state=, ?step=, …) are honoured. */
  readonly reviewStates: boolean;
  /** Default timeout for API calls, in milliseconds. */
  readonly apiTimeoutMs: number;
};

export type EnvInput = {
  NODE_ENV?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_DESIGN_REVIEW?: string;
  NEXT_PUBLIC_API_TIMEOUT_MS?: string;
  SESSION_COOKIE_NAME?: string;
  NEXT_PUBLIC_STATUS_URL?: string;
};

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export const DEV_API_URL = "http://localhost:8000";
export const DEFAULT_SESSION_COOKIE = "wos_session";
export const DEFAULT_API_TIMEOUT_MS = 10_000;
/** Where "Status" / "Status page" links go until NEXT_PUBLIC_STATUS_URL points at the real page. */
export const DEFAULT_STATUS_URL = "#status";

const COOKIE_NAME = /^[A-Za-z0-9_.-]+$/;

function parseApiUrl(raw: string | undefined, production: boolean): Result<string, ConfigError> {
  const value = raw?.trim();
  if (!value) {
    if (production) return err(new ConfigError("NEXT_PUBLIC_API_URL is required in production builds"));
    return ok(DEV_API_URL);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return err(new ConfigError(`NEXT_PUBLIC_API_URL is not a valid URL: ${JSON.stringify(value)}`));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return err(new ConfigError(`NEXT_PUBLIC_API_URL must be http(s), got ${JSON.stringify(url.protocol)}`));
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return err(new ConfigError(`NEXT_PUBLIC_API_URL must be an origin only (no path), got ${JSON.stringify(value)}`));
  }
  return ok(url.origin);
}

function parseTimeout(raw: string | undefined): Result<number, ConfigError> {
  if (raw === undefined || raw.trim() === "") return ok(DEFAULT_API_TIMEOUT_MS);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 100 || n > 120_000) {
    return err(new ConfigError(`NEXT_PUBLIC_API_TIMEOUT_MS must be an integer between 100 and 120000, got ${JSON.stringify(raw)}`));
  }
  return ok(n);
}

/** An absolute http(s) URL, a same-site path ("/status") or a fragment ("#status"). */
export function parseStatusUrl(raw: string | undefined): Result<string, ConfigError> {
  const value = raw?.trim();
  if (!value) return ok(DEFAULT_STATUS_URL);
  if (value.startsWith("#") || (value.startsWith("/") && !value.startsWith("//"))) return ok(value);
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return ok(url.href);
  } catch { /* reported below */ }
  return err(new ConfigError(`NEXT_PUBLIC_STATUS_URL must be an http(s) URL, a /path or a #fragment, got ${JSON.stringify(value)}`));
}

export function parseConfig(env: EnvInput): Result<ClientConfig, ConfigError> {
  const production = env.NODE_ENV === "production";
  const review = env.NEXT_PUBLIC_DESIGN_REVIEW === "1" || env.NEXT_PUBLIC_DESIGN_REVIEW === "true";
  const cookie = env.SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE;
  if (!COOKIE_NAME.test(cookie)) return err(new ConfigError(`SESSION_COOKIE_NAME has invalid characters: ${JSON.stringify(cookie)}`));
  const timeout = parseTimeout(env.NEXT_PUBLIC_API_TIMEOUT_MS);
  if (!timeout.ok) return timeout;
  if (review) {
    return ok({ mode: "review", apiUrl: "", sessionCookie: cookie, reviewStates: true, apiTimeoutMs: timeout.value });
  }
  const apiUrl = parseApiUrl(env.NEXT_PUBLIC_API_URL, production);
  if (!apiUrl.ok) return apiUrl;
  return ok({ mode: "live", apiUrl: apiUrl.value, sessionCookie: cookie, reviewStates: false, apiTimeoutMs: timeout.value });
}

/** Literal references so Next can inline the public values into client bundles. */
export function readEnv(): EnvInput {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_DESIGN_REVIEW: process.env.NEXT_PUBLIC_DESIGN_REVIEW,
    NEXT_PUBLIC_API_TIMEOUT_MS: process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    NEXT_PUBLIC_STATUS_URL: process.env.NEXT_PUBLIC_STATUS_URL,
  };
}

let status: string | undefined;

/**
 * The status page URL (NEXT_PUBLIC_STATUS_URL, else "#status"): the one value every status link
 * uses. Separate from getConfig() because the design components that show it also render on the
 * styleguide, which has no API. Throws ConfigError on a malformed value.
 */
export function statusUrl(): string {
  if (status !== undefined) return status;
  const r = parseStatusUrl(readEnv().NEXT_PUBLIC_STATUS_URL);
  if (!r.ok) throw r.error;
  status = r.value;
  return status;
}

let cached: ClientConfig | undefined;
let warned = false;

/** Stand-in used only while `next build` prerenders, which never calls the API. */
const PRERENDER_CONFIG: ClientConfig = { mode: "live", apiUrl: "", sessionCookie: DEFAULT_SESSION_COOKIE, reviewStates: false, apiTimeoutMs: DEFAULT_API_TIMEOUT_MS };

/**
 * The process-wide config. Throws ConfigError on a misconfigured deploy, at request time.
 * During `next build` it warns instead, so the build (and CI without secrets) still passes;
 * the built app then fails loudly the first time it runs.
 */
export function getConfig(): ClientConfig {
  if (cached) return cached;
  const parsed = parseConfig(readEnv());
  if (!parsed.ok) {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw parsed.error;
    if (!warned) { warned = true; console.warn(`[corral] ${parsed.error.message}; this build will not run until it is set.`); }
    return PRERENDER_CONFIG;
  }
  cached = parsed.value;
  return cached;
}

/** Test hook: forget the cached config. */
export function resetConfigCache(): void {
  cached = undefined;
  warned = false;
  status = undefined;
}
