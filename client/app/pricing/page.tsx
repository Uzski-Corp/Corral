import type { Metadata } from "next";
import "@/components/marketing/site/styles";
import { PricingPage } from "@/components/marketing/site/Pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Three plans, priced by how much of the market Corral reads for you. Every plan includes the Unibox copilot, Cal.com booking and the MCP server.",
  alternates: { canonical: "/pricing" },
};
export default function Page() { return <PricingPage />; }
