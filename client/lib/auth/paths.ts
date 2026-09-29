/** Route names and the rules for which of them need a session. */

export const SIGN_IN = "/sign-in";
export const APP_HOME = "/app";
export const ONBOARDING = "/onboarding";
/** Where the API's callback lands after a successful sign-in (backend FRONTEND_URL). */
export const POST_LOGIN_LANDING = "/";

export const PROTECTED_PREFIXES = [APP_HOME, ONBOARDING] as const;

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => under(pathname, p));
}

export const isAppPath = (pathname: string) => under(pathname, APP_HOME);

/**
 * A same-origin path we are willing to send someone to after sign-in, or null.
 * Only protected in-app paths qualify, which rules out open redirects (`//evil`, `https://…`,
 * `/\evil`) and loops back to /sign-in.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  // Reject control characters, which browsers strip in surprising ways.
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  let url: URL;
  try {
    url = new URL(value, "http://corral.invalid");
  } catch {
    /* c8 ignore next */
    return null;
  }
  if (url.origin !== "http://corral.invalid" || !isProtected(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

export function signInUrl(returnTo?: string | null): string {
  const next = safeReturnTo(returnTo);
  return next ? `${SIGN_IN}?${new URLSearchParams({ next })}` : SIGN_IN;
}
