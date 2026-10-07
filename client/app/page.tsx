import type { Metadata } from "next";
import { OpenRangeLanding } from "@/components/marketing/open-range";

/** The public home page (ENG-87): the Open Range landing. The design index that lived here is /styleguide/landings. */
export const metadata: Metadata = {
  title: { absolute: "Corral · An agent finds your next leads." },
  description: "Agentic lead generation. You tell Corral what you sell. It reads each company’s site, scores the fit, and drafts the email to the person who decides.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <OpenRangeLanding />;
}
