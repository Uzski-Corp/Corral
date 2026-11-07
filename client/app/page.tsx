import type { Metadata } from "next";
import { EDITORIAL_DESCRIPTION, EDITORIAL_TITLE, EditorialLanding } from "@/components/marketing/landing-v/Editorial";
import { JsonLd } from "@/components/marketing/site/JsonLd";
import { homeJsonLd, openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";

/** The public home page: the recommended editorial landing. Directions 1–4 stay at /v/1–/v/4. */
export const metadata: Metadata = {
  title: { absolute: EDITORIAL_TITLE },
  description: EDITORIAL_DESCRIPTION,
  alternates: { canonical: ROUTES.home },
  openGraph: openGraphFor(ROUTES.home),
};

export default function Home() {
  return <><JsonLd data={homeJsonLd()} /><EditorialLanding /></>;
}
