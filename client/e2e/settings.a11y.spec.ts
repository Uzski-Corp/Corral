import { expect, test } from "@playwright/test";
import { SETTINGS_REVIEW_STATES } from "../lib/integrations/state";
import { MCP_REVIEW_STATES } from "../lib/mcp/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe on Settings, at 1440 and 390: /app?view=settings live, the 18 M8 Integrations states (Cal.com, Phoenix ERP,
 * AutoSend: connect, health, logs, mapping, permissions; HANDOFF-ENG.md §16) and the 25 M9 Developers states
 * (MCP connections, API keys and in-app docs: the mcp-, keys- / key- and docs- states; §17), on the same `?view=settings&state=` route.
 * Review project: `?state=` is off in production builds and there is no integrations or MCP API yet (ENG-86, ENG-88).
 */
const ROUTES = ["/app?view=settings", ...[...SETTINGS_REVIEW_STATES, ...MCP_REVIEW_STATES].map((s) => `/app?view=settings&state=${s}`)];

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
