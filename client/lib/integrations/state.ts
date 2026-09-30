/**
 * Design-review states for Settings → Integrations (M8, ENG-58). Honoured where review states are
 * (outside production and in the review build). Plain module so the server page can read it.
 *
 * /app?view=settings&state=
 *   integrations      the three, all connected, and how a lead is handed from one to the next
 *   none              nothing connected yet: what each one is for
 *   connect-cal       Connect Cal.com: what Corral may do, before you go to cal.com
 *   connecting        waiting for Cal.com to send you back
 *   connect-erp       Connect Phoenix ERP: the address, the signing secret Corral made, a test deal
 *   connect-erp-failed the test deal failed: Phoenix answered 401, and what to check
 *   connect-autosend  Connect AutoSend, back from sign-in: pick the project and the sender
 *   connected         Cal.com open: connected, what it does, the event type in drafts
 *   reauth            Cal.com's sign-in expired: one booking waiting, Reconnect
 *   error             Phoenix is refusing deals (401 since 08:12): retrying, what to fix
 *   disconnect        Disconnect Phoenix ERP? what stops and what stays
 *   logs              Phoenix's log: every push and what came back, one failure open
 *   mapping           Phoenix field mapping with the payload for Grace
 *   mapping-errors    a required field with nothing in it, and a number going into a text field
 *   scopes            Cal.com's permissions: what Corral can do, what it never does, where the key lives
 *   autosend          AutoSend open: its role (after the reply, never cold) and its journeys
 *   loading           skeleton rows
 *   load-error        the page couldn't load; nothing was disconnected
 */
export const SETTINGS_REVIEW_STATES = [
  "integrations", "none", "connect-cal", "connecting", "connect-erp", "connect-erp-failed", "connect-autosend",
  "connected", "reauth", "error", "disconnect", "logs", "mapping", "mapping-errors", "scopes", "autosend", "loading", "load-error",
] as const;
export type SettingsReviewState = (typeof SETTINGS_REVIEW_STATES)[number];

export function settingsReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): SettingsReviewState | undefined {
  if (!reviewStates || view !== "settings") return undefined;
  return SETTINGS_REVIEW_STATES.find((s) => s === state);
}
