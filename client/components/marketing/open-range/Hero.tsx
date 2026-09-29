import Link from "next/link";
import Image from "next/image";
import { Button, Mark, PersonCard, SegmentWindow } from "@/components/app";

export function OpenRangeNav() {
  return (
    <nav className="or-nav or-wrap" aria-label="Main">
      <Link className="or-logo" href="/open-range"><Mark size={22} /><span>Corral</span></Link>
      <div className="or-nav__links"><a href="#product">Product</a><a href="#how">How it works</a><a href="#people">Customers</a><a href="#pricing">Pricing</a></div>
      <div className="or-nav__cta"><a href="#" className="or-nav__signin">Sign in</a><Button variant="ink" size="lg">Book a walkthrough</Button></div>
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
          <div className="or-hero__ctas"><Button variant="primary" size="lg">Add your first product</Button><Button size="lg" className="or-glass">See a scored segment</Button></div>
        </div>
        <div className="or-hero__card"><PersonCard /></div>
      </div>
      <div className="or-hero__plate"><SegmentWindow limit={9} /></div>
    </header>
  );
}
