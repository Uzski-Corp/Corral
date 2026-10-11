/* The four heroes (Bau, Oct 7). Same words structure (kicker, headline, one line, the waitlist), four compositions.
   Inspiration: warp.dev/oz (type first, product on a tinted band) and milkstraw.ai (the product floating on a photo
   plate). Neither is copied; the grounds are Corral's own: the blue grounds, the Open Range land, the dusk. */
import type { CSSProperties } from "react";
import { HEROES, KICKER, AGENT_LOGOS, type VariantId } from "./copy";
import { Nav } from "./Sections";
import { AgentChat, AgentRun, BlueGround, School } from "./Visuals";
import { WaitlistForm } from "./WaitlistForm";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function Copy({ v, tone = "light", align = "start" }: { v: VariantId; tone?: "light" | "blue"; align?: "start" | "center" }) {
  const h = HEROES[v];
  return (
    <div className={`lv-copy lv-copy--${align}`}>
      <span className="lv-kicker lv-in" style={d(0)}>{KICKER}</span>
      <h1 className="lv-h1 lv-in" style={d(60)}>{h.headline}</h1>
      <p className="lv-sub lv-in" style={d(140)}>{h.sub}</p>
      <div className="lv-in" style={d(220)}>
        <WaitlistForm id="join" source={`v${v}`} tone={tone} align={align} fragments />
      </div>
    </div>
  );
}

/** 1 · Statement: big type on the off-white, then the run on a blue ground. */
function Statement() {
  return (
    <header className="lv-hero lv-hero--1">
      <Nav />
      <div className="lv-wrap lv-h1-top"><Copy v="1" /></div>
      <div className="lv-wrap lv-in" style={d(320)}>
        <BlueGround className="lv-h1-plate"><AgentRun className="lv-h1-run" /></BlueGround>
      </div>
    </header>
  );
}

/** 2 · Plate: the run floating on the Open Range, bleeding off the bottom. */
function Plate() {
  return (
    <header className="lv-hero lv-hero--2">
      <Nav />
      <div className="lv-wrap lv-h2-top"><Copy v="2" /></div>
      <div className="lv-wrap lv-in" style={d(320)}>
        <div className="lv-h2-plate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lv-h2-photo" src="/corral/or/range-wide.jpg" alt="" width={2400} height={1500} fetchPriority="high" decoding="async" />
          <School className="lv-h2-school" />
          <AgentRun className="lv-h2-run" />
        </div>
      </div>
    </header>
  );
}

/** 3 · Blue: the whole fold is the blue ground; the run plays row by row beside the words. */
function Blue() {
  return (
    <BlueGround className="lv-hero lv-hero--3">
      <Nav tone="blue" />
      <div className="lv-wrap lv-h3-grid">
        <Copy v="3" tone="blue" />
        <div className="lv-in" style={d(240)}><AgentRun play className="lv-h3-run" /></div>
      </div>
    </BlueGround>
  );
}

/** 4 · Agent: centred, and the first picture is your own agent calling Corral. */
function Agent() {
  return (
    <header className="lv-hero lv-hero--4">
      <Nav />
      <div className="lv-wrap lv-h4-top">
        <Copy v="4" align="center" />
        <ul className="lv-h4-clients lv-in" style={d(300)} aria-label="Works from">
          {AGENT_LOGOS.slice(0, 4).map((l) => (
            // eslint-disable-next-line @next/next/no-img-element
            <li key={l.name}><img src={l.src} alt="" width={18} height={18} />{l.name}</li>
          ))}
        </ul>
      </div>
      <div className="lv-h4-stage lv-in" style={d(380)}>
        <div className="lv-h4-sky" aria-hidden="true"><School className="lv-h4-school" /></div>
        <div className="lv-wrap lv-h4-pair">
          <AgentChat className="lv-h4-chat" />
          <AgentRun className="lv-h4-run" />
        </div>
      </div>
    </header>
  );
}

export function Hero({ v }: { v: VariantId }) {
  if (v === "1") return <Statement />;
  if (v === "2") return <Plate />;
  if (v === "3") return <Blue />;
  return <Agent />;
}
