/**
 * Route gating as a pure function, so every rule is unit-tested without a server.
 * proxy.ts feeds it the request; it answers "carry on" or "redirect here".
 *
 * This is the optimistic check the Next 16 auth guide recommends for Proxy: it only looks at
 * whether a session cookie exists. The API validates the session on every call, and the
 * SessionProvider confirms it with /me and sends a stale session back to sign-in.
 */
import type { AuthMode } from "../config";
import { APP_HOME, ONBOARDING, POST_LOGIN_LANDING, isAppPath, isProtected, safeReturnTo, signInUrl } from "./paths";

export type GateInput = {
  mode: AuthMode;
  pathname: string;
  /** Query string including the leading "?", or "". */
  search: string;
  hasSession: boolean;
  onboarded: boolean;
  /** Raw value of the return-to cookie, if any. */
  returnTo: string | null;
};

export type GateDecision =
  | { type: "next" }
  | { type: "redirect"; to: string; clearReturnTo: boolean };

/** New workspaces go through onboarding before the app; everyone else goes where they asked. */
function withOnboarding(target: string, onboarded: boolean): string {
  const path = target.split("?")[0];
  return !onboarded && isAppPath(path) ? ONBOARDING : target;
}

export function decide(i: GateInput): GateDecision {
  if (i.mode === "review") return { type: "next" };

  if (isProtected(i.pathname) && !i.hasSession) {
    return { type: "redirect", to: signInUrl(`${i.pathname}${i.search}`), clearReturnTo: false };
  }

  // The API callback lands here after sign-in. Finish the trip the sign-in page started.
  if (i.pathname === POST_LOGIN_LANDING && i.hasSession && i.returnTo !== null) {
    const target = safeReturnTo(i.returnTo) ?? APP_HOME;
    return { type: "redirect", to: withOnboarding(target, i.onboarded), clearReturnTo: true };
  }

  if (i.hasSession && isAppPath(i.pathname) && !i.onboarded) {
    return { type: "redirect", to: ONBOARDING, clearReturnTo: false };
  }

  return { type: "next" };
}
