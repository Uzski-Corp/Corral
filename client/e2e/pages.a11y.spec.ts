import { expect, test } from "@playwright/test";
import { audit, WIDTHS } from "./axe";

/**
 * axe on the top-level pages in the review build (no auth, Bau's sample data), at 1440 and 390:
 * the styleguide and its share-card sheet (M10), the app's default view, the knowledge base, sign-in and onboarding. The signed-in
 * flows against the mock API are covered by a11y.spec.ts in the "app" project.
 */
const PAGES: [path: string, ready: string][] = [
  ["/styleguide", "main, body"],
  ["/styleguide/share", "main, body"],
  ["/styleguide/landings", "main"],
  ["/app", ".c-app"],
  ["/app?view=knowledge", ".c-app"],
  ["/sign-in", ".s-auth"],
  ["/onboarding", ".c-app, body"],
];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const [path, ready] of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator(ready).first()).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
