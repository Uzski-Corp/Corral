import type { Metadata } from "next";
import { openGraphFor, pricingJsonLd } from "@/lib/marketing/seo";
import { JsonLd } from "@/components/marketing/site/JsonLd";
import { pricingGateOn } from "@/lib/marketing/flags";
import { ROUTES } from "@/lib/marketing/site";
import "@/components/marketing/site/styles";
import { PricingPage } from "@/components/marketing/site/Pricing";

/** Behind the gate the page says nothing about plans: no plan count, no included features, no prices. */
const GATED_DESCRIPTION = "Tell us a little about you and we’ll email you Corral’s pricing.";
const OPEN_DESCRIPTION = "Three plans, priced by how much of the market Corral reads for you. Every plan includes the Unibox copilot, Cal.com booking and the MCP server.";

export const metadata: Metadata = {
  title: "Pricing",
  description: pricingGateOn() ? GATED_DESCRIPTION : OPEN_DESCRIPTION,
  alternates: { canonical: ROUTES.pricing },
  openGraph: openGraphFor(ROUTES.pricing),
};
/** The FAQ on this page, as FAQPage structured data from the same FAQ list the page renders (none behind the gate: no FAQ, no offers). */
export default function Page() { return <>{!pricingGateOn() && <JsonLd data={pricingJsonLd()} />}<PricingPage /></>; }
