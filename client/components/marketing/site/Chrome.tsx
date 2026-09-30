/* The marketing site's shared chrome (M10): the nav and footer on /pricing, /security, /mcp, /changelog, /legal
   and the 404. Written against the --mk-* contract both landings define, so it takes either theme. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/app/icons"; // deep import: the 404 and error pages load this on every route
import { CTA, FOOTER, HOME, NAV, ROUTES, SAMPLE_NOTE, homeOf, type Landing } from "@/lib/marketing/site";

export function SiteNav({ current, landing = HOME }: { current?: string; landing?: Landing }) {
  return (
    <header className="sn-nav">
      <div className="sn-wrap sn-nav__in">
        <Link className="sn-logo" href={homeOf(landing)}><Mark size={20} /><span>Corral</span></Link>
        <nav className="sn-nav__links" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>{n.label}</Link>)}
        </nav>
        <div className="sn-nav__cta">
          <Link className="sn-nav__signin" href={ROUTES.signIn}>Sign in</Link>
          <Link className="c-btn c-btn--primary c-btn--lg" href={CTA.start}>Start with one product</Link>
        </div>
        <details className="sn-menu">
          <summary>Menu</summary>
          <nav aria-label="Main, small screens"><ul>
            {NAV.map((n) => <li key={n.href}><Link href={n.href} aria-current={current === n.href ? "page" : undefined}>{n.label}</Link></li>)}
            <li><Link href={ROUTES.signIn}>Sign in</Link></li>
          </ul></nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ landing = HOME }: { landing?: Landing }) {
  return (
    <footer className="sn-foot">
      <div className="sn-wrap">
        <div className="sn-foot__top">
          <div className="sn-foot__brand">
            <Link className="sn-logo sn-logo--lg" href={homeOf(landing)}><Mark size={28} /><span>Corral</span></Link>
            <p>Outbound for teams who sell one thing well. Made in Nairobi.</p>
          </div>
          <div className="sn-foot__cols">
            {FOOTER.map((c) => (
              <div key={c.title}><h2>{c.title}</h2><ul>{c.links.map((l) => <li key={l.label}><Link href={l.href}>{l.label}</Link></li>)}</ul></div>
            ))}
          </div>
        </div>
        <div className="sn-foot__bot"><span>© 2026 Corral</span><span className="sn-foot__note">{SAMPLE_NOTE}</span></div>
      </div>
    </footer>
  );
}

/** A shared page: nav, an editorial head (kicker, headline, one lede), the body, the footer. */
export function SitePage({ current, kicker, title, lede, aside, children, landing = HOME, theme = "theme-open-range" }: {
  current?: string; kicker: string; title: ReactNode; lede?: ReactNode; aside?: ReactNode; children: ReactNode; landing?: Landing; theme?: string;
}) {
  return (
    <div className={`${theme} sn`}>
      <SiteNav current={current} landing={landing} />
      <main id="main">
        <div className="sn-wrap sn-head">
          <div className="sn-head__main"><p className="sn-kicker">{kicker}</p><h1 className="sn-h1">{title}</h1>{lede && <p className="sn-lede">{lede}</p>}</div>
          {aside && <div className="sn-head__aside">{aside}</div>}
        </div>
        {children}
      </main>
      <SiteFooter landing={landing} />
    </div>
  );
}

/** A numbered editorial section: the number and title in the margin, the content in the measure. */
export function Section({ n, id, title, children, wide }: { n: string; id?: string; title: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`sn-wrap sn-sec${wide ? " sn-sec--wide" : ""}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="sn-sec__margin"><span className="sn-sec__n">{n}</span><h2 id={id ? `${id}-h` : undefined} className="sn-h2">{title}</h2></div>
      <div className="sn-sec__body">{children}</div>
    </section>
  );
}

/** A claim that isn't confirmed yet shows it, on purpose (lib/marketing/site.ts CLAIMS). */
export const ToConfirm = ({ who }: { who: string }) => <span className="sn-confirm" title={`To confirm before launch: ${who}`}>To confirm · {who}</span>;
