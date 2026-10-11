import { expect, signInWithGoogle, test, WEB } from "./fixtures";

/**
 * The marketing pages' signed-in hint (M10c): the session writes corral_visitor when /me succeeds and clears it on
 * sign-out, so /fenceline shows the person and send the CTAs into the app (HANDOFF §18 question 5).
 */
const hint = async (page: import("@playwright/test").Page) => (await page.context().cookies()).find((c) => c.name === "corral_visitor");

test.describe("signed-in marketing pages", () => {
  test("signed out: Sign in, and the CTAs go to sign-in", async ({ page }) => {
    await page.goto("/fenceline");
    await expect(page.getByRole("link", { name: "Start with one product" }).first()).toHaveAttribute("href", "/sign-in");
    await expect(page.getByRole("link", { name: "Open app" })).toHaveCount(0);
  });

  test("after sign-in the nav shows the person and Open app, and the CTAs go to the app; sign-out clears it", async ({ page, mockApi, onboarded }) => {
    await onboarded();
    await page.goto("/sign-in");
    await signInWithGoogle(page);
    await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
    await expect.poll(() => hint(page).then((c) => !!c)).toBe(true);
    expect((await hint(page))!.httpOnly).toBe(false);

    await page.goto("/fenceline");
    const starts = page.getByRole("link", { name: "Start with one product" });
    await expect(starts.first()).toHaveAttribute("href", "/app");
    for (const l of await starts.all()) await expect(l).toHaveAttribute("href", "/app");   // hero, plan, close

    await page.goto("/app/settings/mcp");   // the connect target opens Developers → MCP in a live (non-review) build
    await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("button", { name: "MCP" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${WEB}/`);
    expect(await mockApi.calls()).toContain("POST /api/v1/auth/logout");
    expect(await hint(page)).toBeUndefined();
    await page.goto("/fenceline");
    await expect(page.getByRole("link", { name: "Start with one product" }).first()).toHaveAttribute("href", "/sign-in");
  });
});
