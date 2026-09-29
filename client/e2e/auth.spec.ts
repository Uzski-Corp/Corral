import type { Page } from "@playwright/test";
import { expect, requestCode, signInWithGoogle, test, WEB } from "./fixtures";

test.describe("route protection", () => {
  test("signed-out visits to /app and /onboarding go to sign-in with a return path", async ({ page, mockApi }) => {
    void mockApi;
    await page.goto("/app?view=companies");
    await expect(page).toHaveURL(`${WEB}/sign-in?next=%2Fapp%3Fview%3Dcompanies`);
    await expect(page.getByRole("heading", { name: "Sign in to Corral" })).toBeVisible();

    await page.goto("/onboarding?step=2");
    await expect(page).toHaveURL(`${WEB}/sign-in?next=%2Fonboarding%3Fstep%3D2`);
  });

  test("a stale session cookie is caught by /me and sent to sign-in", async ({ page, context, mockApi, onboarded }) => {
    await onboarded();
    await context.addCookies([{ name: "wos_session", value: "revoked", domain: "localhost", path: "/" }]);
    await page.goto("/app");
    await expect(page).toHaveURL(`${WEB}/sign-in?next=%2Fapp`);
    expect(await mockApi.calls()).toContain("GET /api/v1/auth/me");
  });

  test("public pages stay public", async ({ page }) => {
    for (const path of ["/sign-in", "/styleguide", "/"]) {
      await page.goto(path);
      await expect(page).toHaveURL(`${WEB}${path}`);
    }
  });
});

test.describe("sign-in", () => {
  test("a returning user signs in with Google and lands where they were going", async ({ page, mockApi, onboarded }) => {
    await onboarded();
    await page.goto("/app?view=companies");
    await signInWithGoogle(page);
    await expect(page).toHaveURL(`${WEB}/app?view=companies`);
    const account = page.getByRole("button", { name: "Account" });
    await expect(account).toContainText("Wanjiru Mwangi");
    await expect(account).toContainText("wanjiru@kilima.co.ke");
    await expect(page.getByRole("button", { name: "Switch workspace" })).toContainText("Kilima Dairies");
    expect(await mockApi.calls()).toEqual(expect.arrayContaining(["GET /api/v1/auth/login", "GET /api/v1/auth/callback", "GET /api/v1/auth/me"]));
    // The return-to cookie is spent.
    expect((await page.context().cookies()).find((c) => c.name === "corral_return_to")).toBeUndefined();
  });


  test("a first sign-in goes through onboarding, and Save and exit opens the app", async ({ page, mockApi }) => {
    void mockApi;
    await page.goto("/sign-in");
    await signInWithGoogle(page);
    await expect(page).toHaveURL(`${WEB}/onboarding`);
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Save and exit" }).click();
    await expect(page).toHaveURL(`${WEB}/app`);
    await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
    // Onboarded now: /app no longer bounces to onboarding.
    await page.goto("/app?view=segments");
    await expect(page).toHaveURL(`${WEB}/app?view=segments`);
  });

  test("a failed AuthKit round trip shows the designed failure screen", async ({ page, mockApi }) => {
    await mockApi.deny();
    await page.goto("/sign-in");
    await signInWithGoogle(page);
    await expect(page).toHaveURL(`${WEB}/sign-in?error=provider_error`);
    await expect(page.getByText("You cancelled at Google")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try Google again" })).toBeVisible();
  });
});

test.describe("email code sign-in", () => {
  const codeField = (page: Page) => page.getByLabel("Sign-in code");

  test("the email form validates the address, then sends a code without leaving the app", async ({ page, mockApi }) => {
    await page.goto("/sign-in");
    const email = page.getByRole("textbox", { name: "Work email" });
    await email.fill("wanjiru@kilima");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await requestCode(page);
    await expect(page).toHaveURL(`${WEB}/sign-in`);
    await expect(page.getByText(/six-digit code to/)).toContainText("wanjiru@kilima.co.ke");
    await expect(page.getByText(/send a new code in/)).toContainText(/0:(20|19)/);
    const calls = await mockApi.calls();
    expect(calls).toContain("POST /api/v1/auth/code/send");
    expect(calls).not.toContain("GET /api/v1/auth/login");
  });

  test("a wrong code shows the inline error and keeps the digits", async ({ page, mockApi }) => {
    void mockApi;
    await page.goto("/sign-in");
    await requestCode(page);
    await codeField(page).fill("000000");
    await expect(page.getByRole("alert").filter({ hasText: "That code isn’t right" })).toBeVisible();
    await expect(codeField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(codeField(page)).toHaveValue("000000");
    expect(await mockApi.calls()).toContain("POST /api/v1/auth/code/verify");
  });

  test("an expired code locks the field and Send a new code resends", async ({ page, mockApi }) => {
    await page.goto("/sign-in");
    await requestCode(page);
    await codeField(page).fill("111111");
    await expect(page.getByRole("alert").filter({ hasText: "That code has expired. Codes last 10 minutes." })).toBeVisible();
    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect(page.getByText("New code sent")).toBeVisible();
    await expect(codeField(page)).toHaveValue("");
    expect((await mockApi.calls()).filter((c) => c === "POST /api/v1/auth/code/send")).toHaveLength(2);
  });

  test("resend waits out the 20s cooldown, then sends a new code", async ({ page, mockApi }) => {
    await page.clock.install();
    await page.goto("/sign-in");
    await requestCode(page);
    await expect(page.getByRole("button", { name: "send a new code" })).toHaveCount(0);
    await page.clock.runFor(21_000);
    await page.getByRole("button", { name: "send a new code" }).click();
    await expect(page.getByText("New code sent")).toBeVisible();
    await expect(page.getByText(/send a new code in/)).toContainText(/0:(20|19)/);
    expect((await mockApi.calls()).filter((c) => c === "POST /api/v1/auth/code/send")).toHaveLength(2);
  });

  test("a 429 opens the code screen with the server's Retry-After countdown", async ({ page, mockApi }) => {
    await mockApi.limitSends(41);
    await page.goto("/sign-in");
    await requestCode(page);
    await expect(page.getByText("Too many codes asked for")).toBeVisible();
    await expect(page.getByText(/You can ask for 3 codes a minute/)).toContainText(/0:(41|40|39)/);
    await expect(page.getByText(/send a new code in/)).toContainText(/0:(41|40|39)/);
  });

  test("the right code signs in and lands where the user was going", async ({ page, mockApi, onboarded }) => {
    await onboarded();
    await page.goto("/app?view=companies");
    await expect(page).toHaveURL(`${WEB}/sign-in?next=%2Fapp%3Fview%3Dcompanies`);
    await requestCode(page);
    await codeField(page).fill("123 456");
    await expect(page).toHaveURL(`${WEB}/app?view=companies`);
    await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
    expect(await mockApi.calls()).toEqual(expect.arrayContaining(["POST /api/v1/auth/code/verify", "GET /api/v1/auth/me"]));
    expect((await page.context().cookies()).find((c) => c.name === "corral_return_to")).toBeUndefined();
  });

  test("a first sign-in by code goes through onboarding", async ({ page, mockApi }) => {
    void mockApi;
    await page.goto("/sign-in");
    await requestCode(page);
    await codeField(page).fill("123456");
    await expect(page).toHaveURL(`${WEB}/onboarding`);
  });
});

test.describe("sign out", () => {
  test("sign out from the account menu ends the session", async ({ page, mockApi, onboarded }) => {
    await onboarded();
    await page.goto("/sign-in");
    await signInWithGoogle(page);
    await expect(page.getByRole("button", { name: "Account" })).toContainText("Wanjiru Mwangi");
    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${WEB}/`);
    expect(await mockApi.calls()).toContain("POST /api/v1/auth/logout");
    await page.goto("/app");
    await expect(page).toHaveURL(`${WEB}/sign-in?next=%2Fapp`);
  });
});
