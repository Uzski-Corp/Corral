/**
 * Design-review states for discovery (M4, ENG-54). Honoured where review states are (outside
 * production and in the review build). Plain module so the server page can read it.
 *
 * /app?view=discovery&state=
 *   empty          no runs yet: "Find companies that fit ColdTrace Sensors"
 *   loading        runs list and run panel skeletons
 *   error          the runs couldn't load
 *   new            New run: criteria from the knowledge base, limits, credit estimate
 *   new-error      New run with problems: no country picked, not enough credits
 *   queued         a run waiting for the one ahead of it
 *   running        a run mid-way: stages, results arriving, enrichment per row
 *   done           a finished run: summary, results, make a segment
 *   partial        finished, but some sites couldn't be read (by reason, with retry)
 *   failed         stopped at a stage (search provider down): what's kept, resume
 *   rate-limited   paused by a provider limit (Hunter 429): countdown, resumes by itself
 *   zero           finished with no companies: why, and what to change
 *   detail         a result open in the detail rail with provenance per field
 */
export const DISCOVERY_REVIEW_STATES = [
  "empty", "loading", "error", "new", "new-error", "queued", "running", "done", "partial", "failed", "rate-limited", "zero", "detail",
] as const;
export type DiscoveryReviewState = (typeof DISCOVERY_REVIEW_STATES)[number];

export function discoveryReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): DiscoveryReviewState | undefined {
  if (!reviewStates || view !== "discovery") return undefined;
  return DISCOVERY_REVIEW_STATES.find((s) => s === state);
}
