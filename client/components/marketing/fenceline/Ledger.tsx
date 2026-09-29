import type { ReactNode } from "react";
import { Field, FitBar, Input, Logo, Receipt, Receipts, Tag, type CompanyName } from "@/components/app";

function Entry({ n, title, text, art }: { n: string; title: string; text: string; art: ReactNode }) {
  return <li className="fl-entry"><span className="fl-entry__n">{n}</span><h3>{title}</h3><p>{text}</p><div className="fl-entry__art c-app">{art}</div></li>;
}
const MINI: [CompanyName, number][] = [["Kilima Dairies", 94], ["Pwani Fresh", 91], ["Kivu Coffee Works", 64]];

export function Ledger() {
  return (
    <section id="ledger" className="fl-ledger fl-wrap">
      <div className="fl-ledger__head">
        <div><div className="fl-folio"><b>§ 4</b><span>How it works</span></div><h2 className="fl-h2">Five entries in the ledger.</h2></div>
        <p className="fl-lede">You write the first. Corral keeps the rest, and shows its hand at every step.</p>
      </div>
      <ol>
        <Entry n="I" title="Describe what you sell." text="A pitch deck, a product page, or a paragraph. Corral draws out the pains, the buyer and the objections you already answer."
          art={<Field label="Product" hint="Edit everything after."><Input icon="link" state="focus">coldtrace.io/pitch-2026.pdf</Input></Field>} />
        <Entry n="II" title="It reads the market." text="Search finds the companies; a real browser reads their sites, page by page, the way you would if you had the week."
          art={<Receipts><Receipt meta="2.8s">Searched 1,000 domains</Receipt><Receipt meta="14m">Read 212 sites</Receipt><Receipt meta="why?">Skipped 41</Receipt></Receipts>} />
        <Entry n="III" title="It scores each for that product." text="Fit belongs to a product, not a company. The same dairy can be a 94 for one thing you sell and a 32 for another."
          art={<div className="c-mini">{MINI.map(([c, f]) => <div key={c}><Logo company={c} /><span className="c-strong">{c}</span><span style={{ flex: 1 }} /><FitBar value={f} /></div>)}</div>} />
        <Entry n="IV" title="It writes, at a human pace." text="Sequences rotate across your own inboxes, a few dozen a day each, with unhurried gaps between them."
          art={<Receipts><Receipt meta="6 inboxes">Mailbox pool rotating</Receipt><Receipt meta="per inbox">30 a day</Receipt><Receipt meta="jitter">2–7 min between sends</Receipt></Receipts>} />
        <Entry n="V" title="Replies come home." text="Sorted, drafted, and when someone says yes, the call is booked, the deal opened and the follow-up queued."
          art={<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}><Tag status="Interested" /><Tag status="Objection" /><Tag status="OOO" /><Tag status="Referral" /><Tag status="Meeting booked" /></div>} />
      </ol>
    </section>
  );
}
