import Link from "next/link";
import Image from "next/image";
import { Mark } from "@/components/app/icons";
import { COMPARE, PLANS, priceWords, type PlanId } from "@/lib/marketing/plans";
import { CTA, FOOTER, ROUTES, SAMPLE_NOTE, claim } from "@/lib/marketing/site";
import { ToConfirm } from "../site";

export { SAMPLE_NOTE };

/** Four rows per plan, read from the same COMPARE table as /pricing so the two can't drift. */
const ROWS = ["Products", "Companies read a month", "Mailboxes in the pool", "AutoSend nurture"];
const cell = (label: string, id: PlanId) => {
  const v = COMPARE.flatMap((g) => g.rows).find((r) => r.label === label)!.cells[id];
  return v === true ? "Included" : v === false ? "—" : v;
};

export function Pricing() {
  const prices = claim("prices")!;
  return (
    <section id="pricing" className="fl-pricing fl-wrap">
      <div className="fl-pricing__head">
        <div><div className="fl-folio"><b>§ 6</b><span>Terms</span></div><h2 className="fl-h2">Pay for the ground you cover.</h2></div>
        <p className="fl-lede">Every plan reads, scores, writes and sorts. The difference is how many products and how much of the market. Monthly, and you can leave whenever.</p>
      </div>
      <div className="fl-plans">
        {PLANS.map((p) => (
          <div key={p.id} className={`fl-plan${p.primary ? " is-primary" : ""}`}>
            <h3>{p.name}<em>{p.tag}</em></h3><p>{p.line}</p>
            <div className="fl-plan__price"><span>{priceWords(p)}</span>{p.price !== null && <span>a month</span>}</div>
            <dl>{ROWS.map((a) => <div key={a}><dt>{a}</dt><dd>{cell(a, p.id)}</dd></div>)}</dl>
            <Link className={`fl-btn${p.primary ? "" : " fl-btn--line"}`} href={p.price === null ? CTA.walkthrough : CTA.start}>{p.cta}</Link>
          </div>
        ))}
      </div>
      <p className="fl-cap fl-pricing__more"><Link href={ROUTES.pricing}>Compare the plans line by line →</Link>{!prices.confirmed && <ToConfirm who={prices.owner} />}</p>
    </section>
  );
}

export function Closing() {
  return (
    <>
      <section className="fl-close" aria-label="Get started">
        <Image className="fl-bg" src="/corral/en/acacia-plate.jpg" alt="" fill sizes="100vw" />
        <div className="fl-close__inner"><Mark size={30} /><h2>Fewer, better, answered.</h2><Link className="fl-btn" href={CTA.start}>Start with one product</Link></div>
        <span className="fl-cap"><b>Pl. VI</b>The same acacia, evening.</span>
      </section>
      <footer className="fl-foot">
        <div className="fl-wrap fl-foot__in">
          <div className="fl-foot__top">
            <Link className="fl-logo" href={ROUTES.fenceline}><Mark size={30} /><span>Corral</span></Link>
            <div className="fl-foot__cols">
              {FOOTER.map((c) => <div key={c.title}><h4>{c.title}</h4>{c.links.map((l) => <Link key={l.label} href={l.href}>{l.label}</Link>)}</div>)}
            </div>
          </div>
          <div className="fl-foot__bot"><span>© 2026 Corral. Made in Nairobi.</span><span>{SAMPLE_NOTE}</span></div>
        </div>
      </footer>
    </>
  );
}
