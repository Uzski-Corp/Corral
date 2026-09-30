import { expect, test } from "@playwright/test";

/**
 * The M10b knowledge-base source failures (ENG-66, backend PR #67) in the review build: what each shows and the
 * one recovery it offers. `failure` / `failure_stage` are the server's codes, shown as-is in What happened.
 */
const kb = (state: string) => `/app?view=knowledge&state=${state}`;

test.describe("KB source failures (M10b)", () => {
  test("interrupted at embed: Try again first, the file is kept, What happened open", async ({ page }) => {
    await page.goto(kb("interrupted"));
    await expect(page.getByText("Reading stopped").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Replace instead" })).toBeVisible();
    const why = page.locator("details.k-why").first();
    await expect(why).toHaveAttribute("open", "");
    await expect(why).toContainText("failure: interrupted · failure_stage: embed");
    await expect(why).toContainText("Kept. You won’t need to upload it again.");
  });

  test("unreadable at parse: Replace file, What happened closed until asked", async ({ page }) => {
    await page.goto(kb("unreadable"));
    await expect(page.getByText("Corral couldn’t read this file").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Replace file" }).first()).toBeVisible();
    const why = page.locator("details.k-why").first();
    await expect(why).not.toHaveAttribute("open", "");
    await why.getByText("What happened").click();
    await expect(why).toContainText("failure: unreadable · failure_stage: parse");
  });

  test("partial: used and skipped as numbers and as a page strip, with the text-version fix", async ({ page }) => {
    await page.goto(kb("partial"));
    await expect(page.getByText(/\d+ of \d+ pages used · \d+ skipped/).first()).toBeVisible();
    await expect(page.getByLabel(/\d+ pages used, \d+ skipped/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload a text version" }).first()).toBeVisible();
  });
});
