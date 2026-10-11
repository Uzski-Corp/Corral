import type { Metadata } from "next";
import { openGraphFor, pricingJsonLd } from "@/lib/marketing/seo";
import { JsonLd } from "@/components/marketing/site/JsonLd";
import { ROUTES } from "@/lib/marketing/site";
import "@/components/marketing/site/styles";
import { PricingPage } from "@/components/marketing/site/Pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Three plans, priced by how much of the market Corral reads for you. Every plan includes the Unibox copilot, Cal.com booking and the MCP server.",
  alternates: { canonical: ROUTES.pricing },
  openGraph: openGraphFor(ROUTES.pricing),
};
/** The FAQ on this page, as FAQPage structured data from the same FAQ list the page renders. */
export default function Page() { return <><JsonLd data={pricingJsonLd()} /><PricingPage /></>; }
