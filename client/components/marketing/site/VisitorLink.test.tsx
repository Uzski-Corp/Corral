import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { forgetVisitor, rememberVisitor } from "@/lib/marketing/visitor";
import { CTA, CTA_SIGNED_IN } from "@/lib/marketing/site";
import { VisitorLink } from "./VisitorLink";
import { FencelineHero } from "@/components/marketing/fenceline/Hero";

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

  it("follows the corral_visitor hint on the Fenceline hero", () => {
    rememberVisitor({ name: "Wanjiru Mwangi", avatarUrl: null });
    render(<FencelineHero />);
    expect(link("Start with one product").getAttribute("href")).toBe("/app");
  });

  it("keeps sign-in for a signed-out visitor", () => {
    render(<FencelineHero />);
    expect(link("Start with one product").getAttribute("href")).toBe(CTA.start);
  });
});
