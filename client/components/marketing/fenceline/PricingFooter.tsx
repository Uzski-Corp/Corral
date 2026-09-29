import Link from "next/link";
import Image from "next/image";
import { Mark } from "@/components/app";

export const SAMPLE_NOTE = "Sample content. People, companies, quotes, numbers and prices are illustrative. Engravings made from Unsplash and Pexels photographs, used as reference only (not model-released).";

type Plan = { name: string; tag: string; price: string; per?: string; line: string; rows: [string, string][]; cta: string; primary?: boolean };
const PLANS: Plan[] = [
  { name: "Field", tag: "for one", price: "$49", per: "a month", line: "One product, one founder doing their own outbound.", rows: [["Products", "1"], ["Companies read", "1,000 a month"], ["Mailboxes in pool", "2"], ["Unibox copilot", "Included"]], cta: "Start with one product" },
  { name: "Range", tag: "for a team", price: "$149", per: "a month", line: "A small team working a real territory.", rows: [["Products", "3"], ["Companies read", "5,000 a month"], ["Mailboxes in pool", "10"], ["AutoSend nurture", "Included"]], cta: "Start a 14-day trial", primary: true },
  { name: "Territory", tag: "for many", price: "Let’s talk", line: "Several products, several markets, one Unibox.", rows: [["Products", "Unlimited"], ["Companies read", "25,000+ a month"], ["Mailboxes in pool", "Bring your own"], ["Phoenix ERP, SSO", "Included"]], cta: "Write to us" },
];

export function Pricing() {
  return (
    <section id="pricing" className="fl-pricing fl-wrap">
      <div className="fl-pricing__head">
        <div><div className="fl-folio"><b>§ 6</b><span>Terms</span></div><h2 className="fl-h2">Pay for the ground you cover.</h2></div>
        <p className="fl-lede">Every plan reads, scores, writes and sorts. The difference is how many products and how much of the market. Monthly, and you can leave whenever.</p>
      </div>
      <div className="fl-plans">
        {PLANS.map((p) => (
          <div key={p.name} className={`fl-plan${p.primary ? " is-primary" : ""}`}>
            <h3>{p.name}<em>{p.tag}</em></h3><p>{p.line}</p>
            <div className="fl-plan__price"><span>{p.price}</span>{p.per && <span>{p.per}</span>}</div>
            <dl>{p.rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
            <a className={`fl-btn${p.primary ? "" : " fl-btn--line"}`} href="#">{p.cta}</a>
          </div>
        ))}
      </div>
      <p className="fl-cap">Sample pricing for this design study.</p>
    </section>
  );
}

export function Closing() {
  return (
    <>
      <section className="fl-close" aria-label="Get started">
        <Image className="fl-bg" src="/corral/en/acacia-plate.jpg" alt="" fill sizes="100vw" />
        <div className="fl-close__inner"><Mark size={30} /><h2>Fewer, better, answered.</h2><a className="fl-btn" href="#">Start with one product</a></div>
        <span className="fl-cap"><b>Pl. VI</b>The same acacia, evening.</span>
      </section>
      <footer className="fl-foot">
        <div className="fl-wrap fl-foot__in">
          <div className="fl-foot__top">
            <Link className="fl-logo" href="/fenceline"><Mark size={30} /><span>Corral</span></Link>
            <div className="fl-foot__cols">
              <div><h4>Product</h4><a href="#">Segments</a><a href="#">Unibox</a><a href="#">Mailbox pools</a><a href="#">Changelog</a></div>
              <div><h4>Company</h4><a href="#">People</a><a href="#">Pricing</a><a href="#">Careers</a><a href="#">Contact</a></div>
              <div><h4>Reading</h4><a href="#">Docs</a><a href="#">Deliverability guide</a><a href="#">Status</a><a href="#">Privacy</a></div>
            </div>
          </div>
          <div className="fl-foot__bot"><span>© 2026 Corral. Made in Nairobi.</span><span>{SAMPLE_NOTE}</span></div>
        </div>
      </footer>
    </>
  );
}
