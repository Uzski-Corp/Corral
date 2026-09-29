import Link from "next/link";
import Image from "next/image";
import { Button, Mark } from "@/components/app";

export const SAMPLE_NOTE = "Sample content. People, companies, quotes, numbers and prices are illustrative. Photography from Unsplash and Pexels, used as reference only (not model-released).";

type Plan = { name: string; price: string; per?: string; line: string; rows: [string, string][]; cta: string; primary?: boolean; meter: number };
const PLANS: Plan[] = [
  { name: "Field", price: "$49", per: "a month", line: "One product, one founder doing their own outbound.", rows: [["Products", "1"], ["Companies read", "1,000 / mo"], ["Mailboxes in pool", "2"], ["Unibox copilot", "Included"]], cta: "Start with one product", meter: 0.12 },
  { name: "Range", price: "$149", per: "a month", line: "A small team working a real territory.", rows: [["Products", "3"], ["Companies read", "5,000 / mo"], ["Mailboxes in pool", "10"], ["AutoSend nurture", "Included"]], cta: "Start a 14-day trial", primary: true, meter: 0.5 },
  { name: "Territory", price: "Let’s talk", line: "Several products, several markets, one Unibox.", rows: [["Products", "Unlimited"], ["Companies read", "25,000+ / mo"], ["Mailboxes in pool", "Bring your own"], ["Phoenix ERP, SSO", "Included"]], cta: "Book a walkthrough", meter: 0.95 },
];

export function PricingFooter() {
  return (
    <section id="pricing" className="or-dusk">
      <Image className="or-bg" src="/corral/or/dusk.jpg" alt="" fill sizes="100vw" />
      <div className="or-dusk__shade" />
      <div className="or-wrap or-pricing">
        <div className="or-pricing__head">
          <div><span className="or-kicker">Pricing</span><h2 className="or-h2">Priced by how much of the field you read.</h2></div>
          <p className="or-lede">Every plan includes the Unibox copilot, Cal.com booking and receipts on every score. Pay monthly, cancel whenever.</p>
        </div>
        <div className="or-plans c-app">
          {PLANS.map((p) => (
            <div key={p.name} className={`or-plan${p.primary ? " is-primary" : ""}`}>
              <div className="or-plan__head"><h3>{p.name}</h3><p>{p.line}</p></div>
              <div className="or-plan__price"><span className="or-plan__n">{p.price}</span>{p.per && <span>{p.per}</span>}</div>
              <div className="or-plan__meter" style={{ ["--m" as string]: p.meter }}><i /></div>
              <ul>{p.rows.map(([a, b]) => <li key={a}><span>{a}</span><b>{b}</b></li>)}</ul>
              <Button size="lg" variant={p.primary ? "primary" : "default"}>{p.cta}</Button>
            </div>
          ))}
        </div>
        <p className="or-note">Sample pricing for this design study.</p>
      </div>
      <footer className="or-foot or-wrap">
        <div className="or-foot__top">
          <Link className="or-logo" href="/open-range"><Mark size={34} /><span>Corral</span></Link>
          <div className="or-foot__cols">
            <div><h4>Product</h4><a href="#">Segments</a><a href="#">Unibox</a><a href="#">Mailbox pools</a><a href="#">Changelog</a></div>
            <div><h4>Company</h4><a href="#">Customers</a><a href="#">Pricing</a><a href="#">Careers</a><a href="#">Contact</a></div>
            <div><h4>Resources</h4><a href="#">Docs</a><a href="#">Deliverability guide</a><a href="#">Status</a><a href="#">Privacy</a></div>
          </div>
        </div>
        <div className="or-foot__bot"><span>© 2026 Corral. Made in Nairobi.</span><span className="or-foot__note">{SAMPLE_NOTE}</span></div>
      </footer>
    </section>
  );
}
