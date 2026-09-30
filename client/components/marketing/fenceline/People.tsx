import Image from "next/image";
import { Tag, type Status } from "@/components/app/primitives";
import { MeetingCard } from "@/components/app/Cards";

const GALLERY: [string, string, string, string, Status, string, string][] = [
  ["a", "wanjiru", "Wanjiru Mwangi", "Head of Supply Chain, Kilima Dairies", "Interested", "Asked for a three-site pilot", "(max-width: 720px) 100vw, 40vw"],
  ["b", "amara", "Amara Nwosu", "Ops Director, Savanna Juice Co.", "Interested", "Wanted proof from dairy", "(max-width: 720px) 50vw, 30vw"],
  ["c", "grace", "Grace Holloway", "VP Operations, Nyota Beverages", "Meeting booked", "Brought her QA lead", "(max-width: 720px) 50vw, 22vw"],
  ["d", "reza", "Reza Santos", "Plant Manager, Tamu Bakeries", "Not interested", "Not this year; asked us back in August", "(max-width: 720px) 50vw, 22vw"],
];

export function People() {
  return (
    <section id="people" className="fl-faces-sec fl-wrap">
      <div className="fl-folio"><b>§ 5</b><span>The other end of the row</span></div>
      <h2 className="fl-h2">The people who answered.</h2>
      <div className="fl-yes">
        <div className="fl-yes__img"><Image className="fl-bg" src="/corral/en/hero-kamau.jpg" alt="Engraved portrait of Brian Kamau (sample person)" fill sizes="(max-width: 1080px) 100vw, 55vw" /></div>
        <div className="fl-yes__txt">
          <p className="fl-cap"><b>Pl. V</b>Brian Kamau, COO, Pwani Fresh.</p>
          <h3>“Honestly the price is the blocker.” Two days later, Brian said yes.</h3>
          <div className="fl-yes__card"><MeetingCard /></div>
        </div>
      </div>
      <div className="fl-gallery">
        {GALLERY.map(([k, a, n, r, t, o, sz]) => (
          <figure key={a} className={`fl-portrait fl-portrait--${k}`}>
            <div className="fl-portrait__img"><Image className="fl-bg" src={`/corral/en/p-${a}.jpg`} alt={`Engraved portrait of ${n} (sample person)`} fill sizes={sz} /></div>
            <figcaption><p className="fl-cap"><b>{n}</b>{r}</p><div className="c-app"><Tag status={t} /><span className="c-muted">{o}</span></div></figcaption>
          </figure>
        ))}
      </div>
      <blockquote className="fl-pull">
        <div className="fl-pull__img"><Image className="fl-bg" src="/corral/en/p-tomas.jpg" alt="Engraved portrait of Tomás Ibarra (sample person)" fill sizes="240px" /></div>
        <div><p>“We stopped buying lists. Corral reads the same sites I would, just all of them, and tells me who to write to.”</p>
          <footer><b>Tomás Ibarra</b><span>Founder, ColdTrace Sensors</span><span>Three meetings in the first week</span></footer></div>
      </blockquote>
    </section>
  );
}
