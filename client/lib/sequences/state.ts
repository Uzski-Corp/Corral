/**
 * Design-review states for sequences and the mailbox pool (M6, ENG-56). Honoured where review
 * states are (outside production and in the review build). Plain module so the server page can read it.
 *
 * /app/sequences?state=
 *   empty        no sequences yet: what a sequence is, Draft one with Corral
 *   loading      list and builder skeletons
 *   error        sequences couldn't load (sending carries on)
 *   draft        a draft: three steps, the waits and conditions between them, what ends it
 *   conditions   the condition menu open on a wait (no reply · opened, no reply · not opened)
 *   editor       step 1 open: variables, and the preview filled in for a real company
 *   copilot      Corral's draft for step 1, citing the knowledge-base lines it used and what it left out
 *   errors       Launch blocked: a variable empty for 23 companies, a step without an unsubscribe link
 *   launch       the Launch dialog: who gets it, when, from which mailboxes
 *   launching    checks and scheduling in progress; nothing sent yet
 *   running      a live sequence: per-step numbers, what sends next
 *   paused       paused by you: what's held, Resume
 *   mailboxes    the mailbox pool: warm-up, health, daily caps, a disconnected mailbox, a bounce spike
 */
export const SEQUENCE_REVIEW_STATES = [
  "empty", "loading", "error", "draft", "conditions", "editor", "copilot", "errors", "launch", "launching", "running", "paused", "mailboxes",
] as const;
export type SequenceReviewState = (typeof SEQUENCE_REVIEW_STATES)[number];

export function sequenceReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): SequenceReviewState | undefined {
  if (!reviewStates || view !== "sequences") return undefined;
  return SEQUENCE_REVIEW_STATES.find((s) => s === state);
}
