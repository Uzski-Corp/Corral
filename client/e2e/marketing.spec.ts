import { expect, test } from "@playwright/test";

/**
 * The M10 marketing site's contract in the production build (ENG-60): titles, canonicals, share images,
 * noindex on the legal stubs and the 404, robots.txt, sitemap.xml and the shared site navigation.
 */
const SHARED = ["/pricing", "/security", "/mcp", "/changelog"] as const;
const OG = ["/", "/fenceline", ...SHARED] as const;
const LEGAL = ["/legal/terms", "/legal/privacy", "/legal/dpa"] as const;

/** A meta tag's content, or null when the page doesn't have it (no waiting). */
async function meta(page: import("@playwright/test").Page, attr: "name" | "property", key: string) {
  const tag = page.locator(`meta[${attr}="${key}"]`);
  return (await tag.count()) ? tag.first().getAttribute("content") : null;
}

test.describe("/ is the Open Range landing (ENG-87)", () => {
  test("signed out, / serves the landing with no redirect", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(res?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /The right fifty/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("the hero's first frame is the app skeleton, and the live screen mounts after load", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain('class="or-hero__plate"');
    expect(html).toMatch(/class="c-shellbox c-appskel" role="status" aria-label="Loading Companies for ColdTrace Sensors/);
    await page.goto("/");
    const hero = page.locator(".or-hero__plate");
    await expect(hero.locator(".pf__app .c-app").first()).toBeVisible({ timeout: 15_000 });
    await expect(hero.getByRole("status", { name: /^Loading Companies/ })).toHaveCount(0);
    await expect(hero.getByRole("img", { name: /Corral screen: Companies for ColdTrace Sensors/ })).toBeVisible();
  });

  test("with reduced motion, nothing in the hero animates, before or after it mounts", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect as KeyframeEffect | null)?.target instanceof Element && ((a.effect as KeyframeEffect).target as Element).closest(".or-hero")).length);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await running()).toBe(0);
    await expect(page.locator(".or-hero__plate .pf__app .c-app").first()).toBeVisible({ timeout: 15_000 });
    expect(await running()).toBe(0);
    await ctx.close();
  });

  test("the design index moved to /styleguide/landings, out of search", async ({ page, request }) => {
    const res = await page.goto("/styleguide/landings");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Two ways to tell the same story." })).toBeVisible();
    expect(await meta(page, "name", "robots")).toMatch(/noindex/);
    await expect(page.locator('a[href="/"]')).toHaveCount(1);
    await expect(page.locator('a[href="/fenceline"]')).toHaveCount(1);
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /styleguide");
  });
});

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

  test("the landings keep their absolute titles; / is Open Range, its only address", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Corral · The right fifty, already read.");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/?$/);
    // /open-range was removed (ENG-87): the 404, not a copy or a redirect.
    expect((await page.goto("/open-range"))?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Nothing here fits." })).toBeVisible();
    await page.goto("/fenceline");
    await expect(page).toHaveTitle("Corral · Gather the few who fit.");
    // Open Range is home (ENG-87): Fenceline stays live, out of search (HANDOFF §18).
    expect(await meta(page, "name", "robots")).toMatch(/noindex/);
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
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/); // "/" is home
    for (const p of SHARED) expect(body).toContain(`${p}</loc>`);
    for (const p of ["/sign-in", "/open-range", "/fenceline", "/styleguide", ...LEGAL]) expect(body).not.toContain(`${p}</loc>`);
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
