import { expect, test } from "@playwright/test";
import { LEADS_REVIEW_STATES, SEGMENT_REVIEW_STATES } from "../lib/leads/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe on the M3 lead table, segment builder and CSV import, live and in every review state from
 * HANDOFF-ENG.md §11 (plus the M4 companies `stale` and `provenance` states, §12, and the 7 M8 handoff states
 * on Nyota Beverages' lead, §16), at 1440 and 390.
 * Runs in the "review" project (NEXT_PUBLIC_DESIGN_REVIEW=1), because `?state=` is off in production
 * builds and there is no leads API yet (ENG-81). Reduced motion keeps entrance fades out of the contrast check.
 */
const ROUTES: [view: string, state: string | undefined][] = [
  ["companies", undefined], ...LEADS_REVIEW_STATES.map((s): [string, string] => ["companies", s]),
  ["segments", undefined], ...SEGMENT_REVIEW_STATES.map((s): [string, string] => ["segments", s]),
];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const [view, state] of ROUTES) {
      test(`${view} ${state ?? "(live)"} has no axe violations`, async ({ page }) => {
        await page.goto(`/app?view=${view}${state ? `&state=${state}` : ""}`);
        await expect(page.locator(".c-app").first()).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
