import type { Metadata } from "next";
import { HowItWorks, InboxSection, OpenRangeHero, People, PricingFooter, ReadSection, Signature, Tally } from "@/components/marketing/open-range";

export const metadata: Metadata = {
  title: "Corral — The right fifty, already read.",
  description: "Corral reads every company’s website against what you sell, scores the fit, and puts a real person at the end of every row.",
};

export default function OpenRangePage() {
  return (
    <main className="theme-open-range">
      <OpenRangeHero />
      <Tally />
      <ReadSection />
      <Signature />
      <InboxSection />
      <HowItWorks />
      <People />
      <PricingFooter />
    </main>
  );
}
