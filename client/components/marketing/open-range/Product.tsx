import Image from "next/image";
import { FitBar, Receipt, Receipts } from "@/components/app/primitives";
import { FitPiece, ProductFrame, ProvenancePiece, Screen } from "../site";

export function Tally() {
  return (
    <section className="or-tally or-wrap" aria-label="A sample day">
      <p>One Tuesday for ColdTrace Sensors: <b>212</b> companies read, <b>48</b> that fit, <b>12</b> replies, <b>3</b> meetings on the calendar.</p>
      <span className="or-note">Sample account</span>
    </section>
  );
}

export function ReadSection() {
  return (
    <section id="product" className="or-read">
      <div className="or-wrap or-read__grid">
        <div className="or-read__copy">
          <span className="or-kicker">Segments</span>
          <h2 className="or-h2">Every row is a person who decides.</h2>
          <p className="or-lede">Not a domain, not a guess at a title. Corral finds the one person who owns the problem your product solves, checks their email, and shows where every detail came from.</p>
          <Receipts className="c-app or-read__rc">
            <Receipt meta="4s">Read 38 pages of kilima.co.ke</Receipt>
            <Receipt meta="ColdTrace Sensors">Matched your “3-site pilot” proof point</Receipt>
            <Receipt meta="verified">Found Wanjiru Mwangi, Head of Supply Chain</Receipt>
          </Receipts>
        </div>
        <div className="or-read__plate">
          <Image className="or-bg" src="/corral/or/range-grass.jpg" alt="" fill sizes="(max-width: 1080px) 100vw, 58vw" />
          <div className="or-read__zoom"><ProvenancePiece /></div>
        </div>
      </div>
    </section>
  );
}

export function Signature() {
  return (
    <section className="or-sig or-wrap" aria-label="The fit score">
      <div className="or-sig__bar c-app"><FitBar value={94} size="lg" /></div>
      <div className="or-sig__copy">
        <h2>Blue from eighty up. Grey below, with reasons.</h2>
        <p className="or-lede">The fit score is the one thing Corral asks you to trust, so it always shows its work: each check, its points, and the page it read. Under eighty it turns grey and stays out of your sequences unless you pull it in.</p>
        <FitPiece />
      </div>
    </section>
  );
}

export function InboxSection() {
  return (
    <section id="unibox" className="or-inbox" aria-label="Unibox">
      <Image className="or-bg" src="/corral/or/range-sky.jpg" alt="" fill sizes="100vw" />
      <div className="or-wrap or-inbox__copy">
        <div><span className="or-kicker">Unibox</span><h2 className="or-h2">Replies arrive sorted,<br />with the answer drafted.</h2></div>
        <p className="or-lede">Objections get your battlecard. Interest gets your calendar. Out-of-office gets a date. The draft cites what it used and leaves out what it can’t stand behind, and you stay the one who presses send.</p>
      </div>
      <div className="or-inbox__plate">
        <ProductFrame tone="photo" height={700} phone={640} label="The Unibox, Brian Kamau’s price objection with Corral’s draft"
          caption="Brian says the price is the blocker. Corral drafted the answer from your knowledge base, with no price it can’t quote.">
          <Screen view="unibox" unibox="draft" />
        </ProductFrame>
      </div>
    </section>
  );
}
