import AxeBuilder from "@axe-core/playwright";
import { expect, signInWithGoogle, test } from "./fixtures";

/**
 * axe (WCAG 2.1 A/AA) on the M1 screens and their failure states. No rules are skipped: any
 * finding fails the run. (Bau's AA grey ladder and underlined inline links, HANDOFF-ENG.md §8,
 * cleared the earlier color-contrast and link-in-text-block findings.)
 */
async function audit(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
}

test("sign-in has no axe violations", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Corral" })).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("sign-in failure states have no axe violations", async ({ page }) => {
  await page.goto("/sign-in?error=auth_failed");
  await expect(page.getByText("That link has expired")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.goto("/sign-in?error=provider_error");
  await expect(page.getByRole("button", { name: "Try Google again" })).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.goto("/sign-in?error=auth_unavailable");
  await expect(page.getByRole("link", { name: "Status page" })).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("onboarding and the app shell have no axe violations", async ({ page, mockApi }) => {
  void mockApi;
  await page.goto("/sign-in");
  await signInWithGoogle(page);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.getByRole("button", { name: "Save and exit" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
  expect(await audit(page)).toEqual([]);
});

test("the Companies table has no axe violations", async ({ page, mockApi, onboarded }) => {
  void mockApi;
  await onboarded();
  await page.goto("/sign-in?next=%2Fapp%3Fview%3Dcompanies");
  await signInWithGoogle(page);
  const table = page.getByRole("table", { name: /^Segment:/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Company" })).toBeVisible();
  await expect(table.getByRole("row").nth(1).getByRole("cell").first().getByRole("checkbox")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("the API-down shell has no axe violations", async ({ page, mockApi, onboarded }) => {
  await onboarded();
  await page.goto("/sign-in");
  await signInWithGoogle(page);
  await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
  await mockApi.down();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Corral can’t reach its servers" })).toBeVisible();
  expect(await audit(page)).toEqual([]);
});
