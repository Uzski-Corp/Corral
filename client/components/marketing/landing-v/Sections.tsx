/* The section stack every variant shares (Bau, Oct 7). Only the hero differs between /v/1–/v/4. */
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/app/icons";
import { FitPiece } from "@/components/marketing/site/Pieces";
import { ROUTES } from "@/lib/marketing/site";
import { CLIENTS } from "@/lib/mcp/tools";
import type { WaitlistSource } from "@/lib/marketing/waitlist";
import { AGENT_LOGOS, FAQ, NAV_LINKS, SECTIONS, STEPS, VISUAL_STEPS, TOOL_LOGOS, WAITLIST, type Logo } from "./copy";
import { AgentChat, BlueGround, Horizon } from "./Visuals";
import { ScoreIllustration, WorkflowIllustration } from "./Illustrations";
import { WaitlistForm } from "./WaitlistForm";

/** `links` defaults to the landing's in-page anchors; the inner pages pass the site routes and their own `current`. */
export function Nav({ tone = "light", links = NAV_LINKS, current, cta = WAITLIST.cta, ctaHref = "#join" }: { tone?: "light" | "blue"; links?: { label: string; href: string }[]; current?: string; cta?: string; ctaHref?: string }) {
  return (
    <nav className={`lv-nav lv-wrap lv-nav--${tone}`} aria-label="Main">
      <Link className="lv-logo" href={ROUTES.home}><Mark size={22} /><span>Corral</span></Link>
      <div className="lv-nav__links">{links.map((l) => <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>{l.label}</Link>)}</div>
      <div className="lv-nav__end">
        <a className="lv-nav__cta" href={ctaHref}>{cta}</a>
      </div>
    </nav>
  );
}

export function LogoItem({ l }: { l: Logo }) {
  // Plain <img>: the SVGs ship as they are, and the static build has no image optimiser.
  // eslint-disable-next-line @next/next/no-img-element
  if (l.wordmark) return <li className="lv-logos__i is-word"><img src={l.src} alt={l.name} height={16} /></li>;
  // eslint-disable-next-line @next/next/no-img-element
  return <li className="lv-logos__i"><img src={l.src} alt="" width={20} height={20} /><span>{l.name}</span></li>;
}

/** The thin strip under the hero: what it plugs into. Integration and client logos only, never customers. */
export function WorksWith() {
  return (
    <section className="lv-works lv-wrap" aria-label="Works with">
      <p className="lv-works__k">Works with your agents and the tools you use</p>
      <ul className="lv-logos">{[...AGENT_LOGOS.slice(0, 4), ...TOOL_LOGOS.slice(0, 4)].map((l) => <LogoItem key={l.name} l={l} />)}</ul>
    </section>
  );
}

export function How({ illustrated = false }: { illustrated?: boolean }) {
  return (
    <section id="how" className="lv-how lv-wrap" aria-labelledby="lv-how-h">
      <span className="lv-kicker">{SECTIONS.how.kicker}</span>
      <h2 id="lv-how-h" className="lv-h2">{SECTIONS.how.title}</h2>
      <ol className="lv-steps">
        {(illustrated ? VISUAL_STEPS : STEPS).map((s) => (
          <li key={s.n} className="lv-step">
            {illustrated && <WorkflowIllustration step={s.n} />}
            <span className="lv-step__n">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Proof({ illustrated = false }: { illustrated?: boolean }) {
  return (
    <section className="lv-proof lv-wrap" aria-labelledby="lv-proof-h">
      <div className="lv-proof__copy">
        <span className="lv-kicker">{SECTIONS.proof.kicker}</span>
        <h2 id="lv-proof-h" className="lv-h2">{SECTIONS.proof.title}</h2>
        <p className="lv-lede">{illustrated ? "A reason for every point. A source for every check. Only companies scoring 80 or above enter your outreach." : SECTIONS.proof.body}</p>
      </div>
      <BlueGround className="lv-proof__plate">
        {illustrated ? <ScoreIllustration /> : <div className="lv-proof__piece"><FitPiece /></div>}
      </BlueGround>
    </section>
  );
}

/** Where each client takes Corral, from Settings → MCP (lib/mcp/tools.ts). V4 shows this here, since its hero
    already shows the agent conversation. */
export function ClientList() {
  const logo: Record<string, string | undefined> = { cursor: "/corral/logos/cursor.svg", "claude-code": "/corral/logos/claude.svg", claude: "/corral/logos/claude.svg", vscode: "/corral/logos/vscode.svg" };
  return (
    <figure className="lv-clients c-app" aria-label="MCP clients and where Corral goes in each">
      <ul>
        {CLIENTS.map((c) => (
          <li key={c.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo[c.id] ? <img src={logo[c.id]} alt="" width={18} height={18} /> : <span className="lv-clients__any" aria-hidden="true">{"{}"}</span>}
            <b>{c.name}</b><code>{c.where}</code>
          </li>
        ))}
      </ul>
      <figcaption>Sign in as you. Keys for jobs that run alone can draft, and can’t send.</figcaption>
    </figure>
  );
}

export function Agents({ picture = "chat" }: { picture?: "chat" | "clients" }) {
  return (
    <section id="agents" className="lv-agents lv-wrap" aria-labelledby="lv-agents-h">
      <div className="lv-agents__copy">
        <span className="lv-kicker">{SECTIONS.agents.kicker}</span>
        <h2 id="lv-agents-h" className="lv-h2">{SECTIONS.agents.title}</h2>
        <p className="lv-lede">{SECTIONS.agents.body}</p>
        <p><Link className="lv-textlink" href={ROUTES.mcp}>How the MCP server works</Link></p>
      </div>
      {picture === "chat" ? <AgentChat className="lv-agents__chat" /> : <div className="lv-client-stage"><ClientList /></div>}
    </section>
  );
}

export function Integrations() {
  return (
    <section className="lv-int lv-wrap" aria-labelledby="lv-int-h">
      <span className="lv-kicker">{SECTIONS.integrations.kicker}</span>
      <h2 id="lv-int-h" className="lv-h3">{SECTIONS.integrations.title}</h2>
      <ul className="lv-int__grid">{[...TOOL_LOGOS, ...AGENT_LOGOS].map((l) => <LogoItem key={l.name} l={l} />)}</ul>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="lv-faq lv-wrap" aria-labelledby="lv-faq-h">
      <div><span className="lv-kicker">{SECTIONS.faq.kicker}</span><h2 id="lv-faq-h" className="lv-h2">{SECTIONS.faq.title}</h2></div>
      <div className="lv-faq__list">
        {FAQ.map((f, i) => (
          <details key={f.q} className="lv-faq__item" open={i === 0}>
            <summary><span>{f.q}</span><Plus size={16} weight="bold" aria-hidden="true" /></summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalAndFooter({ source, formId }: { source: WaitlistSource; formId?: string }) {
  return (
    <section className="lv-dusk" aria-labelledby="lv-final-h">
      <Horizon className="lv-dusk__art" />
      <div className="lv-final lv-wrap">
        <h2 id="lv-final-h">{SECTIONS.final.title}</h2>
        <p>{SECTIONS.final.body}</p>
        <WaitlistForm id={formId} fragments={Boolean(formId)} source={source} tone="dark" align="center" note={false} />
      </div>
      <Footer />
    </section>
  );
}

export function Footer() {
  return (
    <footer className="lv-foot lv-wrap">
      <Link className="lv-logo" href={ROUTES.home}><Mark size={20} /><span>Corral</span></Link>
      <div className="lv-foot__links">
        <Link href={ROUTES.mcp}>MCP</Link><Link href={ROUTES.security}>Security</Link><Link href={ROUTES.changelog}>Changelog</Link>
        <Link href={ROUTES.terms}>Terms</Link><Link href={ROUTES.privacy}>Privacy</Link>
      </div>
      <span className="lv-foot__c">© 2026 Corral. Made in Nairobi.</span>
    </footer>
  );
}
