import type { Metadata } from "next";
import { LandingVariant } from "@/components/marketing/landing-v/Variant";
import { HEROES } from "@/components/marketing/landing-v/copy";
import { JsonLd } from "@/components/marketing/site/JsonLd";
import { HOME_DESCRIPTION, homeJsonLd, openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";

/** The public home page: landing direction 4 (Agent), promoted from /v/4. The other directions stay at /v/1–/v/4. */
export const metadata: Metadata = {
  title: { absolute: HEROES["4"].title },
  description: HOME_DESCRIPTION,
  alternates: { canonical: ROUTES.home },
  openGraph: openGraphFor(ROUTES.home),
};

export default function Home() {
  // Organization, WebSite and SoftwareApplication (lib/marketing/seo.ts), rendered on the server.
  return <><JsonLd data={homeJsonLd()} /><LandingVariant v="4" picker={false} source="home" /></>;
}
