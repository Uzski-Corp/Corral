import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Shared axe helpers for the a11y specs. Every audited route runs at both design widths (HANDOFF-ENG.md:
 * desktop 1440 and mobile 390), WCAG 2.1 A/AA with no skipped rules.
 */
export const WIDTHS = [
  { name: "1440", viewport: { width: 1440, height: 900 } },
  { name: "390", viewport: { width: 390, height: 844 } },
] as const;

/** Fonts loaded and entrance transitions (dialogs, drawers, toasts) settled, so axe measures final colours, not a fade. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), undefined, { polling: 100 });
}

export async function audit(page: Page) {
  await settle(page);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
}
