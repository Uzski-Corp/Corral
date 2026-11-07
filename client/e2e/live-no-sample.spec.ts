import type { Page } from "@playwright/test";
import { API, expect, signInWithGoogle, test, WEB } from "./fixtures";

/**
 * M13: a signed-in workspace never shows Bau's sample company or people. ColdTrace, Tomás and Amara may
 * appear only in the design-review shell and the mock's seeded scenario, never on a real account.
 */
// (The mock CRM has its own people, e.g. Amara Nwosu at Savanna Juice; those are the account's data.)
const SAMPLE = /ColdTrace|coldtrace|Tomás|Ibarra|Amara Njoroge|3,902/;
const ROUTES = [
  "/app", "/app/companies", "/app/contacts", "/app/discovery", "/app/sequences", "/app/segments", "/app/knowledge", "/app/products",
  "/app/settings", "/app/settings/team", "/app/settings/billing", "/app/settings/sms", "/app/settings/mcp", "/app/settings/keys", "/app/settings/docs",
  "/app/settings/profile", "/app/settings/workspace",
];
const scenario = (page: Page, data: Record<string, unknown>) => page.request.post(`${API}/__mock/scenario`, { data });
const text = (page: Page) => page.locator("body").innerText();

async function open(page: Page, path = "/app") {
  await page.goto(`/sign-in?next=${encodeURIComponent(path)}`);
  await signInWithGoogle(page);
  await expect(page).toHaveURL(`${WEB}${path}`);
}

test.describe("no sample data when signed in", () => {
  test.beforeEach(async ({ mockApi, onboarded }) => { void mockApi; await onboarded(); });

  test("every signed-in route", async ({ page }) => {
    await open(page);
    for (const path of ROUTES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await text(page), path).not.toMatch(SAMPLE);
    }
  });

  test("a new sequence starts blank", async ({ page }) => {
    await open(page, "/app/sequences");
    await page.getByRole("button", { name: "Start blank" }).click();
    await page.waitForLoadState("networkidle");
    expect(await text(page)).not.toMatch(/ColdTrace|Tomás|F&B 312/);
  });

  test("Team lists the real members and Billing waits on prices", async ({ page }) => {
    await open(page, "/app/settings/team");
    await expect(page.getByText("Just you so far")).toBeVisible();
    await expect(page.getByRole("list", { name: "Members" }).getByText("Wanjiru Mwangi")).toBeVisible();
    await page.goto("/app/settings/billing");
    await expect(page.getByText("No plan yet")).toBeVisible();
    await expect(page.getByText("{price}").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Talk to us/ }).first()).toHaveAttribute("href", /hello@corral\.so/);
  });

  test("the MCP host is named from its first call", async ({ page }) => {
    await open(page, "/app/settings/mcp");
    await expect(page.getByText("No hosts connected")).toBeVisible();
    await page.getByRole("button", { name: "Connect a client" }).first().click();
    await page.getByRole("button", { name: "I’ve added it" }).click();
    await expect(page.getByRole("dialog", { name: "Waiting for a host" })).toBeVisible();
    await scenario(page, { mcpHost: true });
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByRole("dialog", { name: "Cursor is connected" })).toBeVisible();
    expect(await text(page)).not.toMatch(SAMPLE);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Cursor connected")).toBeVisible();
  });
});
