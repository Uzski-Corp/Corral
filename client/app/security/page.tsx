import type { Metadata } from "next";
import { openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";
import "@/components/marketing/site/styles";
import { SecurityPage } from "@/components/marketing/site/Security";

export const metadata: Metadata = {
  title: "Security",
  description: "How Corral handles sign-in, workspace isolation, product knowledge and drafts.",
  alternates: { canonical: ROUTES.security },
  openGraph: openGraphFor(ROUTES.security),
};
export default function Page() { return <SecurityPage />; }
