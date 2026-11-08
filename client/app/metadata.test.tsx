/* Search and share metadata per route (Oct 7 SEO pass): og:url, canonical, the viewport's theme-color, the manifest,
   and that the JSON-LD the pages render is the graph from lib/marketing/seo. */
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import { HEROES } from "@/components/marketing/landing-v/copy";
import { absoluteUrl, homeJsonLd, pricingJsonLd, ICONS, THEME } from "@/lib/marketing/seo";
import { ROUTES, SITE_URL, type SiteRoute } from "@/lib/marketing/site";
import * as layout from "@/app/layout";
import manifest from "@/app/manifest";
import Home, { metadata as home } from "@/app/page";
import Pricing, { metadata as pricing } from "@/app/pricing/page";
import { metadata as security } from "@/app/security/page";
import { metadata as mcp } from "@/app/mcp/page";
import { metadata as changelog } from "@/app/changelog/page";
import { metadata as fenceline } from "@/app/fenceline/page";
import { metadata as signIn } from "@/app/sign-in/page";
import { generateMetadata as legal } from "@/app/legal/[doc]/page";
import { generateMetadata as variant } from "@/app/v/[variant]/page";

vi.mock("next/font/local", () => ({ default: () => ({ variable: "" }) }));

const og = (m: Metadata) => m.openGraph as Record<string, unknown> | undefined;
const canonicalOf = (m: Metadata) => (m.alternates?.canonical as string | undefined);
const params = <T,>(p: T) => ({ params: Promise.resolve(p) }) as never;

const STATIC: [SiteRoute, Metadata][] = [
  [ROUTES.home, home], [ROUTES.pricing, pricing], [ROUTES.security, security], [ROUTES.mcp, mcp],
  [ROUTES.changelog, changelog], [ROUTES.fenceline, fenceline], [ROUTES.signIn, signIn],
];

describe("og:url on every public page", () => {
  it.each(STATIC)("%s points og:url at its own absolute address", (route, m) => {
    expect(og(m)?.url).toBe(absoluteUrl(route));
    expect(og(m)?.images).toBeDefined(); // the page's openGraph replaces the layout's, so the image has to come along
  });

  it.each(STATIC.filter(([r]) => r !== ROUTES.signIn))("%s has og:url equal to its canonical", (route, m) => {
    expect(canonicalOf(m)).toBe(route);
    expect(og(m)?.url).toBe(absoluteUrl(canonicalOf(m) as SiteRoute));
  });

  it.each(["terms", "privacy", "dpa"] as const)("/legal/%s", async (doc) => {
    const m = await legal(params({ doc }));
    expect(og(m)?.url).toBe(`${SITE_URL}/legal/${doc}`);
    expect(canonicalOf(m)).toBe(`/legal/${doc}`);
  });

  it.each(["1", "2", "3", "4"] as const)("/v/%s keeps canonical / and noindex, and shares home's og:url", async (v) => {
    const m = await variant(params({ variant: v }));
    expect(canonicalOf(m)).toBe("/");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(og(m)?.url).toBe(SITE_URL);
    expect(m.title).toEqual({ absolute: HEROES[v].title });
  });
});

describe("the root layout", () => {
  it("sets theme-color for light and dark from THEME", () => {
    expect(layout.viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#F9F9FA" },
      { media: "(prefers-color-scheme: dark)", color: "#1C1C1C" },
    ]);
  });

  it("keeps the share image and card, with no invented twitter:site", () => {
    const m = layout.metadata;
    expect(m.metadataBase?.toString()).toBe(`${SITE_URL}/`);
    expect(og(m)).toMatchObject({ siteName: "Corral", type: "website" });
    expect(og(m)).not.toHaveProperty("url");
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
    expect(m.twitter).not.toHaveProperty("site");
    expect(m.twitter).not.toHaveProperty("creator");
  });
});

describe("the web app manifest", () => {
  it("is Corral, standalone from /, in the light theme colour, with the 192 and 512 icons", () => {
    expect(manifest()).toMatchObject({
      name: "Corral", short_name: "Corral", start_url: "/", display: "standalone",
      theme_color: THEME.light, background_color: THEME.light,
    });
    expect(manifest().icons).toEqual(ICONS.map((i) => ({ ...i, purpose: "any" })));
  });
});

describe("JSON-LD on the pages", () => {
  const ldOf = (tree: ReactElement) => {
    const kids = (tree.props as { children: ReactElement[] }).children;
    const ld = kids.find((k) => isValidElement(k) && (k.type as { name?: string }).name === "JsonLd") as ReactElement<{ data: unknown }> | undefined;
    return ld?.props.data;
  };
  it("/ renders the Organization, WebSite and SoftwareApplication graph", () => {
    expect(ldOf(Home())).toEqual(homeJsonLd());
  });
  it("/pricing renders the FAQPage", () => {
    expect(ldOf(Pricing())).toEqual(pricingJsonLd());
  });
});
