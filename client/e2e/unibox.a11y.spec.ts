import { expect, test } from "@playwright/test";
import { UNIBOX_REVIEW_STATES } from "../lib/unibox/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe on the M7 Unibox (panes, triage, thread view, copilot draft and reply states) at 1440 and 390:
 * /app (Unibox is the default view), /app?view=unibox live, and its 30 review states: the 23 from
 * HANDOFF-ENG.md §15 plus the 7 M8 handoff states (meeting booked/moved/cancelled/no-show, deal error and
 * duplicate, nurture off; §16), spread from HANDOFF_REVIEW_STATES into UNIBOX_REVIEW_STATES.
 * Review project: `?state=` is off in production builds and there is no Unibox API yet (ENG-85).
 */
const ROUTES = ["/app", "/app?view=unibox", ...UNIBOX_REVIEW_STATES.map((s) => `/app?view=unibox&state=${s}`)];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const route of ROUTES) {
      test(`${route} has no axe violations`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator(".c-app").first()).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
