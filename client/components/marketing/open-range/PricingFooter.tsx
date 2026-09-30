import Link from "next/link";
import Image from "next/image";
import { Mark } from "@/components/app/icons";
import { PLANS, priceWords } from "@/lib/marketing/plans";
import { CTA, FOOTER, ROUTES, SAMPLE_NOTE, claim } from "@/lib/marketing/site";
import { ToConfirm } from "../site";

export { SAMPLE_NOTE };

export function PricingFooter() {
  const prices = claim("prices")!;
  return (
    <section id="pricing" className="or-dusk">
      <Image className="or-bg" src="/corral/or/dusk.jpg" alt="" fill sizes="100vw" />
      <div className="or-dusk__shade" />
      <div className="or-wrap or-pricing">
        <div className="or-pricing__head">
          <div><span className="or-kicker">Pricing</span><h2 className="or-h2">Priced by how much of the field you read.</h2></div>
          <p className="or-lede">Every plan includes the Unibox copilot, Cal.com booking, receipts on every score and the MCP server. Pay monthly, cancel whenever.</p>
        </div>
        <div className="or-plans c-app">
          {PLANS.map((p) => (
            <div key={p.id} className={`or-plan${p.primary ? " is-primary" : ""}`}>
              <div className="or-plan__head"><h3>{p.name}</h3><p>{p.line}</p></div>
              <div className="or-plan__price"><span className="or-plan__n">{priceWords(p)}</span>{p.price !== null && <span>a month</span>}</div>
              <div className="or-plan__meter" style={{ ["--m" as string]: p.meter }}><i /></div>
              <p className="or-plan__reads">{p.reads ? `${p.reads.toLocaleString("en")} companies read a month` : "25,000 and up"}</p>
              <Link className={`c-btn c-btn--lg${p.primary ? " c-btn--primary" : ""}`} href={p.price === null ? CTA.walkthrough : CTA.start}>{p.cta}</Link>
            </div>
          ))}
        </div>
        <p className="or-note or-pricing__more"><Link href={ROUTES.pricing}>Compare the plans line by line →</Link>{!prices.confirmed && <ToConfirm who={prices.owner} />}</p>
      </div>
      <footer className="or-foot or-wrap">
        <div className="or-foot__top">
          <Link className="or-logo" href={ROUTES.openRange}><Mark size={34} /><span>Corral</span></Link>
          <div className="or-foot__cols">
            {FOOTER.map((c) => <div key={c.title}><h4>{c.title}</h4>{c.links.map((l) => <Link key={l.label} href={l.href}>{l.label}</Link>)}</div>)}
          </div>
        </div>
        <div className="or-foot__bot"><span>© 2026 Corral. Made in Nairobi.</span><span className="or-foot__note">{SAMPLE_NOTE}</span></div>
      </footer>
    </section>
  );
}
