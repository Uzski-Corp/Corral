/**
 * One status vocabulary for work Corral does in the background (M13, gap 6): discovery runs and sequence launches
 * read the same tag for the same thing, and the words match what the server stores.
 *
 *   server       tag                    tone       dot
 *   queued       Queued                 neutral    hollow   accepted, nothing has started (behind another run, or the worker hasn't picked it up)
 *   queued+mbx   Waiting for mailbox    caution    hollow   a launched sequence with no mailbox to send from
 *   running      Running / Sending      info       pulse    work under way (discovery reads; a sequence hands its first batch out)
 *   live         Live                   positive   solid    a sequence that is sending on schedule
 *   paused       Paused                 caution    none
 *   done         Done                   neutral    none     (Done · some skipped in caution, No results in neutral)
 *   failed       Failed                 negative   none
 *   cancelled    Cancelled              neutral    none
 *   draft        Draft                  neutral    none
 *
 * "Started" is never a status: a run is Queued until the server says it is running.
 */
export type StatusTone = "neutral" | "info" | "positive" | "caution" | "negative";
export type StatusDot = "hollow" | "pulse" | "solid" | "none";
export type StatusKind =
  | "draft" | "checking" | "queued" | "waiting-mailbox" | "running" | "sending" | "live"
  | "paused" | "done" | "done-partial" | "no-results" | "failed" | "cancelled";

export const STATUS_TAG: Record<StatusKind, { label: string; tone: StatusTone; dot: StatusDot }> = {
  draft: { label: "Draft", tone: "neutral", dot: "none" },
  checking: { label: "Checking", tone: "info", dot: "pulse" },
  queued: { label: "Queued", tone: "neutral", dot: "hollow" },
  "waiting-mailbox": { label: "Waiting for mailbox", tone: "caution", dot: "hollow" },
  running: { label: "Running", tone: "info", dot: "pulse" },
  sending: { label: "Sending", tone: "info", dot: "pulse" },
  live: { label: "Live", tone: "positive", dot: "solid" },
  paused: { label: "Paused", tone: "caution", dot: "none" },
  done: { label: "Done", tone: "neutral", dot: "none" },
  "done-partial": { label: "Done · some skipped", tone: "caution", dot: "none" },
  "no-results": { label: "No results", tone: "neutral", dot: "none" },
  failed: { label: "Failed", tone: "negative", dot: "none" },
  cancelled: { label: "Cancelled", tone: "neutral", dot: "none" },
};
