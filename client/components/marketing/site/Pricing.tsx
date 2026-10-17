/* /pricing (M10). Three short plan cards, then what a read is, the comparison grouped the way the product is, and the FAQ.
   With NEXT_PUBLIC_PRICING_GATE=1 (lib/marketing/flags.ts) it is the gated page instead: PricingGated.tsx, no plans at all. */
import Link from "next/link";
import { Receipt, Receipts } from "@/components/app/primitives";
import { COMPARE, FAQ, PLANS, priceWords, type Cell } from "@/lib/marketing/plans";
import { ROUTES, claim } from "@/lib/marketing/site";
import { WAITLIST } from "@/components/marketing/landing-v/copy";
import { AgentSitePage } from "@/components/marketing/landing-v/SitePage";
import { pricingGateOn } from "@/lib/marketing/flags";
import { Section, ToConfirm } from "./Chrome";
import { PricingGated } from "./PricingGated";

const cell = (c: Cell) => (c === true ? <span className="sn-yes">Included</span> : c === false ? <span className="sn-no" aria-label="Not included">—</span> : c);

export function PricingPage() {
  return pricingGateOn() ? <PricingGated /> : <OpenPricingPage />;
}

function OpenPricingPage() {
  const prices = claim("prices")!;
  return (
    <AgentSitePage center current={ROUTES.pricing} kicker="Pricing" title="Pay for the ground you cover."
      lede="Every plan reads, scores, writes and sorts. Billed monthly, leave whenever.">
      <div className="sn-wrap">
        <ol className="sv-plans" aria-label="Plans">
          {PLANS.map((p) => (
            <li key={p.id} className={`sv-plan${p.primary ? " is-primary" : ""}`}>
              <h2>{p.name}{p.primary && <span className="sv-plan__pick">Most teams</span>}</h2>
              <p className="sv-plan__line">{p.line}</p>
              <p className="sv-plan__price"><span className="sv-plan__n">{priceWords(p)}</span>{p.price !== null && <span>a month</span>}</p>
              <ul className="sv-plan__inc">{p.includes.map((i) => <li key={i}>{i}</li>)}</ul>
              <a className="sv-plan__cta" href="#join">{WAITLIST.cta}</a>
            </li>
          ))}
        </ol>
        <p className="sv-plans__note">Prices in US dollars. Every plan includes the MCP server.{!prices.confirmed && <> <ToConfirm who={prices.owner} /></>}</p>
      </div>

      <Section n="01" id="reads" title="What you’re paying for is reading.">
        <p className="sn-body">A read is Corral opening one company’s website, reading it page by page like a person on a slow Friday, and scoring it for one of your products. Everything after that, the writing, the replies, the booking, comes with it.</p>
        <div className="c-app sn-receipts">
          <Receipts><Receipt meta="2.8s">Searched 1,000 domains for “dairy processor, Kenya”</Receipt><Receipt meta="14m">Read 212 sites, 38 pages on average</Receipt>
            <Receipt meta="0 reads">Skipped 41: parked, agency or no cold chain</Receipt><Receipt meta="212 reads">Scored each for ColdTrace Sensors</Receipt></Receipts>
        </div>
        <p className="sn-small">Skipped sites don’t count. Opening a company you already read doesn’t count. Re-scoring after you change a product does.</p>
      </Section>

      <Section n="02" id="compare" title="Plan by plan." wide>
        <table className="sn-compare">
          <caption className="u-sr">What each plan includes</caption>
          <thead><tr><th scope="col"><span className="u-sr">Feature</span></th>{PLANS.map((p) => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
          {COMPARE.map((g) => (
            <tbody key={g.group}>
              <tr className="sn-compare__group"><th scope="rowgroup" colSpan={4}>{g.group}</th></tr>
              {g.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}{r.note && <span className="sn-compare__note">{r.note}</span>}</th>
                  {PLANS.map((p) => <td key={p.id} data-plan={p.name}>{cell(r.cells[p.id])}</td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Section>

      <Section n="03" id="questions" title="Before you ask.">
        <div className="sn-faq">
          {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div>
        <p className="sn-body sn-mt">Security questions have <Link className="sn-link" href={ROUTES.security}>their own page</Link>. Developers: the <Link className="sn-link" href={ROUTES.mcp}>MCP server</Link> is on every plan.</p>
      </Section>
    </AgentSitePage>
  );
}
