import { expect, test, type Page } from "@playwright/test";
import { audit, WIDTHS } from "./axe";

/**
 * axe (WCAG 2.1 A/AA, no skipped rules) on the M2 knowledge base and its main review states, at 1440 and 390
 * (HANDOFF-ENG.md §10). Runs in the "review" project: a NEXT_PUBLIC_DESIGN_REVIEW=1 server, because
 * `?state=` is off in production builds and there is no knowledge base API yet (ENG-65/66).
 * M10b adds partial, unreadable and interrupted (ENG-66). ENG-79 owns the rest (live upload, the remaining states, visual baselines).
 */
const kb = (state?: string) => `/app?view=knowledge${state ? `&state=${state}` : ""}`;

const CASES: [state: string | undefined, ready: (page: Page) => Promise<void>][] = [
  [undefined, (p) => expect(p.getByRole("heading", { level: 1, name: "ColdTrace Sensors" })).toBeVisible()],
  ["empty", (p) => expect(p.getByRole("heading", { name: "Teach Corral what you sell" })).toBeVisible()],
  ["sources", (p) => expect(p.getByRole("tab", { name: /Sources/, selected: true })).toBeVisible()],
  ["source", (p) => expect(p.getByText(/Passages/).first()).toBeVisible()],
  ["upload", (p) => expect(p.getByRole("dialog", { name: "Add sources" })).toBeVisible()],
  ["upload-errors", (p) => expect(p.getByRole("dialog", { name: "Add sources" }).getByText(/\.key files aren't supported/)).toBeVisible()],
  ["failed", (p) => expect(p.getByText("Remove the password, then add it again.").first()).toBeVisible()],
  // M10b (ENG-66, backend PR #67): partial with its page strip, and the two server failures with What happened.
  ["partial", (p) => expect(p.getByLabel(/\d+ pages used, \d+ skipped/).first()).toBeVisible()],
  ["unreadable", (p) => expect(p.getByText("Corral couldn’t read this file").filter({ visible: true }).first()).toBeVisible()],
  ["interrupted", (p) => expect(p.getByText("Reading stopped").filter({ visible: true }).first()).toBeVisible()],
  ["conflict", (p) => expect(p.getByText(/\$39 per sensor per month/).first()).toBeVisible()],
];

for (const { name, viewport } of WIDTHS) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    for (const [state, ready] of CASES) {
      test(`knowledge base ${state ?? "(live)"} has no axe violations`, async ({ page }) => {
        await page.goto(kb(state));
        await ready(page);
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
