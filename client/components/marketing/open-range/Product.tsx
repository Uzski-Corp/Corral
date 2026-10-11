import Image from "next/image";
import { FitBar, Receipt, Receipts } from "@/components/app/primitives";
import { FitPiece, ProductFrame, ProvenancePiece, Screen } from "../site";

export function Tally() {
  return (
    <section className="or-tally or-wrap" aria-label="A sample day">
      <p>One Tuesday, the agent for ColdTrace Sensors read <b>212</b> companies, kept <b>48</b>, got <b>12</b> replies and put <b>3</b> meetings on the calendar.</p>
      <span className="or-note">Sample account</span>
    </section>
  );
}

export function ReadSection() {
  return (
    <section id="product" className="or-read">
      <div className="or-wrap or-read__grid">
        <div className="or-read__copy">
          <span className="or-kicker">Who to write</span>
          <h2 className="or-h2">The agent names the person who decides.</h2>
          <p className="or-lede">For each company that fits, Corral finds who owns the problem you solve. It checks the email and shows the page that detail came from.</p>
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
        <h2>Blue from eighty up.</h2>
        <p className="or-lede">Under eighty the bar turns grey and that company stays out of your sequences unless you pull it in. The agent lists each check, its points, and the page it read.</p>
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
        <div><span className="or-kicker">Unibox</span><h2 className="or-h2">The agent drafts the reply.<br />You send it.</h2></div>
        <p className="or-lede">An objection gets the battlecard. Interest gets your calendar. An out-of-office gets a date to try again. The draft cites the page it used, and skips any price it can’t quote.</p>
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
