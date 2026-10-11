/**
 * Next 16 Proxy (formerly Middleware): optimistic route protection.
 * The rules live in lib/auth/gate.ts; this file only adapts the request and response.
 */
import { NextResponse, type NextRequest } from "next/server";
import { legacyAppRedirect } from "@/lib/appPath";
import { getConfig } from "@/lib/config";
import { isOpenPath } from "@/lib/marketing/site";
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
  // The app ships later: until CORRAL_APP=1, only the pages the landing links to exist. The review build keeps it.
  const appOn = process.env.CORRAL_APP === "1" || config.mode === "review";
  if (!appOn && !isOpenPath(pathname)) return NextResponse.rewrite(new URL("/_closed", request.url));
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

/** Every page address: the app switch needs to see them all. Next's own files, /api and files with an extension
    (public/ assets, robots.txt, sitemap.xml) never reach it. "/" is never gated by auth: it's matched for the API's
    post-login callback, which always lands on FRONTEND_URL "/" (lib/auth/gate.ts). */
export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
