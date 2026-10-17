/* The inner marketing pages (/pricing, /security, /mcp, /changelog) in the home page's language: the landing's nav,
   the editorial head and numbered sections from site/Chrome, and the landing's waitlist close and footer.
   Guide: client/docs/design/SITE-GUIDE.md. */
import type { ReactNode } from "react";
import "@/components/marketing/site/styles";
import "./landing-v.css";
import "./site-v.css";
import { NAV } from "@/lib/marketing/site";
import { FinalAndFooter, Nav } from "./Sections";

export function AgentSitePage({ current, kicker, title, lede, aside, center, children, closing, navCtaHref, action, headClass, section }: {
  current: string; kicker: string; title: ReactNode; lede?: ReactNode; aside?: ReactNode; center?: boolean; children: ReactNode;
  /** replaces the waitlist close + footer (the gated pricing page has exactly one call to action) */ closing?: ReactNode;
  /** where the nav's waitlist button points when the page has no #join form */ navCtaHref?: string;
  /** a call to action under the lede, inside the head */ action?: ReactNode; headClass?: string; /** data-ab-section of the head */ section?: string;
}) {
  return (
    <div className="theme-open-range lv sn sn--agent" data-variant="4">
      <Nav links={NAV} current={current} ctaHref={navCtaHref} />
      <main id="main">
        <div className={`sn-wrap sn-head${center ? " sn-head--center" : ""}${headClass ? ` ${headClass}` : ""}`} data-ab-section={section}>
          <div className="sn-head__main"><p className="sn-kicker">{kicker}</p><h1 className="sn-h1">{title}</h1>{lede && <p className="sn-lede">{lede}</p>}{action}</div>
          {aside && <div className="sn-head__aside">{aside}</div>}
        </div>
        {children}
      </main>
      {closing ?? <FinalAndFooter source="site" formId="join" />}
    </div>
  );
}
