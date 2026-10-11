import { expect, test } from "@playwright/test";
import { audit, WIDTHS } from "./axe";

/**
 * axe (WCAG 2.1 A/AA, no skipped rules) on the M10 marketing site in the production build, at 1440 and 390
 * (ENG-60): / (the Agent landing, promoted from /v/4), /fenceline, /pricing, /security, /mcp, /changelog, the three legal stubs and the custom 404.
 * The site has no review states, so it runs in the "app" project against `next start`.
 */
const PAGES: [path: string, h1: RegExp][] = [
  ["/", /Put an AI agent on lead generation/],
  ["/fenceline", /./],
  ["/pricing", /Pay for the ground/],
  ["/security", /./],
  ["/mcp", /Corral, from the tools/],
  ["/changelog", /What’s new in Corral\./],
  ["/legal/terms", /./],
  ["/legal/privacy", /./],
  ["/legal/dpa", /./],
];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const [path, h1] of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: h1 }).first()).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }

    test("the 404 page has no axe violations", async ({ page }) => {
      const res = await page.goto("/no-such-page");
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "This page swam off." })).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });
  });
}
