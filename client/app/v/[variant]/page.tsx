import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";
import { LandingVariant } from "@/components/marketing/landing-v/Variant";
import { DESCRIPTION, HEROES, VARIANT_IDS, type VariantId } from "@/components/marketing/landing-v/copy";

/* Landing directions for Oct 7 (Bau): /v/1–/v/4, static pages (generateStaticParams, no runtime), out of search until
   one is promoted to /. The build writes .next/server/app/v/{1..4}.html, which hosting/landing/assemble.mjs copies. */
const isVariant = (v: string): v is VariantId => (VARIANT_IDS as string[]).includes(v);

export function generateStaticParams() { return VARIANT_IDS.map((variant) => ({ variant })); }
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/v/[variant]">): Promise<Metadata> {
  const { variant } = await params;
  if (!isVariant(variant)) return {};
  return { title: { absolute: HEROES[variant].title }, description: DESCRIPTION, robots: { index: false, follow: false }, alternates: { canonical: "/" }, openGraph: openGraphFor(ROUTES.home) };
}

export default async function Page({ params }: PageProps<"/v/[variant]">) {
  const { variant } = await params;
  if (!isVariant(variant)) notFound();
  return <LandingVariant v={variant} />;
}
