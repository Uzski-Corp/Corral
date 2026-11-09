/* Recommended Corral editorial. Desktop 1440 and mobile 390 share this markup; editorial.css switches at 1080 and 720. */
import Link from "next/link";
import { Check, Plus } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/app/icons";
import { ROUTES } from "@/lib/marketing/site";
import { AGENT_LOGOS, TOOL_LOGOS, type Logo } from "./copy";
import { ClientList, LogoItem, Nav } from "./Sections";
import { ScoreIllustration } from "./Illustrations";
import { HeroAgent } from "./Visuals";
import "@/components/marketing/site/styles";
import "./landing-v.css";
import "./editorial.css";
import { editorialFont } from "./editorial-font";
import { EditorialMotion } from "./EditorialMotion";

export const EDITORIAL_TITLE = "Corral · Keep sales conversations with your product and companies";
export const EDITORIAL_DESCRIPTION = "Corral is a workspace for product knowledge, companies, contacts and the conversations around them.";

const SIGN_IN = ROUTES.signIn;

const PHOTOS: { src: string; alt: string }[] = [
  { src: "/corral/editorial/step-01.webp", alt: "Woman reviewing information on a tablet" },
  { src: "/corral/editorial/step-02.webp", alt: "Woman researching at a laptop" },
  { src: "/corral/editorial/step-03.webp", alt: "Woman working at her laptop with headphones" },
  { src: "/corral/editorial/step-04.webp", alt: "Man reviewing a document at a desk" },
];

const DEMO_URL = "https://media.uzskicorp.agency/corral/corral-demo.mp4";
const VISUAL_STEPS = [
  { n: "01", title: "Teach it your product", body: "Add your site, deck or files. Corral stores them as searchable product knowledge." },
  { n: "02", title: "Organise companies and contacts", body: "Import or add companies and people. Discovery is an early preview while completion work continues." },
  { n: "03", title: "Prepare outreach with a reason", body: "Draft messages that reference something real about the company. You review before anything leaves." },
  { n: "04", title: "Review replies in Unibox", body: "Conversations, drafts and triage live in one place. Demo sending uses an allowlisted mailbox only." },
];
const FAQ = [
  { q: "What does Corral actually do?", a: "Corral is a workspace for product knowledge, companies, contacts and sales conversations. You add what you sell, keep company and contact records, and review drafts and replies in Unibox." },
  { q: "Where do companies and contacts come from?", a: "You import or add companies and contacts. Discovery is an early preview; automatic completion, crawling and enrichment are not finished yet." },
  { q: "Does it send emails without me?", a: "No. Drafts wait for you. Demo sending uses an allowlisted AutoSend path only. Customer mailbox sending is not implemented. API keys can draft; they cannot send." },
  { q: "Can I use it from Claude, ChatGPT or Cursor?", a: "An MCP server is planned so those clients can call Corral tools. It is not live yet. Details are on the MCP page." },
  { q: "When can I start?", a: "Sign in to create a workspace. You get a 7-day trial with no card. Paid plans bill monthly through Paddle. Plan names only for now; prices are not listed here." },
];
const PLANS = [
  { name: "Field", body: "Research and drafting for a focused team. 7-day trial. No card required." },
  { name: "Range", body: "Higher research and draft limits for growing teams." },
  { name: "Territory", body: "Custom limits. Talk with us at hello@uzskicorp.agency." },
];

const STRIP: Logo[] = [...AGENT_LOGOS.slice(0, 4), ...TOOL_LOGOS.slice(0, 4)];

function StartActions({ className }: { className: string }) {
  return (
    <div className={className}>
      <Link className="c-btn c-btn--primary c-btn--lg" href={SIGN_IN}>Get started ↗</Link>
      <a className="c-btn c-btn--secondary c-btn--lg" href={DEMO_URL}>Watch a demo</a>
    </div>
  );
}

export function EditorialLanding() {
  return (
    <main className={`theme-open-range lv editorial hero-options ${editorialFont.variable}`} data-variant="4" id="editorial-landing">
      <EditorialMotion />
      <Nav cta="Get started" ctaHref={SIGN_IN} />
      <section className="h-shell">
        <section className="h-b">
          <h1 className="h-title">Keep sales conversations with your product and companies.</h1>
          <p className="h-support">{EDITORIAL_DESCRIPTION}</p>
          <StartActions className="h-actions" />
          <div className="h-b-media">
            <div className="h-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/corral/editorial/hero.webp" alt="Colleagues discussing work around a table" />
            </div>
            <div className="h-product">
              <HeroAgent scenario="logistics" />
            </div>
          </div>
        </section>
        <div className="ed-logo-strip">
          <p>Tools you already use</p>
          <ul className="lv-logos">{STRIP.map((l) => <LogoItem key={l.name} l={l} />)}</ul>
        </div>
      </section>

      <section id="how" className="ed-section ed-wrap" data-editorial-reveal>
        <div className="ed-section-head">
          <div>
            <h2 className="ed-h2">From your product to a clear next conversation.</h2>
          </div>
        </div>
        <div className="ed-workflow">
          {VISUAL_STEPS.map((step, i) => (
            <article className="ed-step" key={step.n}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ed-photo" src={PHOTOS[i].src} alt={PHOTOS[i].alt} />
              <div className="ed-step-copy">
                <span className="ed-no">{step.n}</span>
                <h3>{step.title}{i === 1 && <small className="ed-preview"> · Early preview</small>}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ed-section ed-wrap" data-editorial-reveal>
        <div className="ed-proof">
          <div className="ed-proof-art" id="company-fit"><ScoreIllustration scenario="logistics" /></div>
          <div className="ed-proof-copy">
            <h2 className="ed-h2">See why a company looks like a fit.</h2>
            <p className="ed-desc">Each score shows its checks and sources. Scores help you decide; they are not a guarantee.</p>
            <div className="ed-proof-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ed-photo" src="/corral/editorial/proof.webp" alt="Person researching with a laptop in a bright workspace" />
            </div>
          </div>
        </div>
      </section>

      <section className="ed-section ed-wrap" data-editorial-reveal>
        <div className="ed-reply">
          <div className="ed-reply-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ed-photo" src="/corral/editorial/reply.webp" alt="Two colleagues looking at a tablet together" />
          </div>
          <div>
            <h2 className="ed-h2">Keep control of your outreach.</h2>
            <p className="ed-desc">You approve before anything is sent. Drafts wait in Unibox. API keys can draft; they cannot send.</p>
            <div className="mail-ui" aria-label="Illustrative email thread between ClearBay Fulfilment and Imani Wekesa at Meridian Home Co.">
              <div className="mail-bar"><span className="mail-bar-ic">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/corral/editorial/gmail-svgl.svg" alt="Gmail" width={18} height={14} /></span><div><b>Inbox</b><small>Meridian Home Co. · Imani Wekesa</small></div></div>
              <div className="mail-meta"><span>Subject</span><strong>Local fulfilment for your Kenya market entry</strong></div>
              <article className="mail-msg">
                <div className="mail-head">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="mail-av" src="/corral/editorial/clearbay-avatar.webp" alt="" width={32} height={32} />
                  <div><b>ClearBay Fulfilment</b><em>you@clearbay.example</em></div><span>Tue 09:14</span>
                </div>
                <p>Hi Imani, I saw Meridian Home Co.’s Kenya market entry note. ClearBay Fulfilment offers local fulfilment in East Africa. Could we talk about your launch?</p>
              </article>
              <article className="mail-msg is-reply">
                <div className="mail-head">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="mail-av" src="/corral/app/av-wanjiru.jpg" alt="" width={32} height={32} />
                  <div><b>Imani Wekesa</b><em>Head of Expansion · Meridian Home Co.</em></div><span>Tue 11:02</span>
                </div>
                <p>Can you share your fulfilment coverage in Kenya?</p>
              </article>
              <div className="mail-status"><span className="mail-pill"><Check size={14} />Interested</span><b>Draft ready for review</b></div>
            </div>
          </div>
        </div>
      </section>

      <section id="agents" className="ed-section ed-wrap" data-editorial-reveal>
        <div className="ed-section-head ed-agent-heading">
          <div>
            <h2 className="ed-h2">MCP access is coming.</h2>
          </div>
          <div>
            <p className="ed-desc">Corral will expose workspace tools to clients such as Cursor, Claude and VS Code. The server is not live yet.</p>
            <Link className="ed-link" href={ROUTES.mcp}>Read the MCP page <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="ed-agents">
          <div className="ed-client-panel"><ClientList comingSoon /></div>
          <div className="ed-agent-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ed-photo" src="/corral/editorial/agents.webp" alt="Person working on a laptop in a quiet living room" />
          </div>
        </div>
        <div className="ed-int">
          <p className="ed-int-title">Tools you already use.</p>
          <ul className="lv-int__grid">{[...TOOL_LOGOS, ...AGENT_LOGOS].map((l) => <LogoItem key={l.name} l={l} />)}</ul>
        </div>
      </section>

      <section id="plans" className="ed-section ed-wrap" data-editorial-reveal>
        <div className="ed-section-head"><h2 className="ed-h2">Plans</h2></div>
        <div className="ed-plans">{PLANS.map((plan) => <article key={plan.name}><h3>{plan.name}</h3><p>{plan.body}</p></article>)}</div>
      </section>

      <section id="faq" className="ed-section ed-wrap" data-editorial-reveal>
        <div className="ed-faq">
          <div>
            <h2 className="ed-h2">Good questions.</h2>
          </div>
          <div className="lv-faq__list">
            {FAQ.map((item, i) => (
              <details key={item.q} className="lv-faq__item" open={i === 0}>
                <summary><span>{item.q}</span><Plus size={16} weight="bold" aria-hidden="true" /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ed-reef-close" id="join-bottom">
        <div className="ed-reef-close__stage">
          <div className="ed-reef-close__veil" aria-hidden="true" />
          <div className="ed-reef-close__cta" data-editorial-reveal>
            <h2 className="ed-h2 ed-reef-close__title">Start your 7-day trial.</h2>
            <p className="ed-reef-close__support">No card required.</p>
            <Link className="c-btn c-btn--primary c-btn--lg ed-kumo-cta" href={SIGN_IN}>Get selling</Link>
          </div>
          <footer className="ed-reef-foot" data-editorial-reveal>
            <div className="ed-reef-foot__top">
              <Link className="lv-logo ed-reef-foot__brand" href={ROUTES.home}><Mark size={22} /><span>Corral</span></Link>
              <nav className="ed-footlinks" aria-label="Footer">
                <Link href={ROUTES.mcp}>MCP</Link>
                <Link href={ROUTES.security}>Security</Link>
                <Link href={ROUTES.changelog}>Changelog</Link>
                <Link href={ROUTES.terms}>Terms</Link>
                <Link href={ROUTES.privacy}>Privacy</Link>
              </nav>
            </div>
            <p className="ed-reef-foot__copy">© 2026 Corral. Made in Nairobi.</p>
          </footer>
        </div>
      </section>
    </main>
  );
}
