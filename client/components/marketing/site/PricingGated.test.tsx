/* The pricing gate's rule: with the flag on, no plan, tier or price shows anywhere on /pricing, in its structured data,
   its description, or the Fenceline page; with it off everything is as it was. */
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANS } from "@/lib/marketing/plans";
import { pricingJsonLd, softwareApplication } from "@/lib/marketing/seo";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "" }), Inter_Tight: () => ({ variable: "" }), Geist_Mono: () => ({ variable: "" }), Newsreader: () => ({ variable: "" }) }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
const gate = (on: boolean) => vi.stubEnv("NEXT_PUBLIC_PRICING_GATE", on ? "1" : "");

describe("PricingPage", () => {
  it("flag off: the open pricing page, with its plans", async () => {
    gate(false);
    const { PricingPage } = await import("./Pricing");
    const { container } = render(<PricingPage />);
    expect(screen.queryByRole("button", { name: "See pricing" })).toBeNull();
    for (const p of PLANS) expect(container.textContent).toContain(p.name);
  });

  describe("flag on", () => {
    beforeEach(() => gate(true));
    it("one headline, one line, one button; no plan name, no price, no FAQ", async () => {
      const { PricingPage } = await import("./Pricing");
      const { container } = render(<PricingPage />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("button", { name: "See pricing" })).toBeInTheDocument();
      const text = container.textContent ?? "";
      for (const p of PLANS) expect(text).not.toContain(p.name);
      expect(text).not.toMatch(/\$\s?\d|\d\s?\/\s?(mo|month|seat)|per month|per seat/i);
      expect(container.querySelector("script[type='application/ld+json']")).toBeNull();
    });
    it("the page renders no JSON-LD and the description names no plans", async () => {
      const page = await import("@/app/pricing/page");
      const html = renderToStaticMarkup(<>{page.default()}</>);
      expect(html).not.toContain("application/ld+json");
      expect(String(page.metadata.description)).not.toMatch(/three plans|every plan|\$/i);
      expect(page.metadata.description).toMatch(/pricing/i);
    });
    it("structured data carries no offers and no pricing FAQ", async () => {
      const seo = await import("@/lib/marketing/seo");
      expect(seo.pricingJsonLd()["@graph"]).toEqual([]);
      expect(seo.softwareApplication(true)).not.toHaveProperty("offers");
      expect(JSON.stringify(seo.homeJsonLd())).not.toMatch(/"price"|Offer/);
    });
    it("the Fenceline page drops its Pricing section", async () => {
      const { default: Fenceline } = await import("@/app/fenceline/page");
      gate(false);
      const open = renderToStaticMarkup(<Fenceline />);
      vi.resetModules(); gate(true);
      const { default: Gated } = await import("@/app/fenceline/page");
      const closed = renderToStaticMarkup(<Gated />);
      expect(closed.length).toBeLessThan(open.length);
    });
  });
});

describe("seo with the flag off", () => {
  it("keeps the FAQ graph", () => {
    gate(false);
    expect((pricingJsonLd()["@graph"] as unknown[]).length).toBeGreaterThan(0);
    expect(softwareApplication(false)).not.toHaveProperty("offers");
  });
});
