import { test as base, expect, type Page } from "@playwright/test";

export const API = `http://localhost:${process.env.E2E_API_PORT ?? 8787}`;
export const WEB = `http://localhost:${process.env.E2E_WEB_PORT ?? 3100}`;

type Fixtures = {
  mockApi: { deny(): Promise<void>; down(): Promise<void>; calls(): Promise<string[]> };
  onboarded: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  mockApi: async ({ request }, provide) => {
    await request.post(`${API}/__mock/reset`);
    await provide({
      deny: async () => { await request.post(`${API}/__mock/scenario`, { data: { deny: true } }); },
      down: async () => { await request.post(`${API}/__mock/scenario`, { data: { down: true } }); },
      calls: async () => (await request.get(`${API}/__mock/calls`)).json(),
    });
  },
  onboarded: async ({ context }, provide) => {
    await provide(() => context.addCookies([{ name: "corral_onboarded", value: "1", domain: "localhost", path: "/" }]));
  },
});

export { expect };

/** Sign in from wherever the page is (it must be on /sign-in). */
export async function signInWithGoogle(page: Page) {
  await page.getByRole("button", { name: "Continue with Google" }).click();
}
