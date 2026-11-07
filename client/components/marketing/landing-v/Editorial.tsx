/* Recommended Corral editorial. Desktop 1440 and mobile 390 share this markup; editorial.css switches at 1080 and 720. */
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/app/icons";
import { ROUTES } from "@/lib/marketing/site";
import { AGENT_LOGOS, FAQ, TOOL_LOGOS, VISUAL_STEPS, type Logo } from "./copy";
import { ClientList, LogoItem, Nav } from "./Sections";
import { ScoreIllustration } from "./Illustrations";
import { HeroAgent } from "./Visuals";
import "@/components/marketing/site/styles";
import "./landing-v.css";
import "./editorial.css";

export const EDITORIAL_TITLE = "Corral · Find companies that need what you sell";
export const EDITORIAL_DESCRIPTION = "Corral researches prospects, prepares outreach and helps you review replies.";

const SIGN_IN = ROUTES.signIn;

const PHOTOS: { src: string; alt: string }[] = [
  { src: "/corral/editorial/step-01.webp", alt: "Woman reviewing information on a tablet" },
  { src: "/corral/editorial/step-02.webp", alt: "Woman researching at a laptop" },
  { src: "/corral/editorial/step-03.webp", alt: "Woman working at her laptop with headphones" },
  { src: "/corral/editorial/step-04.webp", alt: "Man reviewing a document at a desk" },
];

const START_ANSWER = "You can get started now. Sign in to claim your free week of Corral.";

const STRIP: Logo[] = [...AGENT_LOGOS.slice(0, 4), ...TOOL_LOGOS.slice(0, 4)];

function StartActions({ className }: { className: string }) {
  return (
    <div className={className}>
      <Link className="h-primary" href={SIGN_IN}>Get started ↗</Link>
      <Link className="h-secondary" href={SIGN_IN}>Watch a demo</Link>
    </div>
  );
}

export function EditorialLanding() {
  return (
    <main className="theme-open-range lv editorial hero-options">
      <Nav cta="Get started" ctaHref={SIGN_IN} />
      <section className="h-shell">
        <section className="h-b">
          <span className="h-k">Agentic lead acquisition</span>
          <h1 className="h-title">Find companies that need what you sell.</h1>
          <p className="h-support">{EDITORIAL_DESCRIPTION}</p>
          <StartActions className="h-actions" />
          <p className="h-offer">Your first week is free.</p>
          <p className="h-gate">Both options open sign-in.</p>
          <div className="h-b-media">
            <div className="h-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/corral/editorial/hero.webp" alt="Colleagues discussing work around a table" />
            </div>
            <div className="h-product">
              <HeroAgent />
              <p className="h-meta">Sample workspace · ColdTrace Sensors</p>
            </div>
          </div>
        </section>
        <div className="h-reef" aria-hidden="true" />
        <div className="ed-logo-strip">
          <p>Works with your agents and the tools you use</p>
          <ul className="lv-logos">{STRIP.map((l) => <LogoItem key={l.name} l={l} />)}</ul>
        </div>
      </section>

      <section id="how" className="ed-section ed-wrap">
        <div className="ed-section-head">
          <div>
            <span className="ed-k">How it works</span>
            <h2 className="ed-h2">From what you sell to a booked meeting.</h2>
          </div>
          <p className="ed-desc">Start with your product. See why a company is a good fit, prepare your outreach and review the replies.</p>
        </div>
        <div className="ed-workflow">
          {VISUAL_STEPS.map((step, i) => (
            <article className="ed-step" key={step.n}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ed-photo" src={PHOTOS[i].src} alt={PHOTOS[i].alt} />
              <div className="ed-step-copy">
                <span className="ed-no">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ed-section ed-wrap">
        <div className="ed-proof">
          <div className="ed-proof-art"><ScoreIllustration /></div>
          <div className="ed-proof-copy">
            <span className="ed-k">Every score shows its work</span>
            <h2 className="ed-h2">You can see why each company made the list.</h2>
            <p className="ed-desc">A reason for every point. A source for every check. Only companies scoring 80 or above enter your outreach.</p>
            <div className="ed-proof-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ed-photo" src="/corral/editorial/proof.webp" alt="Person researching with a laptop in a bright workspace" />
            </div>
            <p className="ed-caption">Illustrative photography from Uzski Muses. Product examples use sample data.</p>
          </div>
        </div>
      </section>

      <section className="ed-section ed-wrap">
        <div className="ed-reply">
          <div className="ed-reply-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ed-photo" src="/corral/editorial/reply.webp" alt="Two colleagues looking at a tablet together" />
          </div>
          <div>
            <span className="ed-k">Review the replies</span>
            <h2 className="ed-h2">Keep control of your outreach.</h2>
            <p className="ed-desc">Launch email sequences from your mailbox. Review drafted responses when replies come in.</p>
            <div className="ed-sample">
              <div className="ed-sample-label">SAMPLE WORKSPACE · KILIMA DAIRIES</div>
              <p>“Could you pilot this across our three sites before the dry season?”</p>
              <div className="ed-sample-status"><span>Interested</span><b>Draft ready for review</b></div>
            </div>
          </div>
        </div>
      </section>

      <section id="agents" className="ed-section ed-wrap">
        <div className="ed-section-head">
          <div>
            <span className="ed-k">Works with your agents</span>
            <h2 className="ed-h2">Run it from the agent you already use.</h2>
          </div>
          <div>
            <p className="ed-desc">Corral is an MCP server. Ask Claude, ChatGPT, Cursor or OpenClaw which companies fit, who replied, or to draft the next email. Keys can draft. Only you can send.</p>
            <Link className="ed-link" href={ROUTES.mcp}>How the MCP server works <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="ed-agents">
          <div className="ed-client-panel"><ClientList /></div>
          <div className="ed-agent-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ed-photo" src="/corral/editorial/agents.webp" alt="Person working on a laptop in a quiet living room" />
          </div>
        </div>
        <div className="ed-int">
          <p className="ed-int-title">Your mailbox, your calendar, your agents.</p>
          <ul className="lv-int__grid">{[...TOOL_LOGOS, ...AGENT_LOGOS].map((l) => <LogoItem key={l.name} l={l} />)}</ul>
        </div>
      </section>

      <section id="faq" className="ed-section ed-wrap">
        <div className="ed-faq">
          <div>
            <span className="ed-k">Questions</span>
            <h2 className="ed-h2">Good questions.</h2>
            <p className="ed-desc">What Corral does, where the leads come from and how you stay in control.</p>
          </div>
          <div className="lv-faq__list">
            {FAQ.map((item) => (
              <details key={item.q} className="lv-faq__item">
                <summary><span>{item.q}</span><Plus size={16} weight="bold" aria-hidden="true" /></summary>
                <p>{item.q === "When can I start?" ? START_ANSWER : item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ed-section ed-wrap">
        <div className="ed-closing">
          <div className="ed-closing-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ed-photo" src="/corral/editorial/close.webp" alt="People smiling in conversation around a table" />
          </div>
          <div className="ed-closing-copy">
            <span className="ed-k">Get started with Corral</span>
            <h2 className="ed-h2">Your first week is free.</h2>
            <p className="ed-desc">Sign in to start using Corral.</p>
            <div className="ed-wl ed-offer">
              <div className="ed-actions">
                <Link className="ed-primary" href={SIGN_IN}>Get started <span aria-hidden="true">↗</span></Link>
                <Link className="ed-secondary" href={SIGN_IN}>Watch a demo</Link>
              </div>
              <p className="ed-auth-note">Both options open sign-in.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="ed-footer ed-wrap">
        <div className="ed-footer-top">
          <Link className="lv-logo" href={ROUTES.home}><Mark size={20} /><span>Corral</span></Link>
          <div className="ed-footlinks">
            <Link href={ROUTES.mcp}>MCP</Link>
            <Link href={ROUTES.security}>Security</Link>
            <Link href={ROUTES.changelog}>Changelog</Link>
            <Link href={ROUTES.terms}>Terms</Link>
            <Link href={ROUTES.privacy}>Privacy</Link>
          </div>
        </div>
        <div className="ed-footer-bottom">
          <p>Photography is illustrative, not customer endorsement. Product screens show sample workspace data.</p>
          <span>© 2026 Corral. Made in Nairobi.</span>
        </div>
        <div className="ed-bottom-reef" aria-hidden="true" />
      </footer>
    </main>
  );
}
