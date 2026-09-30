import { expect, test } from "@playwright/test";

/**
 * The M10 marketing site's contract in the production build (ENG-60): titles, canonicals, share images,
 * noindex on the legal stubs and the 404, robots.txt, sitemap.xml and the shared site navigation.
 */
const SHARED = ["/pricing", "/security", "/mcp", "/changelog"] as const;
const OG = ["/open-range", "/fenceline", ...SHARED] as const;
const LEGAL = ["/legal/terms", "/legal/privacy", "/legal/dpa"] as const;

/** A meta tag's content, or null when the page doesn't have it (no waiting). */
async function meta(page: import("@playwright/test").Page, attr: "name" | "property", key: string) {
  const tag = page.locator(`meta[${attr}="${key}"]`);
  return (await tag.count()) ? tag.first().getAttribute("content") : null;
}

test.describe("marketing site", () => {
  test("shared pages use the title template and a canonical", async ({ page }) => {
    const titles: Record<(typeof SHARED)[number], string> = { "/pricing": "Pricing · Corral", "/security": "Security · Corral", "/mcp": "MCP server · Corral", "/changelog": "Changelog · Corral" };
    for (const path of SHARED) {
      await page.goto(path);
      await expect(page).toHaveTitle(titles[path]);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(new RegExp(`${path}$`));
      expect(await meta(page, "name", "robots")).toBeNull();
    }
  });

  test("the landings keep their absolute titles", async ({ page }) => {
    await page.goto("/open-range");
    await expect(page).toHaveTitle("Corral · The right fifty, already read.");
    await page.goto("/fenceline");
    await expect(page).toHaveTitle("Corral · Gather the few who fit.");
  });

  test("every page ships a JPEG share image with alt text", async ({ page, request }) => {
    for (const path of OG) {
      await page.goto(path);
      const og = await meta(page, "property", "og:image");
      expect(og, path).toMatch(/opengraph-image\.jpg/);
      expect(await meta(page, "property", "og:image:alt"), path).toBeTruthy();
      expect(await meta(page, "name", "twitter:card"), path).toBe("summary_large_image");
      const res = await request.get(new URL(og!).pathname);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toBe("image/jpeg");
    }
  });

  test("the legal stubs and the 404 stay out of search", async ({ page }) => {
    for (const path of LEGAL) {
      await page.goto(path);
      expect(await meta(page, "name", "robots"), path).toMatch(/noindex/);
    }
    await page.goto("/no-such-page");
    expect(await meta(page, "name", "robots")).toMatch(/noindex/);
    expect((await page.goto("/legal/nope"))?.status()).toBe(404);
  });

  test("robots.txt keeps the app out and points at the sitemap", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const p of ["/app", "/onboarding", "/styleguide"]) expect(body).toContain(`Disallow: ${p}`);
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test("sitemap.xml lists the public pages, not sign-in or the legal stubs", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    for (const p of ["/open-range", "/fenceline", ...SHARED]) expect(body).toContain(`${p}</loc>`);
    for (const p of ["/sign-in", ...LEGAL]) expect(body).not.toContain(`${p}</loc>`);
  });

  test("the site nav reaches every shared page", async ({ page }) => {
    await page.goto("/changelog");
    for (const [label, path] of [["Pricing", "/pricing"], ["Security", "/security"], ["MCP", "/mcp"], ["Changelog", "/changelog"]] as const) {
      await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });
});
