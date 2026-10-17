import { mkdirSync } from "node:fs";
import { audit, WIDTHS } from "./axe";
import { expect, test } from "./fixtures";

/**
 * The pricing gate (NEXT_PUBLIC_PRICING_GATE=1, a build-time flag). Needs a build with the flag on, so it only runs when
 * E2E_PRICING_GATE=1 is set alongside it; the default build keeps the open pricing page and every other spec as it was.
 * POST /api/pricing-intent is stubbed in the browser: the Worker has its own tests (hosting/landing).
 * PG_SHOTS=<dir> also saves a screenshot of each state there.
 */
test.skip(process.env.E2E_PRICING_GATE !== "1", "needs a build with NEXT_PUBLIC_PRICING_GATE=1");

const SHOTS = process.env.PG_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    const shot = async (page: import("@playwright/test").Page, label: string) => { if (SHOTS) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${SHOTS}/${label}-${name}.png` }); } };

    test("the page is a headline, a line and one button, with no plan or price", async ({ page }) => {
      await page.goto("/pricing");
      await expect(page.getByRole("heading", { level: 1, name: "Pricing, by email." })).toBeVisible();
      await expect(page.getByRole("button", { name: "See pricing" })).toBeVisible();
      const text = (await page.locator("body").innerText());
      expect(text).not.toMatch(/\$\s?\d|\bField\b|\bRange\b|\bTerritory\b|per month/);
      expect(await page.locator("script[type='application/ld+json']").count()).toBe(0);
      expect(await audit(page)).toEqual([]);
      await shot(page, "1-page");
    });

    test("fill, send, see the success card; the body says what was sent", async ({ page }) => {
      let body: Record<string, unknown> = {};
      await page.route("**/api/pricing-intent", async (route) => { body = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { status: "queued" } }); });
      await page.goto("/pricing");
      await page.getByRole("button", { name: "See pricing" }).click();
      const dialog = page.getByRole("dialog", { name: "See pricing by email" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Full name")).toBeFocused();
      await shot(page, "2-idle");
      expect(await audit(page)).toEqual([]);
      await dialog.getByRole("button", { name: "Email me the pricing" }).click();
      await expect(dialog.getByText("Add your name so we know who to write to.")).toBeVisible();
      await shot(page, "3-errors");
      await dialog.getByLabel("Full name").fill("Wanjiru Kamau");
      await dialog.getByRole("combobox", { name: /Industry/ }).click();
      await page.getByRole("option", { name: "Other" }).click();
      await dialog.getByLabel("Your industry").fill("Beekeeping");
      await shot(page, "4-other");
      await dialog.getByLabel("Work email").fill("wanjiru@kamau-farms.co.ke");
      await dialog.getByLabel(/Phone/).fill("+254 712 345 678");
      await dialog.getByRole("button", { name: "Email me the pricing" }).click();
      await expect(dialog.getByText("Check your inbox.")).toBeVisible();
      expect(body).toMatchObject({ fullName: "Wanjiru Kamau", industry: "other", otherText: "Beekeeping", email: "wanjiru@kamau-farms.co.ke", phone: "+254712345678", source: "hero", website: "" });
      await shot(page, "5-success");
      expect(await audit(page)).toEqual([]);
      await dialog.locator(".c-dialog__foot").getByRole("button", { name: "Close" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "See pricing" })).toBeFocused();
    });

    test("a server failure and a rate limit keep the answers and say so", async ({ page }) => {
      let status = 500;
      await page.route("**/api/pricing-intent", (route) => route.fulfill({ status, headers: status === 429 ? { "retry-after": "300" } : {}, json: {} }));
      await page.goto("/pricing");
      await page.getByRole("button", { name: "See pricing" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Full name").fill("Wanjiru Kamau");
      await dialog.getByRole("combobox", { name: /Industry/ }).click();
      await page.getByRole("option", { name: "Agriculture" }).click();
      await dialog.getByLabel("Work email").fill("wanjiru@kamau-farms.co.ke");
      await dialog.getByRole("button", { name: "Email me the pricing" }).click();
      await expect(dialog.getByText("We couldn’t send that just now.")).toBeVisible();
      await expect(dialog.getByLabel("Full name")).toHaveValue("Wanjiru Kamau");
      await shot(page, "6-failure");
      expect(await audit(page)).toEqual([]);
      status = 429;
      await dialog.getByRole("button", { name: "Try again" }).click();
      await expect(dialog.getByText("That’s a lot of tries from here.")).toBeVisible();
      await shot(page, "7-limited");
      expect(await audit(page)).toEqual([]);
    });

    test("Esc closes the dialog and the back button does too", async ({ page }) => {
      await page.goto("/pricing");
      await page.getByRole("button", { name: "See pricing" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await page.getByRole("button", { name: "See pricing" }).click();
      await page.goBack();
      await expect(page.getByRole("dialog")).toBeHidden();
    });
  });
}
