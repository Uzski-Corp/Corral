/**
 * Next 16 Proxy (formerly Middleware): optimistic route protection.
 * The rules live in lib/auth/gate.ts; this file only adapts the request and response.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { decide } from "@/lib/auth/gate";
import { ONBOARDED_COOKIE, RETURN_TO_COOKIE } from "@/lib/auth/cookies";

export function proxy(request: NextRequest) {
  const config = getConfig();
  const { pathname, search } = request.nextUrl;
  const decision = decide({
    mode: config.mode,
    pathname,
    search,
    hasSession: !!request.cookies.get(config.sessionCookie)?.value,
    onboarded: request.cookies.get(ONBOARDED_COOKIE)?.value === "1",
    returnTo: request.cookies.get(RETURN_TO_COOKIE)?.value ?? null,
  });
  if (decision.type === "next") return NextResponse.next();
  const response = NextResponse.redirect(new URL(decision.to, request.url), 307);
  if (decision.clearReturnTo) response.cookies.delete(RETURN_TO_COOKIE);
  return response;
}

/** "/" is the public home page (the Open Range landing, ENG-87) and is never gated: it's matched only so the
    API's post-login callback, which always lands on FRONTEND_URL "/", can be finished (lib/auth/gate.ts). */
export const config = {
  matcher: ["/", "/app/:path*", "/onboarding/:path*"],
};
