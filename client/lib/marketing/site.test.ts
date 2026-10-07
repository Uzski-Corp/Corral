import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANGELOG, CLAIMS, CTA, FOOTER, HOME, NAV, PUBLIC_ROUTES, ROUTES, SITE_URL, homeOf, isConfirmed, sitemapRoutes } from "./site";
import { COMPARE, FAQ, PLANS, priceWords } from "./plans";
import { SHARE_CARDS } from "./share";

const path = (h: string) => h.split("#")[0];

describe("marketing site data", () => {
  it("every nav and footer link is a real route, never #", () => {
    const links = [...NAV.map((n) => n.href), ...FOOTER.flatMap((c) => c.links.map((l) => l.href))];
    for (const h of links) {
      expect(h.startsWith("#")).toBe(false);
      expect(PUBLIC_ROUTES).toContain(path(h));
    }
  });
  it("the footer anchors point at sections the home landing has", () => {
    const anchors = FOOTER.flatMap((c) => c.links.map((l) => l.href)).filter((h) => h.includes("#"));
    expect(anchors.filter((h) => path(h) === homeOf()).map((h) => h.split("#")[1])).toEqual(["product", "unibox", "sequences", "handoffs"]);
    expect(anchors.filter((h) => path(h) === ROUTES.mcp).map((h) => h.split("#")[1])).toEqual(["tools", "keys", "errors"]);
  });
  it("home is one of the two landings; the CTAs go somewhere real", () => {
    expect(HOME).toBe("open-range");
    expect(homeOf(HOME)).toBe("/");
    expect(homeOf()).toBe(ROUTES.home);
    expect(PUBLIC_ROUTES).toContain(CTA.start);
    expect(CTA.walkthrough).toMatch(/^mailto:/);
    expect(SITE_URL).toMatch(/^https:\/\//);
  });
  it("the changelog is newest first, dated, and its links resolve", () => {
    const dates = CHANGELOG.map((c) => c.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const c of CHANGELOG) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const i of c.items) if (i.href) expect(PUBLIC_ROUTES).toContain(path(i.href));
    }
  });
  it("says keys can't send, wherever the changelog mentions keys", () => {
    const keys = CHANGELOG.flatMap((c) => c.items).find((i) => /key/i.test(i.area))!;
    expect(keys.text).toMatch(/can’t send/);
  });
  it("lists what still needs confirming before launch, with an owner", () => {
    expect(CLAIMS.length).toBeGreaterThan(0);
    for (const c of CLAIMS) expect(["Krak", "Aegon", "Counsel"]).toContain(c.owner);
    expect(isConfirmed("prices")).toBe(false);
    expect(isConfirmed("nope")).toBe(false);
    expect(CLAIMS.find((c) => c.id === "host")?.owner).toBe("Aegon");
  });
});

describe("sitemap (ENG-87)", () => {
  it("lists / as home and the shared pages, not sign-in, Fenceline or the legal stubs", () => {
    expect(sitemapRoutes()).toEqual(["/", "/pricing", "/security", "/mcp", "/changelog"]);
  });
  it("adds the legal pages once counsel's text is confirmed", () => {
    expect(sitemapRoutes(true)).toEqual(["/", "/pricing", "/security", "/mcp", "/changelog", "/legal/terms", "/legal/privacy", "/legal/dpa"]);
  });
  it("has no /open-range: / is the only address of the Open Range landing", () => {
    expect(PUBLIC_ROUTES).not.toContain("/open-range");
    expect(Object.keys(ROUTES)).not.toContain("openRange");
  });
});

describe("plans", () => {
  it("one primary plan; prices rise; the meter fills", () => {
    expect(PLANS.filter((p) => p.primary)).toHaveLength(1);
    const priced = PLANS.filter((p) => p.price !== null).map((p) => p.price!);
    expect([...priced].sort((a, b) => a - b)).toEqual(priced);
    const m = PLANS.map((p) => p.meter);
    expect([...m].sort((a, b) => a - b)).toEqual(m);
    expect(priceWords(PLANS[0])).toBe("$49");
    expect(priceWords(PLANS[2])).toBe("Let’s talk");
  });
  it("the compare table has a cell for every plan, and scoring costs one credit", () => {
    for (const r of COMPARE.flatMap((g) => g.rows)) for (const p of PLANS) expect(r.cells[p.id]).toBeDefined();
    const scoring = COMPARE.flatMap((g) => g.rows).find((r) => r.label === "Scoring over MCP")!;
    expect(Object.values(scoring.cells)).toEqual(["1 credit", "1 credit", "1 credit"]);
    expect(FAQ.length).toBeGreaterThan(2);
  });
});

describe("share images", () => {
  it("one card per public page, each in an app/ folder, with alt text that reads as a sentence", () => {
    expect(SHARE_CARDS.map((c) => c.dir)).toEqual(["app", "app/fenceline", "app/pricing", "app/security", "app/mcp", "app/changelog"]);
    for (const c of SHARE_CARDS) { expect(c.alt.length).toBeGreaterThan(40); expect(c.alt.endsWith(".")).toBe(true); }
    expect(homeOf("fenceline")).toBe(ROUTES.fenceline);
  });
});

describe("SITE_URL", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const load = async () => (await import("./site")).SITE_URL;
  it("defaults to the live deploy, not a placeholder domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(await load()).toBe("https://corral.uzskicorp.agency");
  });
  it("takes NEXT_PUBLIC_SITE_URL at build time, trimmed and without a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://corral.so/ ");
    expect(await load()).toBe("https://corral.so");
  });
});
