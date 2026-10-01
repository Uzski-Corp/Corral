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

/** ENG-87c: the real Terms and Privacy text in Bau's outline, the short addresses, and search rules while TODOs remain. */
test.describe("legal pages", () => {
  test("Terms and Privacy carry the real text", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
    for (const h of ["Agreement to these terms", "Sending email with Corral", "Pages Corral reads from the web", "Intellectual property", "Governing law and disputes"])
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    await expect(page.getByText(/We are Uzski Corp .*registered in Kenya/)).toBeVisible();
    await expect(page.getByText("Outline, not the agreement.")).toHaveCount(0);

    await page.goto("/legal/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
    for (const h of ["What information we collect", "Who we share information with", "Cookies", "How long we keep information", "Your rights and choices"])
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    await expect(page.getByText(/corral_visitor is set by the app/)).toBeVisible();
  });

  test("/terms and /privacy redirect to the /legal pages", async ({ page }) => {
    await page.goto("/terms");
    await expect(page).toHaveURL(/\/legal\/terms$/);
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/legal\/privacy$/);
  });

  test("they stay noindex and out of the sitemap while TODOs for Sean remain", async ({ page, request }) => {
    for (const path of ["/legal/terms", "/legal/privacy"]) {
      await page.goto(path);
      expect(await page.locator('meta[name="robots"]').getAttribute("content"), path).toMatch(/noindex/);
      await expect(page.getByText(/\[TODO for Sean/).first()).toBeVisible();
    }
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).not.toContain("/legal/terms</loc>");
  });
});
