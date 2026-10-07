import Image from "next/image";
import { Avatar, Tag, type Status } from "@/components/app/primitives";

const FACES: [string, string, string, Status, string, string][] = [
  ["kamau", "Brian Kamau", "COO, Pwani Fresh", "Objection", "“Honestly the price is the blocker.”", "Booked a call two days later."],
  ["amara", "Amara Nwosu", "Ops Director, Savanna Juice Co.", "Interested", "“Who else in dairy is using this?”", "Got the Kilima case study."],
  ["grace", "Grace Holloway", "VP Operations, Nyota Beverages", "Meeting booked", "“Adding our QA lead, Mercy.”", "Thursday, 10:30."],
];

export function People() {
  return (
    <section id="people" className="or-people">
      <div className="or-wrap">
        <div className="or-people__head"><span className="or-kicker">What comes back</span><h2 className="or-h2">People answer when the agent has read their site.</h2></div>
        <div className="or-people__grid">
          <figure className="or-lead">
            <div className="or-lead__img"><Image className="or-bg" src="/corral/or/p-wanjiru.jpg" alt="Wanjiru Mwangi (sample person)" fill sizes="(max-width: 1080px) 100vw, 50vw" /></div>
            <div className="or-lead__thread c-app c-card">
              <div className="c-thread" style={{ cursor: "default" }}><Avatar id="wanjiru" size={28} />
                <div className="c-thread__body">
                  <div className="c-thread__top"><span className="c-strong">Wanjiru Mwangi</span><span className="c-faint" style={{ fontSize: 12 }}>09:15</span></div>
                  <span className="c-muted" style={{ fontSize: 12.5 }}>Kilima Dairies · Fit 94</span>
                  <div style={{ fontSize: 14, lineHeight: "21px", color: "var(--color-text-body)", paddingTop: 6 }}>Could you pilot this across our three Nakuru sites before the dry season? We lost two batches in February.</div>
                  <div style={{ paddingTop: 8 }}><Tag status="Interested" /></div>
                </div>
              </div>
            </div>
          </figure>
          <div className="or-faces">
            {FACES.map(([a, n, r, t, q, o]) => (
              <figure key={a} className="or-face">
                <div className="or-face__img"><Image className="or-bg" src={`/corral/or/p-${a}.jpg`} alt={`${n} (sample person)`} fill sizes="148px" /></div>
                <figcaption><div className="or-face__who"><b>{n}</b><span>{r}</span></div><p>{q}</p>
                  <div className="c-app or-face__out"><Tag status={t} /><span className="c-muted">{o}</span></div></figcaption>
              </figure>
            ))}
          </div>
        </div>
        <blockquote className="or-quote">
          <div className="or-quote__img"><Image className="or-bg" src="/corral/or/p-tomas.jpg" alt="Tomás Ibarra (sample person)" fill sizes="96px" /></div>
          <div><p>“We stopped buying lists. Corral reads the same sites I would, just all of them, and tells me who to write to.”</p>
            <footer><b>Tomás Ibarra</b><span>Founder, ColdTrace Sensors</span><span className="or-quote__stat">3 meetings in week one</span></footer></div>
        </blockquote>
      </div>
    </section>
  );
}
