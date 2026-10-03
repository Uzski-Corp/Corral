/**
 * Design-review states for Settings → Integrations (M8, ENG-58). Honoured where review states are
 * (outside production and in the review build). Plain module so the server page can read it.
 *
 * /app/settings?state=
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
 * Team and Billing (M13)
 *   team              the members: you (owner), a member, an invite still pending; a row menu each; Invite
 *   team-solo         only you: "Just you so far" and Invite
 *   team-invite       the Invite dialog (emails, role)
 *   team-loading      skeleton rows
 *   billing           no plan yet: the three plans with {price} placeholders, or talk to us
 *   billing-loading   skeleton
 * A connected integration from real data (M14): no sample account, logs or mapping
 *   int-connected     Cal.com: the account, connected since, by whom, Disconnect; recent activity
 *   int-quiet         AutoSend connected, nothing yet: "No activity yet" with Send a test
 *   int-quiet-cal     Cal.com connected, nothing yet (no test: Cal.com can't take one)
 *   int-mapping       Phoenix with no saved mapping: the defaults as editable rows, tagged Defaults
 *   int-logs          Phoenix activity: time, event, status tag, one line each
 *   int-logs-loading  skeleton rows
 *   int-expired       Cal.com's sign-in expired: Failed, one line, Reconnect
 *   int-reconnecting  Reconnect pressed: Connecting until the sign-in comes back
 */
export const SETTINGS_REVIEW_STATES = [
  "integrations", "none", "connect-cal", "connecting", "connect-erp", "connect-erp-failed", "connect-autosend",
  "connected", "reauth", "error", "disconnect", "logs", "mapping", "mapping-errors", "scopes", "autosend", "loading", "load-error",
  /* M13: Settings → Team and Billing */
  "team", "team-solo", "team-invite", "team-loading", "billing", "billing-loading",
  /* M14: a connected integration from real data */
  "int-connected", "int-quiet", "int-quiet-cal", "int-mapping", "int-logs", "int-logs-loading", "int-expired", "int-reconnecting",
] as const;
export type SettingsReviewState = (typeof SETTINGS_REVIEW_STATES)[number];

export function settingsReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): SettingsReviewState | undefined {
  if (!reviewStates || view !== "settings") return undefined;
  return SETTINGS_REVIEW_STATES.find((s) => s === state);
}
