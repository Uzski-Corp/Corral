import type { Metadata } from "next";
import { DevelopersSection, HandoffsSection, InboxSection, OpenRangeHero, People, PricingFooter, ReadSection, SequencesSection, Signature, Tally } from "@/components/marketing/open-range";

export const metadata: Metadata = {
  title: { absolute: "Corral · The right fifty, already read." },
  description: "Corral reads every company’s website against what you sell, scores the fit, and puts a real person at the end of every row.",
  alternates: { canonical: "/open-range" },
};

export default function OpenRangePage() {
  return (
    <main className="theme-open-range">
      <OpenRangeHero />
      <Tally />
      <ReadSection />
      <Signature />
      <InboxSection />
      <SequencesSection />
      <HandoffsSection />
      <People />
      <DevelopersSection />
      <PricingFooter />
    </main>
  );
}
