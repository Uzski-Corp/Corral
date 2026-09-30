/* /pricing (M10). Three plans as columns of a ledger, not cards; the comparison grouped the way the product is. */
import Link from "next/link";
import { Receipt, Receipts } from "@/components/app/primitives";
import { COMPARE, FAQ, PLANS, priceWords, type Cell } from "@/lib/marketing/plans";
import { CTA, ROUTES, claim } from "@/lib/marketing/site";
import { Section, SitePage, ToConfirm } from "./Chrome";

const cell = (c: Cell) => (c === true ? <span className="sn-yes">Included</span> : c === false ? <span className="sn-no" aria-label="Not included">—</span> : c);

export function PricingPage() {
  const prices = claim("prices")!;
  return (
    <SitePage current={ROUTES.pricing} kicker="Pricing" title={<>Pay for the ground<br />you cover.</>}
      lede="Every plan reads, scores, writes and sorts. The difference is how many products and how much of the market. Monthly, and you can leave whenever."
      aside={<p className="sn-note">Prices in US dollars, billed monthly. Scoring over MCP costs one credit, the same as in the app.{!prices.confirmed && <> <ToConfirm who={prices.owner} /></>}</p>}>
      <div className="sn-wrap">
        <ol className="sn-plans" aria-label="Plans">
          {PLANS.map((p) => (
            <li key={p.id} className={`sn-plan${p.primary ? " is-primary" : ""}`}>
              <div className="sn-plan__name"><h2>{p.name}</h2><em>{p.tag}</em>{p.primary && <span className="sn-plan__pick">Most teams</span>}</div>
              <p className="sn-plan__line">{p.line}</p>
              <p className="sn-plan__price"><span className="sn-num">{priceWords(p)}</span>{p.price !== null && <span>a month</span>}</p>
              <div className="sn-plan__meter" aria-hidden="true" style={{ ["--m" as string]: p.meter }}><i /></div>
              <p className="sn-plan__reads">{p.reads ? `${p.reads.toLocaleString("en")} companies read a month` : "25,000 and up, priced with you"}</p>
              <Link className={`c-btn c-btn--lg ${p.primary ? "c-btn--primary" : "sn-btn-line"}`} href={p.price === null ? CTA.walkthrough : CTA.start}>{p.cta}</Link>
            </li>
          ))}
        </ol>
        <p className="sn-small">Prices in US dollars, billed monthly. Every plan includes the Unibox copilot, Cal.com booking, receipts on every score and the MCP server.</p>
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
    </SitePage>
  );
}
