import Link from "next/link";
import Image from "next/image";
import { Mark } from "@/components/app/icons";
import { CTA, ROUTES } from "@/lib/marketing/site";
import { ProductFrame, Screen } from "../site";
import { OpenRangeNavAccount } from "../site/Visitor";

export function OpenRangeNav() {
  return (
    <nav className="or-nav or-wrap" aria-label="Main">
      <Link className="or-logo" href={ROUTES.home}><Mark size={22} /><span>Corral</span></Link>
      <div className="or-nav__links"><a href="#product">Product</a><a href="#unibox">Unibox</a><Link href={ROUTES.pricing}>Pricing</Link><Link href={ROUTES.mcp}>MCP</Link><Link href={ROUTES.security}>Security</Link></div>
      <OpenRangeNavAccount />
    </nav>
  );
}

export function OpenRangeHero() {
  return (
    <header className="or-hero">
      <Image className="or-bg" src="/corral/or/range-wide.jpg" alt="" fill priority sizes="100vw" />
      <OpenRangeNav />
      <div className="or-wrap or-hero__grid">
        <div className="or-hero__copy">
          <h1>The right fifty,<br />already read.</h1>
          <p>Corral reads every company’s website against what you actually sell, scores the fit, and puts a real person at the end of every row.</p>
          <div className="or-hero__ctas"><Link className="c-btn c-btn--primary c-btn--lg" href={CTA.start}>Add your first product</Link><a className="c-btn c-btn--lg or-glass" href="#product">See a scored segment</a></div>
        </div>
      </div>
      <div className="or-hero__plate">
        <ProductFrame eager tone="photo" height={660} phone={600} label="Companies for ColdTrace Sensors, Kilima Dairies open on why it scored 94"
          caption="The app, not a picture of it: Companies, with Kilima Dairies open on why it scored 94.">
          <Screen view="companies" leads="fit" />
        </ProductFrame>
      </div>
    </header>
  );
}
