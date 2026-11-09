/**
 * Search and share metadata for the marketing site (Oct 7, SEO pass): the share image, per-page Open Graph (with
 * og:url), the X handle, theme colours, and the JSON-LD graph. Built from ROUTES, SITE_URL, PLANS and FAQ so none of
 * it can drift from what the pages show.
 */
import type { Metadata } from "next";
import { FAQ as PRICING_FAQ, PLANS } from "./plans";
import { ROUTES, SITE_URL, isConfirmed, type SiteRoute } from "./site";

/** Corral's X/Twitter handle, e.g. "@corral". None exists yet (nothing in the repo, docs or handoffs names one), so
    twitter:site and twitter:creator are left out until this is filled in. Never guess it. */
export const X_HANDLE: `@${string}` | null = null;

/** The address the site's "Talk to us" links write to (components/app/settings/Billing.tsx). */
export const CONTACT_EMAIL = "hello@corral.so";
/** The legal entity behind Corral (lib/marketing/legal.ts). */
export const LEGAL_NAME = "Uzski Corp";

/** Browser chrome and the installed app. Light: the landing directions' page white (--lv-page, Aegon's #F9F9FA), a
    hair off pure white so the bar reads as the page, not a gap above it. Dark: the brand ink of the Corral mark's tile
    and --color-surface-inverse (#1C1C1C); the site has no dark theme, so a dark OS gets the mark's own colour rather
    than a white slab or the loud action blue. */
export const THEME = { light: "#F9F9FA", dark: "#1C1C1C" } as const;

/** Raster icons for the manifest and the Organization logo, rendered from public/icon.svg (rsvg-convert). */
export const ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
] as const;

export const SHARE_IMAGE = {
  url: "/assets/corral-og.png",
  width: 1200,
  height: 630,
  alt: "Corral. Leads, Tailored. Client acquisition, for the agentic era.",
} as const;

/** The absolute address of a public route; home is SITE_URL itself, the same form the canonical takes. */
export const absoluteUrl = (route: SiteRoute | "/") => (route === ROUTES.home ? SITE_URL : `${SITE_URL}${route}`);

/** A page's whole Open Graph block. Next replaces (doesn't merge) a layout's openGraph when a page sets one, so every
    page gets the shared fields back plus its own og:url. og:title and og:description still come from the page. */
export function openGraphFor(route: SiteRoute): NonNullable<Metadata["openGraph"]> {
  return { siteName: "Corral", type: "website", locale: "en", url: absoluteUrl(route), images: [{ ...SHARE_IMAGE, type: "image/png" }] };
}

export function twitterFor(handle: string | null = X_HANDLE): NonNullable<Metadata["twitter"]> {
  return { card: "summary_large_image", images: [{ ...SHARE_IMAGE }], ...(handle ? { site: handle, creator: handle } : {}) };
}

/* ------------------------------------------------------------ JSON-LD */
type Thing = Record<string, unknown>;
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

export const HOME_DESCRIPTION =
  "Corral is a workspace for product knowledge, companies, contacts and the conversations around them.";

export function organization(): Thing {
  return {
    "@type": "Organization", "@id": ORG_ID, name: "Corral", legalName: LEGAL_NAME, url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}${ICONS[1].src}`, width: 512, height: 512 },
    email: CONTACT_EMAIL,
  };
}

export function website(): Thing {
  return { "@type": "WebSite", "@id": SITE_ID, name: "Corral", url: SITE_URL, inLanguage: "en", publisher: { "@id": ORG_ID } };
}

/** The product. Offers only once prices are confirmed (CLAIMS "prices"); never ratings or reviews. */
export function softwareApplication(pricesConfirmed = isConfirmed("prices")): Thing {
  const app: Thing = {
    "@type": "SoftwareApplication", name: "Corral", url: SITE_URL, description: HOME_DESCRIPTION,
    applicationCategory: "BusinessApplication", operatingSystem: "Web", publisher: { "@id": ORG_ID },
  };
  const priced = PLANS.filter((p) => p.price !== null);
  if (pricesConfirmed && priced.length) {
    app.offers = priced.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.price), priceCurrency: "USD", url: absoluteUrl(ROUTES.pricing) }));
  }
  return app;
}

export function faqPage(faq: { q: string; a: string }[], route: SiteRoute): Thing {
  return {
    "@type": "FAQPage", "@id": `${absoluteUrl(route)}#faq`, url: absoluteUrl(route),
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export const graph = (...things: Thing[]) => ({ "@context": "https://schema.org", "@graph": things });
export const homeJsonLd = () => graph(organization(), website(), softwareApplication());
export const pricingJsonLd = () => graph(faqPage(PRICING_FAQ, ROUTES.pricing));

/** JSON for an inline <script>: `<`, `>`, `&` and the JS line separators are escaped, so no string in the data can
    close the script element or start a comment; JSON.parse reads the escapes back as the same characters. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
