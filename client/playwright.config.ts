import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs a production build of the client against e2e/mock-api.mjs, a stand-in for the
 * Corral API auth contract (PR #2). Both run on localhost so the API's cookie reaches the app,
 * as it does in dev with the real server.
 *
 * The "review" project (e2e/kb.*.spec.ts) runs against a second server with NEXT_PUBLIC_DESIGN_REVIEW=1,
 * because `?state=` review states are off in production builds. It is `next dev`, whose output lives in
 * .next/dev, so it doesn't clash with the production build in .next.
 *
 * PLAYWRIGHT_CHANNEL=chrome uses the system Chrome instead of Playwright's bundled Chromium.
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8787);
const REVIEW_PORT = Number(process.env.E2E_REVIEW_PORT ?? 3101);
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;
const REVIEW = `http://localhost:${REVIEW_PORT}`;
const REVIEW_SPECS = /kb\.[\w-]+\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // one mock API with shared scenario state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: "app", testIgnore: REVIEW_SPECS },
    { name: "review", testMatch: REVIEW_SPECS, use: { baseURL: REVIEW } },
  ],
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: `${API}/health`,
      env: { PORT: String(API_PORT), FRONTEND_URL: WEB },
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      // exec: next start replaces the shell, so it gets Playwright's SIGTERM on teardown.
      command: `./node_modules/.bin/next build && exec ./node_modules/.bin/next start -p ${WEB_PORT}`,
      url: `${WEB}/sign-in`,
      env: { NEXT_PUBLIC_API_URL: API, NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `exec ./node_modules/.bin/next dev -p ${REVIEW_PORT}`,
      url: `${REVIEW}/app?view=knowledge`,
      env: { NEXT_PUBLIC_DESIGN_REVIEW: "1", NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
  metadata: { api: API },
});
