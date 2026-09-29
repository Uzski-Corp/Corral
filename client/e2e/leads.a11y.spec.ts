import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LEADS_REVIEW_STATES, SEGMENT_REVIEW_STATES } from "../lib/leads/state";

/**
 * axe (WCAG 2.1 A/AA, no skipped rules) on the M3 lead table, segment builder and CSV import, in every
 * review state from HANDOFF-ENG.md §11. Runs in the "review" project (NEXT_PUBLIC_DESIGN_REVIEW=1),
 * because `?state=` is off in production builds and there is no leads API yet (ENG-81).
 */
async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
}

// The design honours reduced motion (system.css), which also keeps entrance fades out of the contrast check.
test.use({ reducedMotion: "reduce" });

const ROUTES: [view: string, state: string | undefined][] = [
  ["companies", undefined], ...LEADS_REVIEW_STATES.map((s): [string, string] => ["companies", s]),
  ["segments", undefined], ...SEGMENT_REVIEW_STATES.map((s): [string, string] => ["segments", s]),
];

for (const [view, state] of ROUTES) {
  test(`${view} ${state ?? "(live)"} has no axe violations`, async ({ page }) => {
    await page.goto(`/app?view=${view}${state ? `&state=${state}` : ""}`);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Let entrance transitions (dialogs, drawers, toasts) settle so axe measures the final colours, not a fade.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), undefined, { polling: 100 });
    expect(await audit(page)).toEqual([]);
  });
}
