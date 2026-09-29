import { expect, signInWithGoogle, test, WEB } from "./fixtures";

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

  test("the email form also hands off to AuthKit, after validating the address", async ({ page, mockApi, onboarded }) => {
    void mockApi;
    await onboarded();
    await page.goto("/sign-in");
    const email = page.getByRole("textbox", { name: "Work email" });
    await email.fill("wanjiru@kilima");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(`${WEB}/sign-in`);
    await email.fill("wanjiru@kilima.co.ke");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page).toHaveURL(`${WEB}/app`);
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
