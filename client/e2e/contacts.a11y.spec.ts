import { expect, test, type Page } from "@playwright/test";
import { CONTACTS_REVIEW_STATES, type ContactsReviewState } from "../lib/contacts/state";
import { audit, WIDTHS } from "./axe";

/**
 * axe (WCAG 2.1 A/AA, no skipped rules) on the M10 Contacts states, at 1440 and 390 (ENG-60): loading, empty and
 * error on /app?view=contacts&state=. Review project: `?state=` is off in production builds and there is no contacts API yet.
 */
const READY: Record<ContactsReviewState, (page: Page) => Promise<void>> = {
  loading: (p) => expect(p.getByLabel("Loading contacts").first()).toBeVisible(),
  empty: (p) => expect(p.getByText("No contacts yet", { exact: true })).toBeVisible(),
  error: (p) => expect(p.getByText("Couldn’t load contacts").first()).toBeVisible(),
};

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const state of CONTACTS_REVIEW_STATES) {
      test(`contacts ${state} has no axe violations`, async ({ page }) => {
        await page.goto(`/app?view=contacts&state=${state}`);
        await expect(page.locator(".c-app").first()).toBeVisible();
        await READY[state](page);
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}

test("contacts empty sends you to Find companies", async ({ page }) => {
  await page.goto("/app?view=contacts&state=empty");
  await page.getByRole("button", { name: "Find companies" }).click();
  await expect(page.getByText("No contacts yet", { exact: true })).toBeHidden();
});
