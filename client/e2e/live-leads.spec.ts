import type { Page } from "@playwright/test";
import { API, expect, signInWithGoogle, test, WEB } from "./fixtures";
import { audit } from "./axe";

/**
 * Companies, segments and CSV import on the lead CRM API (ENG-81): a signed-in person sees the workspace's
 * companies from e2e/mock-api.mjs, not Bau's sample, and every change goes to the API.
 */
async function open(page: Page, view = "companies") {
  await page.goto(`/sign-in?next=${encodeURIComponent(`/app?view=${view}`)}`);
  await signInWithGoogle(page);
  await expect(page).toHaveURL(`${WEB}/app?view=${view}`);
}
const table = (page: Page) => page.getByRole("table", { name: /^Companies:|^Segment:/ });
const rowOf = (page: Page, name: string) => table(page).getByRole("row").filter({ has: page.getByRole("button", { name, exact: true }) });
const scenario = (page: Page, data: Record<string, unknown>) => page.request.post(`${API}/__mock/scenario`, { data });

test.describe("companies on the lead CRM API", () => {
  test.beforeEach(async ({ mockApi, onboarded }) => { void mockApi; await onboarded(); });

  test("lists the workspace's companies, fit first, and sorts and filters on the server", async ({ page, mockApi }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "Kilima Dairies", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tamu Bakeries" })).toHaveCount(0);   // fit 72, not in Fit 80+
    await expect(page.getByText("Nakuru Creamery")).toHaveCount(0);                      // no sample data
    const tabs = page.getByRole("tablist", { name: "Companies" });
    await expect(tabs.getByRole("tab", { name: /All/ })).toContainText("6");
    await tabs.getByRole("tab", { name: /All/ }).click();
    await expect(page.getByRole("button", { name: "Tamu Bakeries" })).toBeVisible();
    await expect(page.getByText("6 companies")).toBeVisible();
    await page.getByRole("columnheader", { name: /Company/ }).getByRole("button").click();
    await expect(table(page).getByRole("row").nth(1)).toContainText("Kilima Dairies");
    await expect(table(page).getByRole("row").nth(6)).toContainText("Tamu Bakeries");
    const calls = await mockApi.calls();
    expect(calls).toContain("POST /api/v1/companies/query");
    expect(calls).toContain("GET /api/v1/segments");
    expect(await audit(page)).toEqual([]);
  });

  test("opens a company with its people, and sets its status", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Kilima Dairies", exact: true }).click();
    const d = page.getByRole("article", { name: "Kilima Dairies details" });
    await expect(d.getByText("Joseph Kariuki")).toBeVisible();
    await expect(d.getByText("wanjiru@kilima.co.ke")).toBeVisible();
    await page.getByRole("button", { name: "Status for Kilima Dairies: Interested" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Meeting booked/ }).click();
    await expect(page.getByText("Kilima Dairies set to Meeting booked")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Kilima Dairies", exact: true }).click();
    await expect(page.getByRole("button", { name: "Status for Kilima Dairies: Meeting booked" })).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test("adds a selection to a saved segment, which then lists it", async ({ page }) => {
    await open(page);
    await page.getByRole("checkbox", { name: "Select Pwani Fresh" }).check();
    await page.getByRole("button", { name: "Add to segment" }).click();
    await page.getByRole("menuitem", { name: /Kenya dairy/ }).click();
    await expect(page.getByText("Added 1 to Kenya dairy")).toBeVisible();
    await page.goto("/app?view=segments&segment=Kenya%20dairy");
    await expect(page.getByRole("table", { name: "Segment: Kenya dairy" })).toBeVisible();
    await expect(rowOf(page, "Pwani Fresh")).toBeVisible();
    await expect(rowOf(page, "Kilima Dairies")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tamu Bakeries" })).toHaveCount(0);
    expect(await audit(page)).toEqual([]);
  });

  test("merges a probable duplicate into the older company", async ({ page, mockApi }) => {
    await open(page);
    await page.getByRole("button", { name: "Kilima Dairies Ltd" }).click();
    await page.getByRole("button", { name: "Merge" }).click();
    await expect(page.getByText("Merged into Kilima Dairies")).toBeVisible();
    await expect(page.getByRole("article", { name: "Kilima Dairies details" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kilima Dairies Ltd" })).toHaveCount(0);
    expect(await mockApi.calls()).toContain("POST /api/v1/companies/c1/merge");
  });

  test("imports a CSV with the server's dry run and progress", async ({ page, mockApi }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "Kilima Dairies", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import CSV/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Import companies from CSV" });
    await dialog.locator("input[type=file]").setInputFiles({ name: "expo.csv", mimeType: "text/csv", buffer: Buffer.from("Company,Email\nKilima Dairies,wanjiru@kilima.co.ke\nNyeri Farms,achieng@nyerifarms.co.ke\n") });
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: "Import 1, update 1" }).click();
    await expect(page.getByRole("dialog", { name: "Import finished" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("1 companies added")).toBeVisible();
    expect(await audit(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Nyeri Farms" })).toBeVisible();
    const calls = await mockApi.calls();
    expect(calls.filter((c) => c === "POST /api/v1/lead-imports")).toHaveLength(2);   // dry run, then the run
    expect(calls.some((c) => c.startsWith("GET /api/v1/lead-imports/"))).toBe(true);
  });

  test("an empty workspace gets Bau's first-run screen", async ({ page }) => {
    await scenario(page, { leadsEmpty: true });
    await open(page);
    await expect(page.getByRole("heading", { name: "Bring in the companies you already know" })).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test("a failing list names the request, and tries again", async ({ page }) => {
    await scenario(page, { leadsDown: true });
    await open(page);
    await expect(page.getByText("POST /api/v1/companies/query · 503")).toBeVisible();
    await scenario(page, { leadsDown: false });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Kilima Dairies", exact: true })).toBeVisible();
  });
});
