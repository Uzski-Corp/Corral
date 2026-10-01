import { expect, test } from "@playwright/test";

/**
 * Smoke test of the knowledge base upload UI, from its review states only (HANDOFF-ENG.md §10).
 * There is no upload API yet (ENG-65/66), so this checks what each state renders and the client-side
 * actions that need no server. Runs in the "review" project (see playwright.config.ts).
 */
const kb = (state: string) => `/app/knowledge?state=${state}`;

test("empty: the page is the drop zone, with the web page adder", async ({ page }) => {
  await page.goto(kb("empty"));
  await expect(page.getByRole("heading", { name: "Teach Corral what you sell" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Or add a web page" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Sources/ })).toContainText("0");
});

test("upload: the dialog shows active, queued and done items", async ({ page }) => {
  await page.goto(kb("upload"));
  const dialog = page.getByRole("dialog", { name: "Add sources" });
  await expect(dialog).toBeVisible();
  const queue = dialog.getByRole("region", { name: "This upload" });
  await expect(queue).toContainText("Reefer truck retrofit guide.pdf");
  await expect(queue).toContainText("Case study – Pwani Fresh.pdf");
  await expect(queue).toContainText("coldtrace.io/pricing");
  await expect(queue.getByRole("progressbar")).not.toHaveCount(0);
  await expect(queue.getByRole("img", { name: "Added" })).not.toHaveCount(0);
});

test("upload-errors: every failure names its fix, and Retry clears a stopped upload", async ({ page }) => {
  await page.goto(kb("upload-errors"));
  const dialog = page.getByRole("dialog", { name: "Add sources" });
  await expect(dialog.getByText(/Upload stopped\./)).toBeVisible();
  await expect(dialog.getByText(/\.key files aren't supported/)).toBeVisible();
  await expect(dialog.getByText(/Already in this knowledge base/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Dismiss Trade show deck.key" })).toBeVisible();
  await dialog.getByRole("button", { name: /Retry/ }).click();
  await expect(dialog.getByText(/Upload stopped\./)).toHaveCount(0);
});

test("dragging: files held over the page show the full-window drop target", async ({ page }) => {
  await page.goto(kb("dragging"));
  await expect(page.getByText("Drop to add to ColdTrace Sensors")).toBeVisible();
});

test("tray: a closed dialog leaves the uploads tray, which can be minimised", async ({ page }) => {
  await page.goto(kb("tray"));
  const tray = page.getByRole("region", { name: "Uploads" });
  await expect(tray).toContainText("Adding");
  const toggle = tray.getByRole("button", { name: "Minimise uploads" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(tray.getByRole("button", { name: "Show uploads" })).toHaveAttribute("aria-expanded", "false");
});
