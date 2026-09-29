import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * axe (WCAG 2.1 A/AA, no skipped rules) on the M2 knowledge base and its main review states
 * (HANDOFF-ENG.md §10). Runs in the "review" project: a NEXT_PUBLIC_DESIGN_REVIEW=1 server, because
 * `?state=` is off in production builds and there is no knowledge base API yet (ENG-65/66).
 * ENG-79 owns the rest (live upload, the remaining states, visual baselines).
 */
async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
}

const kb = (state?: string) => `/app?view=knowledge${state ? `&state=${state}` : ""}`;

const CASES: [state: string | undefined, ready: (page: Page) => Promise<void>][] = [
  [undefined, (p) => expect(p.getByRole("heading", { level: 1, name: "ColdTrace Sensors" })).toBeVisible()],
  ["empty", (p) => expect(p.getByRole("heading", { name: "Teach Corral what you sell" })).toBeVisible()],
  ["sources", (p) => expect(p.getByRole("tab", { name: /Sources/, selected: true })).toBeVisible()],
  ["source", (p) => expect(p.getByText(/Passages/).first()).toBeVisible()],
  ["upload", (p) => expect(p.getByRole("dialog", { name: "Add sources" })).toBeVisible()],
  ["upload-errors", (p) => expect(p.getByRole("dialog", { name: "Add sources" }).getByText(/\.key files aren't supported/)).toBeVisible()],
  ["failed", (p) => expect(p.getByText("Remove the password, then add it again.").first()).toBeVisible()],
  ["conflict", (p) => expect(p.getByText(/\$39 per sensor per month/).first()).toBeVisible()],
];

for (const [state, ready] of CASES) {
  test(`knowledge base ${state ?? "(live)"} has no axe violations`, async ({ page }) => {
    await page.goto(kb(state));
    await ready(page);
    expect(await audit(page)).toEqual([]);
  });
}
