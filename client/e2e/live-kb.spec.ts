import type { Page } from "@playwright/test";
import { API, expect, signInWithGoogle, test, WEB } from "./fixtures";
import { audit } from "./axe";

/**
 * The knowledge base on the API (ENG-79): a signed-in person sees their product's sources from
 * e2e/mock-api.mjs, not Bau's sample data, and uploads, re-reads and removes for real.
 * The mock reads a new source in ~3s (scan → parse → chunk → embed), so the list polls to "ready".
 */
async function openKb(page: Page) {
  await page.goto("/sign-in?next=%2Fapp%3Fview%3Dknowledge");
  await signInWithGoogle(page);
  await expect(page).toHaveURL(`${WEB}/app?view=knowledge`);
  await expect(page.getByRole("table", { name: "Sources" })).toBeVisible();
}
const row = (page: Page, name: string) => page.getByRole("table", { name: "Sources" }).getByRole("row").filter({ hasText: name });
const scenario = (page: Page, data: Record<string, unknown>) => page.request.post(`${API}/__mock/scenario`, { data });

test.describe("knowledge base on the API", () => {
  test.beforeEach(async ({ mockApi, onboarded }) => { void mockApi; await onboarded(); });

  test("lists the product's real sources, with their states", async ({ page, mockApi }) => {
    await openKb(page);
    await expect(row(page, "Cold-room SOP.pdf")).toBeVisible();
    await expect(row(page, "Pricing 2026.docx")).toContainText(/couldn’t read/i);
    await expect(row(page, "kilima.co.ke/faq")).toBeVisible();
    await expect(page.getByText("Gateway spec sheet v4.pdf")).toHaveCount(0);   // no sample data
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Kilima milk sensors");
    const calls = await mockApi.calls();
    expect(calls).toContain("GET /api/v1/products");
    expect(calls).toContain("GET /api/v1/products/p1/knowledge/sources");
    expect(await audit(page)).toEqual([]);
  });

  test("uploads a file: processing, then ready once the server has read it", async ({ page }) => {
    await openKb(page);
    await page.getByRole("button", { name: "Add sources" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add sources" });
    await dialog.locator("input[type=file]").setInputFiles({ name: "Dairy price list.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 price list") });
    await expect(dialog.getByRole("region", { name: "This upload" })).toContainText("Dairy price list.pdf");
    await expect(dialog.getByRole("img", { name: "Added" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row(page, "Dairy price list.pdf")).toBeVisible();
    await expect(row(page, "Dairy price list.pdf").getByRole("progressbar")).toBeVisible();
    await expect(row(page, "Dairy price list.pdf").getByRole("progressbar")).toHaveCount(0, { timeout: 10_000 });
    await expect(row(page, "Dairy price list.pdf")).toContainText("just now");
  });

  test("a file that's already there offers Replace, which replaces the source", async ({ page, mockApi }) => {
    await openKb(page);
    await page.getByRole("button", { name: "Add sources" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add sources" });
    await dialog.locator("input[type=file]").setInputFiles({ name: "Cold-room SOP.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF new") });
    await expect(dialog.getByText("Already in this knowledge base")).toBeVisible();
    await dialog.getByRole("button", { name: /Replace/ }).click();
    await expect(page.getByText("Replacing Cold-room SOP.pdf")).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Added" })).toBeVisible();
    expect(await mockApi.calls()).toContain("POST /api/v1/products/p1/knowledge/sources/files");
    await page.keyboard.press("Escape");
    await expect(row(page, "Cold-room SOP.pdf")).toHaveCount(1);   // replaced, not added twice
  });

  test("adds a web page", async ({ page }) => {
    await openKb(page);
    await page.getByRole("button", { name: "Add sources" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add sources" });
    await dialog.getByRole("textbox", { name: /web page/i }).fill("kilima.co.ke/about");
    await dialog.getByRole("textbox", { name: /web page/i }).press("Enter");
    await expect(dialog.getByRole("img", { name: "Added" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row(page, "kilima.co.ke/about")).toBeVisible();
  });

  test("re-reads a failed file", async ({ page, mockApi }) => {
    await openKb(page);
    await page.getByRole("button", { name: "Actions for Pricing 2026.docx" }).click();
    await page.getByRole("menuitem", { name: "Read again" }).click();
    await expect(page.getByText("Reading Pricing 2026.docx again")).toBeVisible();
    expect(await mockApi.calls()).toContain("POST /api/v1/products/p1/knowledge/sources/s2/reread");
    await expect(row(page, "Pricing 2026.docx").getByRole("progressbar")).toHaveCount(0, { timeout: 10_000 });
    await expect(row(page, "Pricing 2026.docx")).not.toContainText(/couldn’t read/i);
  });

  test("removes a source, and Undo brings it back", async ({ page, mockApi }) => {
    await openKb(page);
    await page.getByRole("button", { name: "Actions for Cold-room SOP.pdf" }).click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove source" }).click();
    await expect(row(page, "Cold-room SOP.pdf")).toHaveCount(0);
    const toast = page.getByRole("status").filter({ hasText: "Removed Cold-room SOP.pdf" });
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "Cold-room SOP.pdf")).toBeVisible();
    const calls = await mockApi.calls();
    expect(calls).toContain("DELETE /api/v1/products/p1/knowledge/sources/s1");
    expect(calls).toContain("POST /api/v1/products/p1/knowledge/sources/s1/restore");
    await page.reload();
    await expect(row(page, "Cold-room SOP.pdf")).toBeVisible();
  });

  test("a failed remove puts the source back and says so", async ({ page }) => {
    await openKb(page);
    await scenario(page, { deleteFails: true });
    await page.getByRole("button", { name: "Actions for Cold-room SOP.pdf" }).click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove source" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn’t remove Cold-room SOP.pdf. Nothing changed." })).toBeVisible();
    await expect(row(page, "Cold-room SOP.pdf")).toBeVisible();
  });

  test("the API down: Bau's error state with the failed request, then Try again", async ({ page }) => {
    await scenario(page, { kbDown: true });
    await page.goto("/sign-in?next=%2Fapp%3Fview%3Dknowledge");
    await signInWithGoogle(page);
    const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load the knowledge base" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("GET /api/v1/products · 503");
    expect(await audit(page)).toEqual([]);
    await scenario(page, { kbDown: false });
    await alert.getByRole("button", { name: /Try again/ }).click();
    await expect(row(page, "Cold-room SOP.pdf")).toBeVisible();
  });

  test("no product yet: the empty knowledge base, and the first file creates the product", async ({ page, mockApi }) => {
    await scenario(page, { kbEmpty: true });
    await page.goto("/sign-in?next=%2Fapp%3Fview%3Dknowledge");
    await signInWithGoogle(page);
    await expect(page.getByRole("heading", { name: "Teach Corral what you sell" })).toBeVisible();
    expect(await audit(page)).toEqual([]);
    await page.locator("input[type=file]").first().setInputFiles({ name: "Catalogue.md", mimeType: "text/markdown", buffer: Buffer.from("# Catalogue\n\nMilk sensors.") });
    await expect(row(page, "Catalogue.md")).toBeVisible({ timeout: 10_000 });
    expect(await mockApi.calls()).toContain("POST /api/v1/products");
  });
});
