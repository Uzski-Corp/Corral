/* Open Range (M10): the rest of the loop, each on a real screen or component. Sequences (M6), handoffs (M8), MCP (M9). */
import Link from "next/link";
import { Receipt, Receipts } from "@/components/app/primitives";
import { TOOLS } from "@/lib/mcp/tools";
import { ROUTES } from "@/lib/marketing/site";
import { HandoffPiece, McpConfigPiece, ProductFrame, Screen } from "../site";

export function SequencesSection() {
  return (
    <section id="sequences" className="or-flow or-wrap">
      <div className="or-flow__copy">
        <span className="or-kicker">Sequences</span>
        <h2 className="or-h2">It writes at a human pace, and checks before it sends.</h2>
        <p className="or-lede">Steps rotate across your own mailboxes, a few dozen a day each, with random gaps. Before a sequence goes out, Corral checks every field and every mailbox, and stops on the one thing that would embarrass you.</p>
      </div>
      <ProductFrame height={640} phone={600} label="A sequence’s Launch dialog: who gets it, when, from which mailboxes" caption="Launch asks who gets it, when, and from which mailboxes, before step one goes out.">
        <Screen view="sequences" sequences="launch" />
      </ProductFrame>
    </section>
  );
}

export function HandoffsSection() {
  return (
    <section id="handoffs" className="or-hand or-wrap">
      <div className="or-hand__copy">
        <span className="or-kicker">Handoffs</span>
        <h2 className="or-h2">When they say yes, the rest happens.</h2>
        <p className="or-lede">Grace books through your Cal.com. The deal opens in Phoenix ERP with the thread attached, and nurture moves to AutoSend, so nobody copies anything between tabs.</p>
        <Receipts className="c-app or-mt">
          <Receipt meta={<img className="h-logo h-logo--cal is-sm" src="/assets/cal-logo.svg" alt="Cal.com" />}>Grace Holloway booked Thu 10:30</Receipt>
          <Receipt meta="Phoenix ERP">Deal opened: Nyota Beverages, pilot</Receipt>
          <Receipt meta={<img className="h-logo h-logo--as" src="/assets/AutosendLogoSquareIndigo.svg" alt="AutoSend" />}>Moved to the booked-call nurture</Receipt>
        </Receipts>
      </div>
      <div className="or-hand__piece"><HandoffPiece /></div>
    </section>
  );
}

export function DevelopersSection() {
  return (
    <section className="or-dev or-wrap" aria-labelledby="or-dev-h">
      <div className="or-dev__copy">
        <span className="or-kicker">From your editor, too</span>
        <h2 id="or-dev-h" className="or-h2">Ask Cursor who replied.</h2>
        <p className="or-lede">Corral is an MCP server. Cursor, Claude and other clients sign in as you and get {TOOLS.length} tools, with the same guardrails as the Send button. Keys for jobs that run alone can draft, never send.</p>
        <p className="or-mt"><Link className="or-textlink" href={ROUTES.mcp}>How the MCP server works →</Link></p>
      </div>
      <div className="or-dev__piece"><McpConfigPiece /></div>
    </section>
  );
}
