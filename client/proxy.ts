/**
 * Next 16 Proxy (formerly Middleware): optimistic route protection.
 * The rules live in lib/auth/gate.ts; this file only adapts the request and response.
 */
import { NextResponse, type NextRequest } from "next/server";
import { legacyAppRedirect } from "@/lib/appPath";
import { getConfig } from "@/lib/config";
import { decide } from "@/lib/auth/gate";
import { ONBOARDED_COOKIE, RETURN_TO_COOKIE } from "@/lib/auth/cookies";

/** Old /app?view= URLs, and the same shape if it shows up as a return path. */
function canonical(to: string, base: string): string {
  const url = new URL(to, base);
  return legacyAppRedirect(url.pathname, url.search) ?? `${url.pathname}${url.search}`;
}

export function proxy(request: NextRequest) {
  const config = getConfig();
  const { pathname, search } = request.nextUrl;
  const here = legacyAppRedirect(pathname, search);
  const path = here ? new URL(here, request.url) : request.nextUrl;
  const decision = decide({
    mode: config.mode,
    pathname: path.pathname,
    search: path.search,
    hasSession: !!request.cookies.get(config.sessionCookie)?.value,
    onboarded: request.cookies.get(ONBOARDED_COOKIE)?.value === "1",
    returnTo: request.cookies.get(RETURN_TO_COOKIE)?.value ?? null,
  });
  if (decision.type === "redirect") {
    const response = NextResponse.redirect(new URL(canonical(decision.to, request.url), request.url), 307);
    if (decision.clearReturnTo) response.cookies.delete(RETURN_TO_COOKIE);
    return response;
  }
  if (here) return NextResponse.redirect(new URL(here, request.url), 308);
  return NextResponse.next();
}

/** "/" is the public home page (the Open Range landing, ENG-87) and is never gated: it's matched only so the
    API's post-login callback, which always lands on FRONTEND_URL "/", can be finished (lib/auth/gate.ts). */
export const config = {
  matcher: ["/", "/app/:path*", "/onboarding/:path*"],
};
