/**
 * Design-review states for handoffs (M8, ENG-58), shown in the thread (/app?view=unibox&state=…) and on the
 * lead (/app?view=companies&state=…), with the same names in both. Grace Holloway, Nyota Beverages.
 *
 *   meeting-booked       Grace booked through Cal.com: sequence stopped, deal opened in Phoenix, AutoSend's "before your call" set
 *   meeting-rescheduled  she moved it to Mon 5 Oct: the deal's meeting time and the AutoSend email move with it
 *   meeting-cancelled    she cancelled: back to Lead in Phoenix (still open), AutoSend stopped, Corral drafts a rebook note
 *   meeting-no-show      nobody from Nyota joined: marked no-show, AutoSend paused, Corral drafts a personal follow-up
 *   deal-error           Phoenix refused the push (401, signature): retrying, the meeting is safe
 *   deal-duplicate       Phoenix already has Nyota with an open deal: you choose, Corral never merges on its own
 *   nurture-off          AutoSend isn't connected: the "before your call" email waits; cold mailboxes never send it
 */
export const HANDOFF_REVIEW_STATES = [
  "meeting-booked", "meeting-rescheduled", "meeting-cancelled", "meeting-no-show", "deal-error", "deal-duplicate", "nurture-off",
] as const;
export type HandoffReviewState = (typeof HANDOFF_REVIEW_STATES)[number];
export const isHandoffState = (s: string | undefined): s is HandoffReviewState => HANDOFF_REVIEW_STATES.some((x) => x === s);
