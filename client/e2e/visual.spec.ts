import { expect, signInWithGoogle, test } from "./fixtures";

/**
 * Visual regression against Bau's M1 screens as built (the code is the design, HANDOFF-ENG.md).
 * Baselines live in e2e/__screenshots__. They are platform-specific: regenerate with
 * `pnpm test:e2e --update-snapshots` on the CI image when that lands (ENG-89).
 */
test("sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Corral" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("sign-in.png", { fullPage: true });
});

test("sign-in failure", async ({ page }) => {
  await page.goto("/sign-in?error=auth_failed");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("sign-in-error.png", { fullPage: true });
});

test("onboarding and app shell", async ({ page, mockApi }) => {
  void mockApi;
  await page.goto("/sign-in");
  await signInWithGoogle(page);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("onboarding-step-1.png");
  await page.getByRole("button", { name: "Save and exit" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("app-unibox.png");
});

test("companies table", async ({ page, mockApi, onboarded }) => {
  void mockApi;
  await onboarded();
  await page.goto("/sign-in?next=%2Fapp%3Fview%3Dcompanies");
  await signInWithGoogle(page);
  await expect(page.getByRole("table", { name: /^Segment:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("app-companies.png");
});
