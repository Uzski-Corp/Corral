import { InboxSection, ReadSection, Signature, Tally } from "./Product";
import { DevelopersSection, HandoffsSection, SequencesSection } from "./Flow";
import { OpenRangeHero } from "./Hero";
import { People } from "./People";
import { PricingFooter } from "./PricingFooter";

/** The Open Range landing (M10), the public home page since ENG-87. `/` renders it; `/open-range` keeps it at its old address with `/` as canonical. */
export function OpenRangeLanding() {
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
