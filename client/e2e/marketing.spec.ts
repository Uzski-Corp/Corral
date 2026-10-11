import { expect, test } from "@playwright/test";

/**
 * The M10 marketing site's contract in the production build (ENG-60): titles, canonicals, share images,
 * noindex on the legal stubs and the 404, robots.txt, sitemap.xml, the shared site navigation, and (Oct 7) og:url,
 * JSON-LD, theme-color and the web app manifest.
 */
const SHARED = ["/pricing", "/security", "/mcp", "/changelog"] as const;
const OG = ["/", "/fenceline", ...SHARED] as const;
const LEGAL = ["/legal/terms", "/legal/privacy", "/legal/dpa"] as const;

/** A meta tag's content, or null when the page doesn't have it (no waiting). */
async function meta(page: import("@playwright/test").Page, attr: "name" | "property", key: string) {
  const tag = page.locator(`meta[${attr}="${key}"]`);
  return (await tag.count()) ? tag.first().getAttribute("content") : null;
}

test.describe("/ is the Agent landing (promoted from /v/4)", () => {
  test("signed out, / serves the landing with no redirect", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(res?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Put an AI agent on lead generation." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(page.locator(".lv-foot").getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("the waitlist forms on / sign up as home, with no variant picker", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html.match(/name="source" value="home"/g)).toHaveLength(2);
    expect(html).not.toMatch(/name="source" value="v\d"/);
    expect(html).not.toContain("proto-picker");
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

  test("the landings keep their absolute titles; / is the Agent landing", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Corral · Put an AI agent on lead generation");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/?$/);
    // /open-range was removed (ENG-87): the 404, not a copy or a redirect.
    expect((await page.goto("/open-range"))?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "This page swam off." })).toBeVisible();
    await page.goto("/fenceline");
    await expect(page).toHaveTitle("Corral · Gather the few who fit.");
    // Open Range is home (ENG-87): Fenceline stays live, out of search (HANDOFF §18).
    expect(await meta(page, "name", "robots")).toMatch(/noindex/);
  });

  test("every page shares corral-og.png with alt text", async ({ page, request }) => {
    for (const path of OG) {
      await page.goto(path);
      const og = await meta(page, "property", "og:image");
      expect(og, path).toMatch(/\/assets\/corral-og\.png$/);
      expect(await meta(page, "property", "og:image:alt"), path).toBeTruthy();
      expect(await meta(page, "property", "og:image:width"), path).toBe("1200");
      expect(await meta(page, "property", "og:image:height"), path).toBe("630");
      expect(await meta(page, "name", "twitter:card"), path).toBe("summary_large_image");
      expect(await meta(page, "name", "twitter:image"), path).toMatch(/\/assets\/corral-og\.png$/);
      const res = await request.get(new URL(og!).pathname);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toBe("image/png");
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

  test("the shared pages send every call to action to the waitlist, tagged site", async ({ page }) => {
    for (const path of SHARED) {
      await page.goto(path);
      await expect(page.locator("#join form input[name=source]")).toHaveValue("site");
      for (const l of await page.getByRole("link", { name: "Join the waitlist" }).all()) await expect(l).toHaveAttribute("href", "#join");
    }
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

/* The Oct 7 SEO pass: og:url, JSON-LD, theme-color and the web app manifest, as the production build serves them. */
test.describe("search and share metadata", () => {
  test("every public page's og:url is its own address (the canonical); /v/* share home's", async ({ page }) => {
    for (const path of [...OG, ...LEGAL, "/sign-in"]) {
      await page.goto(path);
      const url = await meta(page, "property", "og:url");
      expect(url, path).toMatch(/^https?:\/\//);
      expect(new URL(url!).pathname, path).toBe(path);
      const link = page.locator('link[rel="canonical"]');
      if (await link.count()) expect(url, path).toBe((await link.getAttribute("href"))!.replace(/\/$/, ""));
    }
    for (const v of ["1", "2", "3", "4"]) {
      await page.goto(`/v/${v}`);
      expect(new URL((await meta(page, "property", "og:url"))!).pathname).toBe("/");
      expect(await meta(page, "name", "robots")).toMatch(/noindex/);
    }
  });

  test("the twitter card has no invented handle", async ({ page }) => {
    await page.goto("/");
    expect(await meta(page, "name", "twitter:site")).toBeNull();
    expect(await meta(page, "name", "twitter:creator")).toBeNull();
  });

  test("/ and /pricing carry JSON-LD that parses, with no ratings or reviews", async ({ request }) => {
    const ld = async (path: string) => {
      const html = await (await request.get(path)).text();
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      expect(blocks, path).toHaveLength(1);
      expect(JSON.stringify(blocks)).not.toMatch(/"(aggregateRating|review|reviews)"/);
      return blocks[0]["@graph"].map((t: { "@type": string }) => t["@type"]);
    };
    expect(await ld("/")).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    expect(await ld("/pricing")).toEqual(["FAQPage"]);
  });

  test("theme-color follows the colour scheme, and the manifest and its icons are served", async ({ page, request }) => {
    await page.goto("/pricing");
    const colours = await page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => [e.getAttribute("media"), e.getAttribute("content")]));
    expect(colours).toEqual([["(prefers-color-scheme: light)", "#F9F9FA"], ["(prefers-color-scheme: dark)", "#1C1C1C"]]);
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^application\/(manifest\+)?json/);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name: "Corral", short_name: "Corral", start_url: "/", display: "standalone", theme_color: "#F9F9FA" });
    for (const icon of manifest.icons) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()["content-type"], icon.src).toBe("image/png");
    }
  });
});
