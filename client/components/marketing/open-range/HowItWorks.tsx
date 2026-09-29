import type { ReactNode } from "react";
import { Field, FitBar, Input, Logo, Receipt, Receipts, Segmented, Tag, Toast, Toggle, type CompanyName } from "@/components/app";

function Step({ n, title, children, art }: { n: string; title: string; children: ReactNode; art: ReactNode }) {
  return (
    <li className="or-step">
      <div><span className="or-step__n">{n}</span><h3>{title}</h3><p>{children}</p></div>
      <div className="or-step__art c-app">{art}</div>
    </li>
  );
}

const MINI: [CompanyName, number][] = [["Kilima Dairies", 94], ["Pwani Fresh", 91], ["Kivu Coffee Works", 64]];

export function HowItWorks() {
  return (
    <section id="how" className="or-how or-wrap">
      <div className="or-how__head"><span className="or-kicker">How it works</span><h2 className="or-h2">From one product page to a booked Thursday.</h2><p className="or-lede">Five steps. You only do the first one.</p></div>
      <ol className="or-steps">
        <Step n="01" title="Tell it what you sell." art={<>
          <Field label="Product" hint="PDF, URL or a paragraph. You can edit everything after."><Input icon="link" state="focus">coldtrace.io/pitch-2026.pdf</Input></Field>
          <Receipts className="or-mt"><Receipt meta="6s">Found 4 pains, 3 objections, 2 proof points</Receipt><Receipt meta="editable">Drafted ICP: food &amp; beverage, 2+ cold rooms</Receipt></Receipts></>}>
          Drop in a pitch deck or a product page. Corral pulls out the pains it solves, who feels them, and the objections you already know how to answer.
        </Step>
        <Step n="02" title="It reads the market, not a list." art={
          <Receipts><Receipt meta="2.8s">Searched 1,000 domains</Receipt><Receipt meta="14m">Read 212 sites, 38 pages on average</Receipt><Receipt meta="why?">Skipped 41: parked, agency or no cold chain</Receipt></Receipts>}>
          Search finds the companies. A real browser reads their sites the way you would on a slow Friday, only all of them.
        </Step>
        <Step n="03" title="Every company gets a score for that product." art={
          <div className="or-mini">{MINI.map(([c, f]) => <div key={c} className="or-mini__r"><Logo company={c} /><span className="c-strong">{c}</span><span style={{ flex: 1 }} /><FitBar value={f} /></div>)}</div>}>
          Fit is per product, with reasons you can read. The same company can be a 94 for one thing you sell and a 32 for another.
        </Step>
        <Step n="04" title="It writes from your pool, at a human pace." art={
          <div className="or-pool">
            <div className="or-pool__r"><span className="c-strong">Mailbox pool</span><span className="c-muted">6 inboxes</span><span style={{ flex: 1 }} /><Toggle on /></div>
            <div className="or-pool__r"><span className="c-muted">Per inbox, per day</span><span style={{ flex: 1 }} /><Segmented options={["20", "30", "35"]} value="30" /></div>
            <div className="or-pool__r"><span className="c-muted">Gap between sends</span><span style={{ flex: 1 }} /><span className="c-mono" style={{ color: "var(--color-text)" }}>2–7 min</span></div>
          </div>}>
          Sequences rotate across your own inboxes, capped per mailbox with random gaps, so replies come from people, not spam filters.
        </Step>
        <Step n="05" title="Replies come back sorted, with a draft." art={<>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}><Tag status="Interested" /><Tag status="Objection" /><Tag status="OOO" /><Tag status="Referral" /><Tag status="Not interested" /></div>
          <div className="or-mt"><Toast meta="Cal.com">Brian Kamau booked Thu 10:30</Toast></div></>}>
          Each reply is classified in about a second and answered from your battlecards. You read, edit, send.
        </Step>
      </ol>
    </section>
  );
}
