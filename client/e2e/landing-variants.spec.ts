import { expect, test } from "@playwright/test";
import { audit, WIDTHS } from "./axe";

/**
 * Bau's landing directions (Oct 7) in the production build: /v/1–/v/4 are static, out of search, carry the hero's
 * waitlist form (a real POST to the Worker's /api/waitlist with JS off), and pass axe at both design widths.
 * The prototype picker stays a compact pill, with or without script.
 */
const VARIANTS = ["1", "2", "3", "4"] as const;


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

  /** The picker's box, its sliding highlight and the active item, plus how much of the active item the highlight covers. */
  async function pickerGeometry(page: import("@playwright/test").Page) {
    return page.locator(".proto-picker").evaluate((nav) => {
      const box = (el: Element) => el.getBoundingClientRect();
      const n = box(nav), a = box(nav.querySelector("[data-active]")!), h = box(nav.querySelector(".proto-picker-highlight")!);
      const overlap = Math.max(0, Math.min(a.right, h.right) - Math.max(a.left, h.left)) / a.width;
      const hl = nav.querySelector(".proto-picker-highlight")!;
      return { height: n.height, overlap, highlightShown: getComputedStyle(hl).visibility === "visible" && h.width > 0,
        activeFill: getComputedStyle(nav.querySelector("[data-active]")!).backgroundColor };
    });
  }

  for (const { name, viewport } of WIDTHS) {
    test(`the variant picker is a compact pill with its highlight on the active tab, at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/v/3");
      await expect(page.locator(".proto-picker[data-ready]")).toBeAttached();
      const g = await pickerGeometry(page);
      // One 28px row plus 4px padding each side: the shared `main > :last-child` padding once made it ~176px tall.
      expect(g.height).toBeLessThan(56);
      expect(g.highlightShown).toBe(true);
      expect(g.overlap).toBeGreaterThan(0.9);
      await expect(page.locator(".proto-picker [data-active]")).toHaveText("Blue");
    });
  }

  test("with JS off, the picker is still a compact pill and the active tab carries the fill itself", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/v/2");
    const g = await pickerGeometry(page);
    expect(g.height).toBeLessThan(56);
    expect(g.highlightShown).toBe(false);
    expect(g.activeFill).toBe("rgba(255, 255, 255, 0.12)");
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
          expect(await audit(page)).toEqual([]);
        });
      }
    });
  }
});
