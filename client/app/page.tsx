import type { Metadata } from "next";
import { OpenRangeLanding } from "@/components/marketing/open-range";
import { JsonLd } from "@/components/marketing/site/JsonLd";
import { HOME_DESCRIPTION, homeJsonLd, openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";

/** The public home page (ENG-87): the Open Range landing. The design index that lived here is /styleguide/landings. */
export const metadata: Metadata = {
  title: { absolute: "Corral · An agent finds your next leads." },
  description: HOME_DESCRIPTION,
  alternates: { canonical: ROUTES.home },
  openGraph: openGraphFor(ROUTES.home),
};

export default function Home() {
  // Organization, WebSite and SoftwareApplication (lib/marketing/seo.ts), rendered on the server.
  return <><JsonLd data={homeJsonLd()} /><OpenRangeLanding /></>;
}
