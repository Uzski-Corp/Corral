import { test as base, expect, type Page } from "@playwright/test";

export const API = `http://localhost:${process.env.E2E_API_PORT ?? 8787}`;
export const WEB = `http://localhost:${process.env.E2E_WEB_PORT ?? 3100}`;

type Fixtures = {
  mockApi: { deny(): Promise<void>; down(): Promise<void>; limitSends(retryAfter: number): Promise<void>; calls(): Promise<string[]> };
  onboarded: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  mockApi: async ({ request }, provide) => {
    await request.post(`${API}/__mock/reset`);
    await provide({
      deny: async () => { await request.post(`${API}/__mock/scenario`, { data: { deny: true } }); },
      down: async () => { await request.post(`${API}/__mock/scenario`, { data: { down: true } }); },
      limitSends: async (retryAfter) => { await request.post(`${API}/__mock/scenario`, { data: { sendLimited: retryAfter } }); },
      calls: async () => (await request.get(`${API}/__mock/calls`)).json(),
    });
  },
  onboarded: async ({ context }, provide) => {
    await provide(() => context.addCookies([{ name: "corral_onboarded", value: "1", domain: "localhost", path: "/" }]));
  },
});

export { expect };

/** Ask for an email code from /sign-in and wait for the code screen. */
export async function requestCode(page: Page, email = "wanjiru@kilima.co.ke") {
  await page.getByRole("textbox", { name: "Work email" }).fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

/** Sign in from wherever the page is (it must be on /sign-in). */
export async function signInWithGoogle(page: Page) {
  await page.getByRole("button", { name: "Continue with Google" }).click();
}
