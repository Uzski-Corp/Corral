import type { Metadata } from "next";
import localFont from "next/font/local";
import { openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";
import { Closing, FencelineHero, Ledger, Lede, People, Plates, Pricing } from "@/components/marketing/fenceline";

export const metadata: Metadata = {
  title: { absolute: "Corral · Gather the few who fit." },
  alternates: { canonical: ROUTES.fenceline },
  openGraph: openGraphFor(ROUTES.fenceline),
  // Open Range is the home page (ENG-87); HANDOFF §18: the other landing stays live but out of search.
  robots: { index: false, follow: true },
  description: "Corral reads every company’s website against what you sell, finds the person who decides, and writes to them the way you would.",
};

/* Fenceline's serif, scoped here (M10c): only this route downloads and preloads it. Optical sizes and italic
   (the hero's "fit" and the captions). adjustFontFallback sizes a local Times New Roman to its metrics for the swap. */
const newsreader = localFont({
  src: [
    { path: "../fonts/newsreader-latin-variable.woff2", weight: "200 800", style: "normal" },
    { path: "../fonts/newsreader-italic-latin-variable.woff2", weight: "200 800", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export default function FencelinePage() {
  return (
    <main className={`theme-fenceline ${newsreader.variable}`}>
      <FencelineHero />
      <Lede />
      <Plates />
      <Ledger />
      <People />
      <Pricing />
      <Closing />
    </main>
  );
}
