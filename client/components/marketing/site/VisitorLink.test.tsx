import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { forgetVisitor, rememberVisitor } from "@/lib/marketing/visitor";
import { CTA, CTA_SIGNED_IN } from "@/lib/marketing/site";
import { VisitorLink } from "./VisitorLink";
import { OpenRangeHero } from "@/components/marketing/open-range/Hero";
import { FencelineHero } from "@/components/marketing/fenceline/Hero";
import { McpPage } from "./Mcp";

afterEach(() => forgetVisitor());

const link = (name: string) => screen.getByRole("link", { name });

describe("VisitorLink (M10c signed-in CTAs)", () => {
  it("goes to sign-in signed out and to the app signed in, same element and class", () => {
    const { rerender } = render(<VisitorLink className="x" href={CTA.start} signedInHref={CTA_SIGNED_IN.start}>Go</VisitorLink>);
    expect(link("Go").getAttribute("href")).toBe(CTA.start);
    rerender(<VisitorLink className="x" href={CTA.start} signedInHref={CTA_SIGNED_IN.start} visitor={{ name: "W M", avatarUrl: null }}>Go</VisitorLink>);
    expect(link("Go").getAttribute("href")).toBe("/app");
    expect(link("Go").className).toBe("x");
  });

  it("follows the corral_visitor hint on the heroes and /mcp", () => {
    rememberVisitor({ name: "Wanjiru Mwangi", avatarUrl: null });
    const a = render(<OpenRangeHero />);
    expect(link("Add your first product").getAttribute("href")).toBe("/app");
    a.unmount();
    const b = render(<FencelineHero />);
    expect(link("Start with one product").getAttribute("href")).toBe("/app");
    b.unmount();
    render(<McpPage />);
    expect(link("Sign in and connect").getAttribute("href")).toBe("/app?view=settings&state=mcp");
  });

  it("keeps sign-in for a signed-out visitor", () => {
    render(<McpPage />);
    expect(link("Sign in and connect").getAttribute("href")).toBe(CTA.start);
  });
});
