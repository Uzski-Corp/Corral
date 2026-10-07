/* Server-rendered pictures for the landing variants: everything here is HTML, CSS and inline SVG, so it is crisp at
   any density, needs no image optimiser (the corral-landing Worker is a static build), and reads with JS off.
   The sample workspace (ColdTrace Sensors selling to Kilima Dairies) is the product's own demo data. */
import type { CSSProperties, ReactNode } from "react";
import { Article, Binoculars, ChatCircleDots, Envelope, Gauge, UserFocus } from "@phosphor-icons/react/dist/ssr";
import { Avatar, FitBar, Tag } from "@/components/app/primitives";
import { Mark } from "@/components/app/icons";
import { AGENT_LOGOS, SECTIONS } from "./copy";

/* ------------------------------------------------------------ the blue ground (brand: #224FD1 → #83A6F3) */
/** A quiet school of fish, far off. The marine hint, kept to a whisper: eleven hairline shapes at low opacity. */
export function School({ className, style }: { className?: string; style?: CSSProperties }) {
  const fish: [number, number, number][] = [[0, 18, 1], [16, 10, .9], [30, 20, 1], [44, 6, .8], [52, 16, .95], [66, 24, .85], [72, 8, .9], [88, 14, 1], [100, 22, .8], [112, 9, .9], [128, 17, .85]];
  return (
    <svg className={className} style={style} viewBox="0 0 150 36" aria-hidden="true" focusable="false">
      {fish.map(([x, y, s], i) => (
        <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0 2.2c2.2-2 5.6-2 8 0-2.4 2-5.8 2-8 0Zm8 0 3-1.8v3.6L8 2.2Z" fill="none" stroke="currentColor" strokeWidth=".6" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function BlueGround({ children, className, school = true }: { children?: ReactNode; className?: string; school?: boolean }) {
  return (
    <div className={`lv-blue ${className ?? ""}`}>
      <div className="lv-grain" aria-hidden="true" />
      {school && <School className="lv-school" />}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ the run: one company, start to reply */
type Row = { icon: ReactNode; title: ReactNode; meta?: ReactNode; body?: ReactNode };
const ROWS: Row[] = [
  { icon: <Binoculars size={15} />, title: <>Found <b>Kilima Dairies</b></>, meta: "kilima.co.ke", body: "Dairy processor, three plants around Nakuru" },
  { icon: <Article size={15} />, title: "Read 38 pages of their site", meta: "4s" },
  { icon: <Gauge size={15} />, title: <span className="lv-run__fit"><FitBar value={94} /><span>Runs cold rooms, no live alerting</span></span> },
  { icon: <UserFocus size={15} />, title: <span className="lv-run__who"><Avatar id="wanjiru" size={20} /><b>Wanjiru Mwangi</b><span>Head of Supply Chain</span></span>, meta: "email checked" },
  { icon: <Envelope size={15} />, title: "Wrote and sent the first email", meta: "from tomas@coldtrace.io", body: <span className="lv-run__quote">“Saw the cold-room expansion at your Nakuru plant. We put live alerts on rooms like those…”</span> },
  { icon: <ChatCircleDots size={15} />, title: <span className="lv-run__who"><Tag status="Interested" /><span>Wanjiru replied. Draft ready.</span></span>, body: <span className="lv-run__quote">“Could you pilot this across our three sites before the dry season?”</span> },
];

export function AgentRun({ play = false, className }: { play?: boolean; className?: string }) {
  return (
    <figure className={`lv-run c-app ${play ? "is-play" : ""} ${className ?? ""}`} aria-label="Sample run: Corral finds Kilima Dairies, reads its site, scores it 94, finds Wanjiru Mwangi, sends the first email and drafts the answer to her reply.">
      <div className="lv-run__bar">
        <span className="lv-run__agent"><Mark size={14} /> Corral agent</span>
        <span className="lv-run__for">for ColdTrace Sensors</span>
        <span className="lv-run__live"><i aria-hidden="true" />Running</span>
      </div>
      <ol className="lv-run__rows">
        {ROWS.map((r, i) => (
          <li key={i} className="lv-run__row" style={{ "--i": i } as CSSProperties}>
            <span className="lv-run__ic" aria-hidden="true">{r.icon}</span>
            <div className="lv-run__txt">
              <div className="lv-run__top"><span className="lv-run__t">{r.title}</span>{r.meta && <em>{r.meta}</em>}</div>
              {r.body && <div className="lv-run__b">{r.body}</div>}
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="lv-run__cap">Sample workspace</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------ your agent, calling Corral over MCP (V4, agents section) */
const CALLS: [string, string][] = [
  ["search_companies", "4 dairies in Kenya fit 80 or above"],
  ["explain_fit", "Kilima Dairies, 94: runs cold rooms, no live alerting"],
  ["get_company", "Wanjiru Mwangi, Head of Supply Chain"],
  ["enroll_in_sequence", "Wanjiru added to Cold-room pilot, waiting for launch"],
];

export function AgentChat({ className }: { className?: string }) {
  return (
    <figure className={`lv-chat ${className ?? ""}`} aria-label="Sample: an AI agent asks Corral for companies that fit, the reason for the score, the decision-maker, and saves a draft for you to send.">
      <div className="lv-chat__bar">
        <span className="lv-chat__dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="lv-chat__title">Your agent</span>
        <span className="lv-chat__via">
          {AGENT_LOGOS.slice(0, 4).map((l) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={l.name} src={l.src} alt="" width={14} height={14} />
          ))}
          <span>via MCP</span>
        </span>
      </div>
      <div className="lv-chat__body">
        <p className="lv-chat__you">{SECTIONS.agents.prompt}</p>
        <ol className="lv-chat__calls">
          {CALLS.map(([tool, out]) => (
            <li key={tool}><span className="lv-chat__tool"><Mark size={11} />corral · {tool}</span><span className="lv-chat__out">{out}</span></li>
          ))}
        </ol>
        <p className="lv-chat__answer">Kilima Dairies fits best. I added Wanjiru to Cold-room pilot. The first email cites their cold-room expansion and goes out when you launch.</p>
      </div>
      <figcaption className="lv-run__cap">Sample workspace</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------ the footer horizon (replaces the blurry dusk.jpg) */
/** Dusk over open land, drawn: sky, a warm horizon, and ripples spreading from the low sun (the marine whisper).
    Pure vector, so it is sharp at every width and density, and about 3 KB instead of an 876 KB JPEG. */
export function Horizon({ className }: { className?: string }) {
  const H = 560; // horizon line in a 1440 × 800 box
  const ripples = Array.from({ length: 22 }, (_, i) => {
    const t = (i + 1) / 22;
    return { rx: 60 + Math.pow(t, 1.7) * 1500, ry: 4 + Math.pow(t, 1.9) * 230, o: (0.34 * (1 - t) + 0.05).toFixed(3) };
  });
  return (
    <svg className={className} viewBox="0 0 1440 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0A0F1C" />
          <stop offset=".5" stopColor="#0F1729" />
          <stop offset=".78" stopColor="#1A274A" />
          <stop offset=".91" stopColor="#34457A" />
          <stop offset=".97" stopColor="#8E7D8E" />
          <stop offset="1" stopColor="#E9C3A4" />
        </linearGradient>
        <linearGradient id="lv-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A1F1A" />
          <stop offset=".35" stopColor="#17110E" />
          <stop offset="1" stopColor="#0C0907" />
        </linearGradient>
        <radialGradient id="lv-glow" cx="720" cy={H} r="460" gradientUnits="userSpaceOnUse" gradientTransform={`translate(0 ${H}) scale(1 .32) translate(0 ${-H})`}>
          <stop offset="0" stopColor="#FFE2C4" stopOpacity=".75" />
          <stop offset=".22" stopColor="#E7B08C" stopOpacity=".3" />
          <stop offset="1" stopColor="#E7B08C" stopOpacity="0" />
        </radialGradient>
        <clipPath id="lv-below"><rect x="0" y={H} width="1440" height={800 - H} /></clipPath>
      </defs>
      <rect width="1440" height={H} fill="url(#lv-sky)" />
      <rect y={H} width="1440" height={800 - H} fill="url(#lv-land)" />
      <rect width="1440" height="800" fill="url(#lv-glow)" />
      <g clipPath="url(#lv-below)" fill="none" stroke="#F3D9C0">
        {ripples.map((r, i) => <ellipse key={i} cx="720" cy={H} rx={r.rx} ry={r.ry} strokeOpacity={r.o} strokeWidth={i < 6 ? 0.9 : 0.7} vectorEffect="non-scaling-stroke" />)}
      </g>
      <line x1="0" x2="1440" y1={H} y2={H} stroke="#F6D6B8" strokeOpacity=".55" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <circle cx="720" cy={H - 1} r="3" fill="#FFF4E8" />
      <circle cx="720" cy={H - 1} r="14" fill="#FFE2C4" fillOpacity=".25" />
    </svg>
  );
}
