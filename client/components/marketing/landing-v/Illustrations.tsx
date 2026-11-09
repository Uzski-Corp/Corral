/* Small, code-native product illustrations: sample data, not customer results. */
import { Mark } from "@/components/app/icons";
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarCheck, Check, EnvelopeSimple, Gear, Globe, House, Package, SealCheck, Target } from "@phosphor-icons/react/dist/ssr";

/* eslint-disable @next/next/no-img-element -- static build, SVG logos ship as they are */
function Win({ title, logo, children }: { title: string; logo?: string; children: ReactNode }) {
  return <div className="lv-win">
    <div className="lv-win__bar">{!logo && <Mark size={12} />}{logo && <img src={logo} alt="" width={12} height={12} />}<span>{title}</span></div>
    {children}
  </div>;
}

export function WorkflowIllustration({ step }: { step: string }) {
  return <div className={`lv-mini lv-mini--${step}`} aria-hidden="true">
    {step === "01" && <Win title="ColdTrace · Product"><div className="lv-win__split">
      <ul className="lv-side"><li><House size={11} /></li><li className="is-on"><Package size={11} /></li><li><Target size={11} /></li><li><Gear size={11} /></li></ul>
      <div className="lv-win__main"><b>ColdTrace</b><span className="lv-mini__line" /><span className="lv-mini__line short" />
        <div className="lv-chips"><span className="lv-chip">Cold rooms</span><span className="lv-chip">East Africa</span><span className="lv-chip">Dairy</span></div>
        <span className="lv-pill"><Check size={10} weight="bold" /> Product learned</span></div></div></Win>}
    {step === "02" && <Win title="Companies · Fit 80+"><div className="lv-rows">
      <span className="lv-group"><i />Strong fit<em>3</em></span>
      {[["Kilima Dairies", "94", true], ["Rift Foods", "88", false], ["Mara Cold Chain", "82", false]].map(([name, score, on]) => <div key={String(name)} className={on ? "is-on" : undefined}><Globe size={12} /><span>{name}</span><b>{score}</b></div>)}
    </div></Win>}
    {step === "03" && <Win title="New message" logo="/corral/logos/gmail.svg"><div className="lv-mail">
      <div className="lv-mail__to"><span className="lv-mini__avatar"><img src="/corral/app/av-wanjiru.jpg" alt="" width={24} height={24} /></span><span><b>Wanjiru Mwangi</b><small>Head of Supply Chain</small></span></div>
      <span className="lv-chip-ok"><SealCheck size={10} weight="fill" /> Email checked</span>
      <span className="lv-mini__subject"><EnvelopeSimple size={12} /> Cold-room pilot</span>
      <span className="lv-send">Draft ready <ArrowUpRight size={10} weight="bold" /></span>
    </div></Win>}
    {step === "04" && <Win title="Replies"><div className="lv-rows">
      <span className="lv-group"><i />Interested<em>1</em></span>
      <div className="is-on"><span className="lv-mini__avatar"><img src="/corral/app/av-wanjiru.jpg" alt="" width={24} height={24} /></span><span>“Let’s talk next week.”</span></div>
      <div className="lv-cal"><img src="/corral/logos/google-calendar.svg" alt="" width={14} height={14} /><span><b>ColdTrace × Kilima</b><small>Tue, 10:00 · 30 min</small></span><CalendarCheck size={13} /></div>
    </div></Win>}
  </div>;
}

const checks = [
  { label: "Own cold rooms", points: 30, max: 30 },
  { label: "Spoilage risk", points: 25, max: 25 },
  { label: "Company size", points: 12, max: 15 },
  { label: "Decision-maker", points: 10, max: 10 },
  { label: "Installation region", points: 10, max: 10 },
  { label: "Needs live alerts", points: 7, max: 10 },
];

export function ScoreIllustration({ scenario }: { scenario?: "logistics" } = {}) {
  const logistics = scenario === "logistics";
  const labels = ["Kenya expansion", "Distribution fit", "Brand profile", "Decision-maker", "Target market", "Fulfilment fit"];
  return <figure className="lv-score" aria-label={logistics ? "Illustrative company fit: Meridian Home Co. scores 94 out of 100 across six checks." : "Sample company fit: Kilima Dairies scores 94 out of 100 across six checks."}>
    <div className="lv-score__top"><span><span className="lv-score__fav"><Globe size={16} /></span><b>{logistics ? "Meridian Home Co." : "Kilima Dairies"}</b><small>{logistics ? "meridianhome.example" : "kilima.co.ke"}</small></span>{!logistics && <span className="lv-score__sample">Sample</span>}</div>
    <div className="lv-score__summary"><div className="lv-score__ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" /><circle cx="50" cy="50" r="43" pathLength="100" strokeDasharray="94 100" /></svg><strong>94<small>/ 100</small></strong></div><div><span className="lv-score__fit"><Check size={14} /> Strong fit</span><h3>Worth reaching out.</h3><p>{logistics ? "Kenya market entry announced." : "Cold rooms. Clear need."}<br />{logistics ? "Local fulfilment fits the offer." : "The right person to contact."}</p></div></div>
    <ul className="lv-score__checks">{checks.map((c, i) => <li key={c.label} className={i === 0 ? "is-on" : undefined}><span>{logistics ? labels[i] : c.label}</span><span className="lv-score__track" aria-hidden="true"><i style={{ width: `${c.points / c.max * 100}%` }} /></span><b>{c.points}<small>/{c.max}</small></b></li>)}</ul>
    <div className="lv-score__source"><span className="lv-score__source-art" aria-hidden="true"><Mark size={20} /></span><span><b>{logistics ? "Kenya market entry note" : "38 pages read"}</b><small>{logistics ? "meridianhome.example/news/kenya" : "Every point links to its source"}</small></span><span className="lv-score__source-check"><Check size={16} /></span></div>
    {!logistics && <figcaption>Sample workspace · Outreach starts at 80</figcaption>}
  </figure>;
}
