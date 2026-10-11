/* One landing variant: the hero for `v`, then the shared stack. /v/[variant] renders this. */
import "@/components/marketing/site/styles";
import "./landing-v.css";
import { HEROES, VARIANT_IDS, type VariantId } from "./copy";
import { Hero } from "./Heroes";
import { Picker, Replay } from "./Picker";
import { Agents, Faq, FinalAndFooter, How, Integrations, Proof, WorksWith } from "./Sections";

export function LandingVariant({ v, picker = true }: { v: VariantId; picker?: boolean }) {
  return (
    <main className="theme-open-range lv" data-variant={v}>
      <Replay><Hero v={v} /></Replay>
      <WorksWith />
      <How />
      <Proof />
      <Agents picture={v === "4" ? "clients" : "chat"} />
      <Integrations />
      <Faq />
      <FinalAndFooter source={`v${v}`} />
      {picker && <Picker names={VARIANT_IDS.map((id) => HEROES[id].name)} current={VARIANT_IDS.indexOf(v)} />}
    </main>
  );
}
