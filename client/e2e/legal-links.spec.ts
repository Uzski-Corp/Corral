import { expect, test } from "./fixtures";

/** The sign-in page's "By continuing you agree to the Terms and Privacy Policy" links reach real pages (not #anchors). */
test("sign-in's Terms and Privacy links resolve to the legal pages", async ({ page }) => {
  await page.goto("/sign-in");
  for (const [name, href] of [["Terms", "/legal/terms"], ["Privacy Policy", "/legal/privacy"]] as const) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", href);
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
  }
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
