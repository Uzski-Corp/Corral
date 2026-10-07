import type { Metadata } from "next";
import { openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";
import "@/components/marketing/site/styles";
import { ChangelogPage } from "@/components/marketing/site/Changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What changed in Corral, and when.",
  alternates: { canonical: ROUTES.changelog },
  openGraph: openGraphFor(ROUTES.changelog),
};
export default function Page() { return <ChangelogPage />; }
