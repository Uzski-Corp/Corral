/**
 * Which sign-in screen to show, from the URL.
 *
 * Real failures arrive from the API callback as `?error=<code>`. Bau's review states arrive as
 * `?state=sent|error|invalid` and are honoured outside production (and in the review build).
 */
import type { SignInState } from "@/components/app/screens/SignIn";

/** Codes the API callback redirects with (server/app/auth/routes.py). */
export const CALLBACK_ERRORS = ["provider_error", "invalid_request", "invalid_state", "auth_failed", "auth_unavailable"] as const;
export type CallbackError = (typeof CALLBACK_ERRORS)[number];

const REVIEW_STATES: SignInState[] = ["sent", "error", "invalid"];

export type SignInView = { initial: SignInState; callbackError: CallbackError | "unknown" | null };

export function signInView(params: { state?: string; error?: string }, reviewStates: boolean): SignInView {
  if (params.error) {
    const known = (CALLBACK_ERRORS as readonly string[]).includes(params.error);
    // The design has one failure screen: the "expired link" banner with a way to try again.
    return { initial: "error", callbackError: known ? (params.error as CallbackError) : "unknown" };
  }
  if (reviewStates) {
    const s = REVIEW_STATES.find((x) => x === params.state);
    if (s) return { initial: s, callbackError: null };
  }
  return { initial: "default", callbackError: null };
}
