/**
 * Design-review states for the lead table (M3, ENG-53). Honoured where review states are
 * (outside production and in the review build). Plain module so the server page can read it.
 *
 * /app/companies?state=
 *   loading          first load (skeleton rows at real heights)
 *   error            the table couldn't load
 *   empty            no companies yet: import a CSV or find companies
 *   no-results       filters match nothing
 *   partial          Corral is still scoring part of the list (212 of 1,284 left)
 *   selected         3 rows selected: the bulk bar
 *   select-all       every one of 1,284 selected: the banner and the bulk bar
 *   bulk-confirm     a large bulk action asks first (enroll 1,284 with what gets skipped)
 *   bulk-running     a large bulk action running in the background
 *   status-menu      the status menu open on a selection
 *   detail           a lead open in the detail panel
 *   duplicate        a lead that looks like a duplicate, with the merge choice
 *   import           Import CSV: pick a file
 *   import-file-error the file can't be imported (not a CSV)
 *   import-map       column mapping, all guessed right
 *   import-map-errors mapping problems: no company column, two columns on one field
 *   import-review    duplicates and bad rows, with the duplicate policy
 *   import-running   importing in the background
 *   import-done      the summary, and "Make a segment from this import"
 *   stale            (M4) contact details older than their freshness window: banner, stale marks, Re-check
 *   provenance       (M4) a lead open with the email's evidence chain expanded
 *   fit              (M5) a lead open on "Why it scored 94": every check with its evidence
 *   fit-scoring      (M5) scores being worked out: the bar sweeps, the panel reads pages
 *   fit-none         (M5) companies not scored yet (queued, or no website)
 *   fit-low          (M5) a low-confidence score: checks with no evidence, and the ceiling
 *   fit-changed      (M5) scores that moved since last time, and why
 *   fit-override     (M5) a fit you set yourself, next to Corral's
 *   fit-disagree     (M5) you told Corral the score is wrong; it re-reads with your note
 *   fit-error        (M5) scoring failed; the last score stands
 *   meeting-booked | meeting-rescheduled | meeting-cancelled | meeting-no-show | deal-error | deal-duplicate | nurture-off
 *                    (M8) Nyota Beverages open on its meeting and handoffs; same names as in the Unibox (lib/handoff/state.ts)
 * /app/segments?state=
 *   builder          edit the segment's rules with the live count
 *   builder-empty    rules that match nothing
 *   builder-error    an unfinished rule and a bad value
 *   loading | error  as above, for the segment
 */
import { HANDOFF_REVIEW_STATES } from "@/lib/handoff/state";
export const LEADS_REVIEW_STATES = [
  "loading", "error", "empty", "no-results", "partial", "selected", "select-all", "bulk-confirm", "bulk-running", "status-menu",
  "detail", "duplicate", "import", "import-file-error", "import-map", "import-map-errors", "import-review", "import-running", "import-done",
  "stale", "provenance",
  "fit", "fit-scoring", "fit-none", "fit-low", "fit-changed", "fit-override", "fit-disagree", "fit-error",
  ...HANDOFF_REVIEW_STATES,
] as const;
export const SEGMENT_REVIEW_STATES = ["builder", "builder-empty", "builder-error", "loading", "error", "selected", "detail"] as const;
export type LeadsReviewState = (typeof LEADS_REVIEW_STATES)[number] | (typeof SEGMENT_REVIEW_STATES)[number];

export function leadsReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): LeadsReviewState | undefined {
  if (!reviewStates) return undefined;
  if (view === "companies") return LEADS_REVIEW_STATES.find((s) => s === state);
  if (view === "segments") return SEGMENT_REVIEW_STATES.find((s) => s === state);
  return undefined;
}
