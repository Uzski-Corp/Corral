import type { Metadata } from "next";
import { Closing, FencelineHero, Ledger, Lede, People, Plates, Pricing } from "@/components/marketing/fenceline";

export const metadata: Metadata = {
  title: "Corral — Gather the few who fit.",
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
