import { expect, test } from "@playwright/test";
import { SETTINGS_REVIEW_STATES } from "../lib/integrations/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe on the M8 Settings → Integrations page (Cal.com, Phoenix ERP, AutoSend: connect, health, logs,
 * mapping, permissions): /app?view=settings live and its 18 review states (HANDOFF-ENG.md §16), at 1440 and 390.
 * Review project: `?state=` is off in production builds and there is no integrations API yet (ENG-86).
 */
const ROUTES = ["/app?view=settings", ...SETTINGS_REVIEW_STATES.map((s) => `/app?view=settings&state=${s}`)];

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
