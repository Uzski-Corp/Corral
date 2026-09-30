import type { Metadata } from "next";
import { Closing, FencelineHero, Ledger, Lede, People, Plates, Pricing } from "@/components/marketing/fenceline";

export const metadata: Metadata = {
  title: { absolute: "Corral · Gather the few who fit." },
  alternates: { canonical: "/fenceline" },
  // Open Range is the home page (ENG-87); HANDOFF §18: the other landing stays live but out of search.
  robots: { index: false, follow: true },
  description: "Corral reads every company’s website against what you sell, finds the person who decides, and writes to them the way you would.",
};

export default function FencelinePage() {
  return (
    <main className="theme-fenceline">
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
