/**
 * First-party, non-sensitive cookies the web app owns (the session cookie belongs to the API).
 *
 * - RETURN_TO: where to go after the AuthKit round trip. The API's callback always lands on
 *   FRONTEND_URL, so the app remembers the destination itself for ten minutes.
 * - ONBOARDED: this browser has been through (or left) onboarding. Interim until the API
 *   exposes onboarding state on /me; see the PR notes.
 */
export const RETURN_TO_COOKIE = "corral_return_to";
export const ONBOARDED_COOKIE = "corral_onboarded";
export const RETURN_TO_MAX_AGE_S = 600;
export const ONBOARDED_MAX_AGE_S = 60 * 60 * 24 * 365;

type Doc = Pick<Document, "cookie">;
type Loc = Pick<Location, "protocol">;

function write(doc: Doc, loc: Loc, name: string, value: string, maxAge: number) {
  const secure = loc.protocol === "https:" ? "; Secure" : "";
  doc.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function rememberReturnTo(path: string, doc: Doc = document, loc: Loc = location): void {
  write(doc, loc, RETURN_TO_COOKIE, path, RETURN_TO_MAX_AGE_S);
}

export function markOnboarded(doc: Doc = document, loc: Loc = location): void {
  write(doc, loc, ONBOARDED_COOKIE, "1", ONBOARDED_MAX_AGE_S);
}
