/* One landing variant: the hero for `v`, then the shared stack. /v/[variant] renders this, and / renders variant 4. */
import "@/components/marketing/site/styles";
import "./landing-v.css";
import type { WaitlistSource } from "@/lib/marketing/waitlist";
import { HEROES, VARIANT_IDS, type VariantId } from "./copy";
import { Hero } from "./Heroes";
import { Picker, Replay } from "./Picker";
import { Agents, Faq, FinalAndFooter, How, Integrations, Proof, WorksWith } from "./Sections";

export function LandingVariant({ v, picker = true, source = `v${v}` }: { v: VariantId; picker?: boolean; source?: WaitlistSource }) {
  return (
    <main className="theme-open-range lv" data-variant={v}>
      <Replay><Hero v={v} source={source} /></Replay>
      <WorksWith />
      <How illustrated={v === "4"} />
      <Proof illustrated={v === "4"} />
      <Agents picture={v === "4" ? "clients" : "chat"} />
      <Integrations />
      <Faq />
      <FinalAndFooter source={source} />
      {picker && <Picker names={VARIANT_IDS.map((id) => HEROES[id].name)} current={VARIANT_IDS.indexOf(v)} />}
    </main>
  );
}
