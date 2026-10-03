import type { Page } from "@playwright/test";
import { API, expect, signInWithGoogle, test, WEB } from "./fixtures";

/**
 * Unibox, discovery, sequences, contacts and settings read the API. An empty workspace shows none of
 * the ColdTrace demo; a seeded payload does.
 */
const scenario = (page: Page, data: Record<string, unknown>) => page.request.post(`${API}/__mock/scenario`, { data });

async function open(page: Page, path = "/app") {
  await page.goto(`/sign-in?next=${encodeURIComponent(path)}`);
  await signInWithGoogle(page);
  await expect(page).toHaveURL(`${WEB}${path}`);
}

test.describe("live activity", () => {
  test.beforeEach(async ({ mockApi, onboarded }) => { void mockApi; await onboarded(); });

  test("a new account does not show the ColdTrace demo", async ({ page }) => {
    await open(page);
    await expect(page.getByText("Brian Kamau")).toHaveCount(0);
    await expect(page.getByText("Nothing needs you")).toBeVisible();

    await page.goto("/app/discovery");
    await expect(page.getByText("Dairy & cold rooms · East Africa")).toHaveCount(0);
    await expect(page.getByText("Find your market")).toBeVisible();

    await page.goto("/app/sequences");
    await expect(page.getByText("Cold-room pilot")).toHaveCount(0);

    await page.goto("/app/contacts");
    await expect(page.getByText("Grace Holloway")).toHaveCount(0);
    await expect(page.getByText("No contacts yet")).toBeVisible();

    await page.goto("/app/settings/keys");
    await expect(page.getByText("n8n lead sync")).toHaveCount(0);
    await expect(page.getByText("No API keys yet")).toBeVisible();
  });

  test("a seeded workspace shows the demo rows", async ({ page }) => {
    await scenario(page, { activity: true });
    await open(page);
    await expect(page.getByRole("option", { name: /Brian Kamau/ })).toBeVisible();

    await page.goto("/app/discovery");
    await expect(page.getByText("Dairy & cold rooms · East Africa").first()).toBeVisible();

    await page.goto("/app/sequences");
    await expect(page.getByText("Cold-room pilot").first()).toBeVisible();

    await page.goto("/app/contacts");
    await expect(page.getByText("Grace Holloway").first()).toBeVisible();

    await page.goto("/app/settings/keys");
    await expect(page.getByText("n8n lead sync").first()).toBeVisible();
  });
});
