/**
 * Design-review states for the Unibox (M7, ENG-57). Honoured where review states are (outside
 * production and in the review build). Plain module so the server page can read it.
 *
 * /app?state=
 *   panes         three panes: filters and triage over the list, the thread, lead context
 *   filtered      filtered to Interested + Objection, unread only; Clear
 *   triage-menu   the triage menu open on Brian's thread: six kinds, keys 1–6, what each does
 *   referral      Sofia forwards to Aline: Corral found her and drafted the intro
 *   ooo           Daniel is out until 14 Oct: sequence paused, nothing to send
 *   unsubscribe   Neema asks to be removed: every sequence stopped, handled by Corral
 *   bounce        a bounce from mwanzafish.co.tz: address marked bad, another contact found
 *   thread        Wanjiru's thread: earlier steps, lead context and fit (M5), the sequence (M6)
 *   keys          the keyboard shortcuts sheet
 *   drafting      Corral is drafting: reading the thread, checking the knowledge base
 *   draft         a draft ready, each claim citing its knowledge-base line
 *   low           low confidence: the knowledge base doesn't answer, so the draft asks
 *   refused       Corral won't draft: the reply asks for claims on the Never-say list
 *   edited        your edit: what changed, and a price the knowledge base disagrees on
 *   undo          sent, cancellable for 10 seconds
 *   sending       sending from the thread's mailbox
 *   sent          sent: in the thread, sequence stays stopped
 *   failed        the mailbox provider refused; the reply is kept
 *   disconnected  the thread's mailbox is disconnected (M6 pool); Reconnect
 *   conflict      a teammate replied while you were writing
 *   conflict-lead the lead wrote again while you were writing (M9): Redraft, Edit mine, Send mine anyway
 *   empty         nothing needs you
 *   loading       list and thread skeletons
 *   error         the Unibox couldn't load
 * M8 (ENG-58) adds the handoff states on Grace's thread, same names as on the lead: meeting-booked |
 *   meeting-rescheduled | meeting-cancelled | meeting-no-show | deal-error | deal-duplicate | nurture-off (see lib/handoff/state.ts)
 */
import { HANDOFF_REVIEW_STATES } from "@/lib/handoff/state";

export const UNIBOX_REVIEW_STATES = [
  "panes", "filtered", "triage-menu", "referral", "ooo", "unsubscribe", "bounce", "thread", "keys",
  "drafting", "draft", "low", "refused", "edited", "undo", "sending", "sent", "failed", "disconnected", "conflict", "conflict-lead",
  "empty", "loading", "error",
  ...HANDOFF_REVIEW_STATES,
] as const;
export type UniboxReviewState = (typeof UNIBOX_REVIEW_STATES)[number];

export function uniboxReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): UniboxReviewState | undefined {
  if (!reviewStates || view !== "unibox") return undefined;
  return UNIBOX_REVIEW_STATES.find((s) => s === state);
}
