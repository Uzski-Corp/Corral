/* /pricing behind the gate (Bau, Oct 17): the real nav, one centred head (kicker, headline, one line) with one button,
   and the reef band carrying only the real footer. No plan, tier, name, price or bullet is rendered, and plans.ts is not
   imported, so nothing about the plans is in this page's HTML or script. "See pricing" opens the form (PricingGate). */
import { ROUTES } from "@/lib/marketing/site";
import { AgentSitePage } from "@/components/marketing/landing-v/SitePage";
import { DuskFooter } from "@/components/marketing/landing-v/Sections";
import { PricingGate } from "./PricingGate";
import { PRICING_GATE as C } from "./pricing-gate-copy";

export function PricingGated() {
  return (
    <AgentSitePage center current={ROUTES.pricing} kicker={C.kicker} title={C.title} lede={C.lede} headClass="pg-hero" section="pricing"
      action={<PricingGate source="hero" />} navCtaHref={`${ROUTES.home}#join`} closing={<DuskFooter className="pg-dusk" />}>
      {null}
    </AgentSitePage>
  );
}
