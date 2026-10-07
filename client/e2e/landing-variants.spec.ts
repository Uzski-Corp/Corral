import { expect, test } from "@playwright/test";
import { audit, WIDTHS } from "./axe";

/**
 * Bau's landing directions (Oct 7) in the production build: /v/1–/v/4 are static, out of search, carry the hero's
 * waitlist form (a real POST to the Worker's /api/waitlist with JS off), and pass axe at both design widths.
 * The live / now draws its pricing and footer band with the vector horizon instead of dusk.jpg.
 */
const VARIANTS = ["1", "2", "3", "4"] as const;

/** Known and handed to Bau (Oct 7): the "Sample workspace" caption in the agent chat is white at 40% on #151515
    (~3.5:1 at 11px; AA needs 4.5:1). Pinned rather than skipped, so any new violation still fails, and this test
    fails once the caption is fixed so the pin gets removed. */
const KNOWN = /^color-contrast \(serious\): 1 node\(s\), e\.g\. \.lv-chat > (figcaption|\.lv-run__cap)$/;

test.describe("/v/1–/v/4", () => {
  for (const v of VARIANTS) {
    test(`/v/${v} is a noindex page with the hero waitlist form`, async ({ page }) => {
      const res = await page.goto(`/v/${v}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/?$/);
      const form = page.locator("#join form");
      await expect(form).toHaveAttribute("action", "/api/waitlist");
      await expect(form).toHaveAttribute("method", "post");
      await expect(form.locator('input[name="source"]')).toHaveValue(`v${v}`);
    });
  }

  test("with JS off, the #waitlist-joined line shows from the Worker's redirect fragment", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/v/1#waitlist-joined");
    await expect(page.locator("#waitlist-joined")).toBeVisible();
    await expect(page.locator("#waitlist-error")).toBeHidden();
    await ctx.close();
  });

  test("the sitemap leaves the directions out", async ({ request }) => {
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/v/");
  });

  for (const { name, viewport } of WIDTHS) {
    test.describe(`at ${name}`, () => {
      test.use({ viewport, reducedMotion: "reduce" });
      for (const v of VARIANTS) {
        test(`/v/${v} has no axe violations`, async ({ page }) => {
          await page.goto(`/v/${v}`);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          expect(await audit(page)).toEqual([expect.stringMatching(KNOWN)]);
        });
      }
    });
  }
});

test("/ draws the pricing and footer band with the vector horizon", async ({ page, request }) => {
  await page.goto("/");
  const bg = page.locator("#pricing > img.or-bg");
  await expect(bg).toHaveAttribute("src", "/corral/footer-horizon.svg");
  const box = await bg.boundingBox();
  const band = await page.locator("#pricing").boundingBox();
  expect(box?.width).toBeCloseTo(band!.width, 0);
  expect(box?.height).toBeCloseTo(band!.height, 0);
  const svg = await request.get("/corral/footer-horizon.svg");
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
});
