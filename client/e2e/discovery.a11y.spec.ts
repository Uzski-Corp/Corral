import { expect, test } from "@playwright/test";
import { DISCOVERY_REVIEW_STATES } from "../lib/discovery/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe on the M4 discovery view, live and in its 13 review states (HANDOFF-ENG.md §12), at 1440 and 390.
 * Review project: `?state=` is off in production builds and there is no discovery API yet (ENG-82).
 */
const STATES: (string | undefined)[] = [undefined, ...DISCOVERY_REVIEW_STATES];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const state of STATES) {
      test(`discovery ${state ?? "(live)"} has no axe violations`, async ({ page }) => {
        await page.goto(`/app?view=discovery${state ? `&state=${state}` : ""}`);
        await expect(page.locator(".c-app").first()).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
