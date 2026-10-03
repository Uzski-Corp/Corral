import type { Page } from "@playwright/test";
import { audit, WIDTHS } from "./axe";
import { API, expect, signInWithGoogle, test, WEB } from "./fixtures";

/**
 * M14 signed in: a connected integration's page reads only the API (GET /integrations/:id and its /logs), the list
 * shows each one's real last event, Phoenix opens on Corral's defaults, and a broken sign-in reconnects through PATCH.
 */
const SAMPLE = /ColdTrace|coldtrace|Tomás|Ibarra|Amara Njoroge|PX-2288|bk_7Hq2Lw|1 booking caught up|test deal delivered/;
const text = (page: Page) => page.locator("body").innerText();

async function open(page: Page) {
  await page.request.post(`${API}/__mock/scenario`, { data: { integrations: true } });
  await page.goto(`/sign-in?next=${encodeURIComponent("/app/settings")}`);
  await signInWithGoogle(page);
  await expect(page).toHaveURL(`${WEB}/app/settings`);
  await expect(page.getByRole("list", { name: "Integrations" })).toBeVisible();
}
const row = (page: Page, name: string) => page.getByRole("list", { name: "Integrations" }).getByRole("listitem").filter({ hasText: name });

test.describe("a connected integration from real data", () => {
  test.beforeEach(async ({ mockApi, onboarded }) => { void mockApi; await onboarded(); });

  test("the list shows the real last event, or No activity yet", async ({ page }) => {
    await open(page);
    await expect(row(page, "Cal.com")).toContainText(/Last: BOOKING_CREATED · 18 min ago/);
    await expect(row(page, "Phoenix")).toContainText("No activity yet");
    expect(await text(page)).not.toMatch(SAMPLE);
  });

  test("Cal.com's page: who connected it, its booking, no test", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Manage Cal.com" }).click();
    const acct = page.getByRole("definition").filter({ hasText: "Wanjiru Mwangi" });
    await expect(acct).toBeVisible();
    await expect(page.getByRole("list", { name: "Cal.com activity" })).toContainText("BOOKING_CREATED");
    await expect(page.getByRole("button", { name: "Send a test" })).toHaveCount(0);
    expect(await text(page)).not.toMatch(SAMPLE);
  });

  test("Phoenix: a teammate connected it, nothing yet, mapping on the defaults", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Manage Phoenix ERP" }).click();
    await expect(page.getByText("A teammate")).toBeVisible();
    await expect(page.getByText("No activity yet")).toBeVisible();
    await page.getByRole("tab", { name: "Field mapping" }).click();
    await expect(page.getByText("Defaults", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save mapping" })).toBeDisabled();
    expect(await text(page)).not.toMatch(SAMPLE);
  });

  test("AutoSend's expired sign-in reconnects through the API", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Open AutoSend" }).click();
    await expect(page.getByText(/Sign-in expired 2h ago\./)).toBeVisible();
    await page.getByRole("button", { name: "Reconnect" }).click();
    await expect(page.getByText("AutoSend reconnected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reconnect" })).toHaveCount(0);
    const calls: string[] = await (await page.request.get(`${API}/__mock/calls`)).json();
    expect(calls).toContain("PATCH /api/v1/integrations/autosend");
  });

  for (const { name, viewport } of WIDTHS) {
    test(`the signed-in page has no axe violations at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page);
      expect(await audit(page)).toEqual([]);
      await page.getByRole("button", { name: "Manage Cal.com" }).click();
      await expect(page.getByRole("list", { name: "Cal.com activity" })).toBeVisible();
      expect(await audit(page)).toEqual([]);
      await page.locator(".i-back").click();
      await page.getByRole("button", { name: "Open AutoSend" }).click();
      await expect(page.getByText(/Sign-in expired/)).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });
  }
});
