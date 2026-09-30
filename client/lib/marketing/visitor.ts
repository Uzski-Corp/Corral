/**
 * Who is reading a marketing page (M10c). The marketing routes stay static HTML for everyone; the nav swaps
 * Sign in / Start for "Open app" and the person's picture or initials after hydration, when this browser
 * has a signed-in hint. Nobody is redirected: people come to / for pricing and security and share links.
 *
 * Where the session comes from: the real session is the API's HttpOnly `wos_session` cookie, which page JS
 * can't read and a static page can't see. So the app leaves a first-party, non-sensitive hint next to it:
 *
 *   corral_visitor = {"name":"Tomás Ibarra","avatarUrl":"https://…"|null}   (URI-encoded JSON, 30 days, Lax)
 *
 * Wiring (Krak): SessionProvider calls rememberVisitor(toAccount(me)) when /me succeeds (it already refreshes
 * every ten minutes, which keeps the hint fresh), and forgetVisitor() on sign-out and on a 401. The hint is only
 * a display cue: "Open app" goes to /app, whose gate still checks the real session, so a stale hint costs one
 * sign-in, never access. No email, role or workspace is written.
 */
export const VISITOR_COOKIE = "corral_visitor";
export const VISITOR_MAX_AGE_S = 60 * 60 * 24 * 30;
export const APP_HREF = "/app";

export type Visitor = { name: string; avatarUrl: string | null };

/** Design-review states on every marketing route (?state=…, review builds only). */
export const MARKETING_REVIEW_STATES = ["signed-out", "signed-in", "signed-in-initials"] as const;
export type MarketingReviewState = (typeof MARKETING_REVIEW_STATES)[number];

/** The sample visitors the review states show. */
export const SAMPLE_VISITORS: Record<Exclude<MarketingReviewState, "signed-out">, Visitor> = {
  "signed-in": { name: "Tomás Ibarra", avatarUrl: "/corral/app/av-tomas.jpg" },
  "signed-in-initials": { name: "Amani Odhiambo", avatarUrl: null },
};

type Doc = Pick<Document, "cookie">;
type Loc = Pick<Location, "protocol">;

/** Parse the hint out of document.cookie. Anything malformed reads as signed out. */
export function readVisitor(cookie: string): Visitor | null {
  const raw = cookie.split(/;\s*/).find((c) => c.startsWith(`${VISITOR_COOKIE}=`));
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(decodeURIComponent(raw.slice(VISITOR_COOKIE.length + 1)));
    if (!v || typeof v !== "object") return null;
    const { name, avatarUrl } = v as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    const url = typeof avatarUrl === "string" && /^(https:\/\/|\/)/.test(avatarUrl) ? avatarUrl : null;
    return { name: name.trim().slice(0, 80), avatarUrl: url };
  } catch {
    return null;
  }
}

export function rememberVisitor(v: Visitor, doc: Doc = document, loc: Loc = location): void {
  const secure = loc.protocol === "https:" ? "; Secure" : "";
  const value = encodeURIComponent(JSON.stringify({ name: v.name, avatarUrl: v.avatarUrl }));
  doc.cookie = `${VISITOR_COOKIE}=${value}; Path=/; Max-Age=${VISITOR_MAX_AGE_S}; SameSite=Lax${secure}`;
}

export function forgetVisitor(doc: Doc = document): void {
  doc.cookie = `${VISITOR_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Which visitor a page shows: a review state wins (review builds only), then the hint cookie. */
export function visitorFor(search: string, cookie: string, reviewStates: boolean): Visitor | null {
  if (reviewStates) {
    const st = new URLSearchParams(search).get("state");
    if (st === "signed-out") return null;
    if (st === "signed-in" || st === "signed-in-initials") return SAMPLE_VISITORS[st];
  }
  return readVisitor(cookie);
}
