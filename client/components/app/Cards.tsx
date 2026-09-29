import Image from "next/image";
import { Avatar, Receipt, Receipts, Tag } from "./primitives";
import { Icon } from "./icons";

/** Floating person card: a reply, with the face fading into the card. */
export function PersonCard({ src = "/corral/or/hero-wanjiru.jpg" }: { src?: string }) {
  return (
    <div className="c-card c-personcard c-app">
      <Image className="c-personcard__img" src={src} alt="Wanjiru Mwangi (sample person)" width={240} height={320} sizes="240px" />
      <div className="c-personcard__top"><span className="c-faint" style={{ fontSize: 12.5 }}>Replied 2h ago</span>
        <span className="c-strong" style={{ fontSize: 18, letterSpacing: -0.3, paddingTop: 6 }}>Wanjiru Mwangi</span><span>Head of Supply Chain</span><span>Kilima Dairies</span></div>
      <div className="c-personcard__bot"><p>“Could you pilot this across our three Nakuru sites before the dry season?”</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Tag status="Interested" /><span className="c-muted" style={{ fontSize: 12.5 }}>Reply drafted · Cal.com link added</span></div></div>
    </div>
  );
}

export function MeetingCard() {
  return (
    <div className="c-card c-meet c-app">
      <div className="c-meet__top"><Tag status="Meeting booked" /><span className="c-faint" style={{ fontSize: 12.5 }}>just now</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Avatar id="kamau" size={36} />
        <div className="c-person__txt"><span className="c-strong" style={{ fontSize: 15 }}>Brian Kamau booked a call</span><span>COO · Pwani Fresh</span></div></div>
      <div className="c-meet__slot"><Icon name="cal" /><div className="c-person__txt"><span className="c-strong">Thu 2 Oct · 10:30–10:50 EAT</span><span>Cold-room pilot walkthrough · Cal.com</span></div></div>
      <Receipts><Receipt meta="auto">Sequence stopped at step 2</Receipt><Receipt meta="PX-2291">Deal opened in Phoenix ERP</Receipt><Receipt meta="24h before">Kilima case study queued in AutoSend</Receipt></Receipts>
    </div>
  );
}
