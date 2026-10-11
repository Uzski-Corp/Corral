/* The inner marketing pages (/pricing, /security, /mcp, /changelog) in the home page's language: the landing's nav,
   the editorial head and numbered sections from site/Chrome, and the landing's waitlist close and footer.
   Guide: client/docs/design/SITE-GUIDE.md. */
import type { ReactNode } from "react";
import "@/components/marketing/site/styles";
import "./landing-v.css";
import "./site-v.css";
import { NAV } from "@/lib/marketing/site";
import { FinalAndFooter, Nav } from "./Sections";

export function AgentSitePage({ current, kicker, title, lede, aside, center, children }: {
  current: string; kicker: string; title: ReactNode; lede?: ReactNode; aside?: ReactNode; center?: boolean; children: ReactNode;
}) {
  return (
    <div className="theme-open-range lv sn sn--agent" data-variant="4">
      <Nav links={NAV} current={current} />
      <main id="main">
        <div className={`sn-wrap sn-head${center ? " sn-head--center" : ""}`}>
          <div className="sn-head__main"><p className="sn-kicker">{kicker}</p><h1 className="sn-h1">{title}</h1>{lede && <p className="sn-lede">{lede}</p>}</div>
          {aside && <div className="sn-head__aside">{aside}</div>}
        </div>
        {children}
      </main>
      <FinalAndFooter source="site" formId="join" />
    </div>
  );
}
