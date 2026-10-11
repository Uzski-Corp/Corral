import Link from "next/link";
import Image from "next/image";
import { Mark } from "@/components/app/icons";
import { CTA, CTA_SIGNED_IN, ROUTES } from "@/lib/marketing/site";
import { VisitorLink } from "@/components/marketing/site/VisitorLink";
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
          <span className="or-kicker">Agentic lead generation</span>
          <h1>Let our agent find<br />you tailored leads.</h1>
          <p>You tell Corral what you sell. It reads each company’s site, scores the fit, and drafts the email to the person who decides.</p>
          <div className="or-hero__ctas"><VisitorLink className="c-btn c-btn--primary c-btn--lg" href={CTA.start} signedInHref={CTA_SIGNED_IN.start}>Add your first product</VisitorLink><a className="c-btn c-btn--lg or-glass" href="#product">See a company it scored</a></div>
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
