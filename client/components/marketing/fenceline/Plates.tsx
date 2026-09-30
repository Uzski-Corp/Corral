import Image from "next/image";
import { Receipt, Receipts } from "@/components/app/primitives";
import { FitPiece, ProductFrame, Screen } from "../site";

export function Plates() {
  return (
    <section id="plates" className="fl-plates fl-wrap">
      <div className="fl-plate2">
        <div className="fl-plate2__band"><Image className="fl-bg" src="/corral/en/land-band.jpg" alt="" fill sizes="100vw" /></div>
        <div className="fl-plate2__win"><ProductFrame height={600} phone={580} label="The segment F&B · East Africa: thirteen companies that fit"><Screen view="segments" /></ProductFrame></div>
        <div className="fl-plate2__cap">
          <p className="fl-cap"><b>Pl. II</b>The segment, read.</p>
          <p className="fl-lede">Thirteen companies in F&amp;B · East Africa that fit ColdTrace Sensors, each with the person who owns the problem. Pick the rows you trust and enroll them; everything below eighty stays grey until you say otherwise.</p>
        </div>
      </div>

      <div className="fl-split">
        <div className="fl-split__copy">
          <div className="fl-folio"><b>§ 2</b><span>Why each row is there</span></div>
          <h2 className="fl-h2">Every row, a reason.</h2>
          <p className="fl-lede">A fit score is only worth what it can explain. Open any row and Corral shows each check, its points, and the page it read.</p>
          <Receipts className="c-app"><Receipt meta="4s">Read 38 pages of kilima.co.ke</Receipt><Receipt meta="ColdTrace Sensors">Matched your “3-site pilot” proof point</Receipt><Receipt meta="verified">Found Wanjiru Mwangi, Head of Supply Chain</Receipt></Receipts>
        </div>
        <div className="fl-split__plate">
          <Image className="fl-bg" src="/corral/en/acacia-plate.jpg" alt="Engraving of acacia trees at sunrise" fill sizes="(max-width: 1080px) 100vw, 58vw" />
          <span className="fl-cap"><b>Pl. III</b>Acacia, dry season.</span>
          <div className="fl-split__zoom"><FitPiece /></div>
        </div>
      </div>

      <div className="fl-plate4">
        <div className="fl-plate4__head">
          <div><div className="fl-folio"><b>§ 3</b><span>The Unibox</span></div><h2 className="fl-h2">Answers, drafted in your words.</h2></div>
          <p className="fl-lede">Every reply is sorted, matched to your knowledge base and drafted before you open it. Nothing leaves without you. Press Try it to read a thread.</p>
        </div>
        <div className="fl-plate4__stage">
          <div className="fl-notes">
            <p className="fl-note"><b>Sorted</b>Seven kinds of reply, classified in about a second.</p>
            <p className="fl-note"><b>Shown its work</b>Each draft cites the battlecard and the proof it used.</p>
            <p className="fl-note"><b>Still yours</b>You edit, you send. If they go quiet, the next step waits for you.</p>
          </div>
          <div className="fl-plate4__win"><ProductFrame height={720} phone={620} label="The Unibox, Brian Kamau’s price objection with Corral’s draft"><Screen view="unibox" unibox="draft" /></ProductFrame></div>
        </div>
        <p className="fl-cap" style={{ marginTop: 20 }}><b>Pl. IV</b>Tuesday morning, 09:42. Brian has an objection.</p>
      </div>
    </section>
  );
}
