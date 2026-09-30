import Link from "next/link";
import Image from "next/image";
import { FitBar } from "@/components/app/primitives";
import { Mark } from "@/components/app/icons";
import { CTA, ROUTES } from "@/lib/marketing/site";
import { ProductFrame, Screen } from "../site";
import { AuthLink, FencelineNavAccount } from "../site/Visitor";

const STACK = ["wanjiru", "kamau", "amara", "grace", "reza"];

export function FencelineHero() {
  return (
    <header className="fl-hero">
      <div className="fl-hero__left">
        <nav className="fl-nav" aria-label="Main">
          <Link className="fl-logo" href={ROUTES.fenceline}><Mark size={22} /><span>Corral</span></Link>
          <div className="fl-nav__links"><a href="#plates">Product</a><Link href={ROUTES.pricing}>Pricing</Link><Link href={ROUTES.mcp}>MCP</Link><Link href={ROUTES.security}>Security</Link><AuthLink hideSignedIn /></div>
          <FencelineNavAccount />
        </nav>
        <div className="fl-hero__copy">
          <div className="fl-folio"><b>Corral</b><span>Outbound for teams who sell one thing well</span></div>
          <h1>Gather the few<br />who <em>fit</em>.</h1>
          <p>Corral reads every company’s website against what you sell, finds the person who decides, and writes to them the way you would.</p>
          <div className="fl-hero__ctas"><Link className="fl-btn" href={CTA.start}>Start with one product</Link><a className="fl-link" href="#plates">Read a sample segment →</a></div>
        </div>
        <div className="fl-faces">
          <div className="fl-faces__stack">{STACK.map((a) => <span key={a}><Image className="fl-bg" src={`/corral/en/av-${a}.jpg`} alt="" fill sizes="34px" /></span>)}</div>
          <p>People who replied to Corral users this week, shown with their permission. <span className="fl-note-inline">(Sample people.)</span></p>
        </div>
      </div>
      <div className="fl-hero__plate">
        <Image className="fl-bg" src="/corral/en/land-plate.jpg" alt="Engraving of open farmland near Kiambu, Kenya" fill priority sizes="(max-width: 1080px) 100vw, 50vw" />
        <span className="fl-cap"><b>Pl. I</b>Open land near Kiambu, at first light.</span>
      </div>
      <div className="fl-hero__app"><ProductFrame eager height={500} phone={440} label="Companies for ColdTrace Sensors, sorted by fit"><Screen view="companies" /></ProductFrame></div>
    </header>
  );
}

export function Lede() {
  return (
    <section className="fl-lede-sec fl-wrap" aria-label="What Corral does">
      <div className="fl-folio"><b>§ 1</b><span>In one sentence</span></div>
      <p className="fl-lede-sec__big">Corral read 212 companies for ColdTrace Sensors on Tuesday, kept the 48 that fit <span className="c-app"><FitBar value={94} /></span> and found the one person in each who decides. <span className="dim">Twelve wrote back. Three are on the calendar.</span></p>
    </section>
  );
}
