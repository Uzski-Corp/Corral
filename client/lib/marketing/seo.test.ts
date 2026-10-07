import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAQ, PLANS } from "./plans";
import {
  CONTACT_EMAIL, HOME_DESCRIPTION, ICONS, LEGAL_NAME, SHARE_IMAGE, THEME, X_HANDLE, absoluteUrl, faqPage, graph, homeJsonLd,
  openGraphFor, organization, pricingJsonLd, serializeJsonLd, softwareApplication, twitterFor, website,
} from "./seo";
import { PUBLIC_ROUTES, ROUTES, SITE_URL, isConfirmed } from "./site";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
/** Width and height from a PNG's IHDR chunk. */
const pngSize = (rel: string) => { const b = readFileSync(path.join(ROOT, "public", rel)); return { sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

describe("absoluteUrl and openGraphFor", () => {
  it("home is SITE_URL itself, like the canonical; every other route is SITE_URL + path", () => {
    expect(absoluteUrl(ROUTES.home)).toBe(SITE_URL);
    expect(absoluteUrl(ROUTES.pricing)).toBe(`${SITE_URL}/pricing`);
    expect(absoluteUrl(ROUTES.dpa)).toBe(`${SITE_URL}/legal/dpa`);
  });

  it.each(PUBLIC_ROUTES)("gives %s its own og:url plus the shared site name, type, locale and image", (route) => {
    const og = openGraphFor(route) as Record<string, unknown>;
    expect(og.url).toBe(absoluteUrl(route));
    expect(String(og.url)).toMatch(/^https:\/\//);
    expect(og).toMatchObject({ siteName: "Corral", type: "website", locale: "en" });
    expect(og.images).toEqual([{ ...SHARE_IMAGE, type: "image/png" }]);
  });

  it("points the share image at a file that ships", () => {
    expect(pngSize(SHARE_IMAGE.url)).toEqual({ sig: "PNG", w: SHARE_IMAGE.width, h: SHARE_IMAGE.height });
  });
});

describe("X handle", () => {
  it("is not set: no Corral handle exists in the repo, so none is invented", () => {
    expect(X_HANDLE).toBeNull();
    expect(twitterFor()).toEqual({ card: "summary_large_image", images: [{ ...SHARE_IMAGE }] });
  });
  it("adds twitter:site and twitter:creator once a handle is filled in", () => {
    expect(twitterFor("@corral")).toMatchObject({ site: "@corral", creator: "@corral" });
  });
});

describe("theme colours", () => {
  it("light is the landing directions' page white and dark is the mark's ink, both from the CSS tokens", () => {
    expect(read("components/marketing/landing-v/landing-v.css")).toContain(`--lv-page: ${THEME.light}`);
    expect(read("app/globals.css")).toContain(`--color-surface-inverse: ${THEME.dark}`);
    expect(read("public/icon.svg")).toContain(`fill="${THEME.dark}"`);
  });
});

describe("icons", () => {
  it.each(ICONS)("$src is a real $sizes PNG", (icon) => {
    const [w, h] = icon.sizes.split("x").map(Number);
    expect(pngSize(icon.src)).toEqual({ sig: "PNG", w, h });
  });
});

describe("JSON-LD", () => {
  it("Organization: Corral by Uzski Corp, the site URL, a real logo and the Talk to us address", () => {
    expect(organization()).toEqual({
      "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Corral", legalName: "Uzski Corp", url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png`, width: 512, height: 512 },
      email: "hello@corral.so",
    });
    expect(LEGAL_NAME).toBe("Uzski Corp");
    expect(read("lib/marketing/legal.ts")).toContain("Uzski Corp");
  });

  it("uses the same contact address as the site's Talk to us link", () => {
    expect(read("components/app/settings/Billing.tsx")).toContain(`mailto:${CONTACT_EMAIL}`);
  });

  it("WebSite is published by the Organization", () => {
    expect(website()).toEqual({ "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Corral", url: SITE_URL, inLanguage: "en", publisher: { "@id": `${SITE_URL}/#organization` } });
  });

  it("SoftwareApplication is a web BusinessApplication with no offers while prices are unconfirmed", () => {
    expect(isConfirmed("prices")).toBe(false);
    const app = softwareApplication();
    expect(app).toMatchObject({ "@type": "SoftwareApplication", name: "Corral", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: HOME_DESCRIPTION });
    expect(app).not.toHaveProperty("offers");
  });

  it("lists an Offer per priced plan once prices are confirmed (never the Let's talk plan)", () => {
    const offers = softwareApplication(true).offers as Record<string, string>[];
    const priced = PLANS.filter((p) => p.price !== null);
    expect(offers).toEqual(priced.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.price), priceCurrency: "USD", url: `${SITE_URL}/pricing` })));
  });

  it("never claims ratings or reviews", () => {
    const keys: string[] = [];
    JSON.stringify([homeJsonLd(), pricingJsonLd(), softwareApplication(true)], (k, v) => { keys.push(k, (v as { "@type"?: string })?.["@type"] ?? ""); return v; });
    expect(keys.filter((k) => /^(aggregate)?rating$|^reviews?$|^reviewrating$|^endorsement$/i.test(k))).toEqual([]);
    expect(keys).toContain("operatingSystem"); // the walk did see the keys
  });

  it("home is one graph: Organization, WebSite, SoftwareApplication", () => {
    const g = homeJsonLd();
    expect(g["@context"]).toBe("https://schema.org");
    expect(g["@graph"].map((t) => t["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
  });

  it("the pricing FAQPage is built from the FAQ the page renders, question for question", () => {
    const [faq] = pricingJsonLd()["@graph"] as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }[];
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(FAQ.map((f) => [f.q, f.a]));
    expect(faqPage(FAQ, ROUTES.pricing)).toMatchObject({ "@type": "FAQPage", url: `${SITE_URL}/pricing` });
  });

  it("graph() wraps things in a schema.org @graph", () => {
    expect(graph({ a: 1 })).toEqual({ "@context": "https://schema.org", "@graph": [{ a: 1 }] });
  });
});

describe("serializeJsonLd", () => {
  const nasty = { a: "</script><script>alert(1)</script>", b: "<!-- x -->", c: "a & b > c", d: "line\u2028para\u2029end" };

  it("escapes everything that could end the script element, open a comment or break JS", () => {
    const out = serializeJsonLd(nasty);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(out).toContain("\\u003c/script\\u003e");
  });

  it("parses back to exactly the same data", () => {
    expect(JSON.parse(serializeJsonLd(nasty))).toEqual(nasty);
    expect(JSON.parse(serializeJsonLd(homeJsonLd()))).toEqual(homeJsonLd());
  });
});
