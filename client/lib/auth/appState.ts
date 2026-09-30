/**
 * Design-review states for /app?state= (honoured where review states are: outside production and
 * in the review build, like /sign-in?state=). Plain module so the server page can read it.
 *
 * api-down        the session check failed because the API is down (full-shell fallback)
 * account-loading /me in flight (skeleton account row)
 * no-avatar       a signed-in user without a profile picture (monogram)
 * signout-failed  sign-out fails, to review the toast
 */
export const APP_REVIEW_STATES = ["api-down", "account-loading", "no-avatar", "signout-failed"] as const;
export type AppReviewState = (typeof APP_REVIEW_STATES)[number];

export function appReviewState(state: string | undefined, reviewStates: boolean): AppReviewState | undefined {
  if (!reviewStates) return undefined;
  return APP_REVIEW_STATES.find((s) => s === state);
}
