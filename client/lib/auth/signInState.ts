/**
 * Which sign-in screen to show, from the URL.
 *
 * Real failures arrive from the API callback as `?error=<code>`. Bau's review states arrive as
 * `?state=sent|error|invalid|cancelled|unavailable` and the code states (`code-verifying|code-wrong|code-expired|
 * code-resent|resend-limited|verify-limited|code-failed|change-email`, ENG-80), honoured outside production (and in the review build).
 */
import type { SignInState } from "@/components/app/screens/SignIn";

/** Codes the API callback redirects with (server/app/auth/routes.py). */
export const CALLBACK_ERRORS = ["provider_error", "invalid_request", "invalid_state", "auth_failed", "auth_unavailable"] as const;
export type CallbackError = (typeof CALLBACK_ERRORS)[number];

export const REVIEW_STATES: SignInState[] = [
  "sent", "error", "invalid", "cancelled", "unavailable",
  "code-verifying", "code-wrong", "code-expired", "code-resent", "resend-limited", "verify-limited", "code-failed", "change-email",
];

/**
 * Which failure screen each callback code gets (M1 follow-up 3):
 * provider_error: the person backed out at Google, friendly retry · auth_unavailable: AuthKit is down,
 * status screen · everything else: the "that sign-in didn't finish / start again" banner.
 */
export function screenForError(code: CallbackError | "unknown"): SignInState {
  if (code === "provider_error") return "cancelled";
  if (code === "auth_unavailable") return "unavailable";
  return "error";
}

export type SignInView = { initial: SignInState; callbackError: CallbackError | "unknown" | null };

export function signInView(params: { state?: string; error?: string }, reviewStates: boolean): SignInView {
  if (params.error) {
    const known = (CALLBACK_ERRORS as readonly string[]).includes(params.error);
    const code = known ? (params.error as CallbackError) : "unknown";
    return { initial: screenForError(code), callbackError: code };
  }
  if (reviewStates) {
    const s = REVIEW_STATES.find((x) => x === params.state);
    if (s) return { initial: s, callbackError: null };
  }
  return { initial: "default", callbackError: null };
}
