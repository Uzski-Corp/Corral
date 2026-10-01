import { expect, test } from "@playwright/test";
import { SEQUENCE_REVIEW_STATES } from "../lib/sequences/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe on the M6 sequence builder, step editor, copilot and mailbox pool: /app/sequences live and in its
 * 13 review states (HANDOFF-ENG.md §14), at 1440 and 390. Review project: `?state=` is off in production
 * builds and there is no sequences API yet (ENG-84).
 */
const STATES: (string | undefined)[] = [undefined, ...SEQUENCE_REVIEW_STATES];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const state of STATES) {
      test(`sequences ${state ?? "(live)"} has no axe violations`, async ({ page }) => {
        await page.goto(`/app/sequences${state ? `?state=${state}` : ""}`);
        await expect(page.locator(".c-app").first()).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
