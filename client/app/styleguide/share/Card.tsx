"use client";
import { FitBar, Mark } from "@/components/app";
import { FitPiece, HandoffPiece, KeyAccessPiece, ProvenancePiece, Screen } from "@/components/marketing/site";
import { PLANS, priceWords } from "@/lib/marketing/plans";
import { CHANGELOG } from "@/lib/marketing/site";
import type { ShareCard } from "@/lib/marketing/share";

function Piece({ p }: { p: ShareCard["piece"] }) {
  if (p === "fit") return <FitPiece />;
  if (p === "prov") return <ProvenancePiece />;
  if (p === "hand") return <HandoffPiece />;
  if (p === "access") return <KeyAccessPiece />;
  if (p === "unibox") return <div className="sh-screen"><Screen view="unibox" unibox="draft" /></div>;
  if (p === "plans") return (
    <div className="c-app pp-card sh-plans">{PLANS.map((x) => (
      <div key={x.id} className={`sh-plan${x.primary ? " is-primary" : ""}`}><b>{x.name}</b><span className="sh-plan__n">{priceWords(x)}</span>
        <span className="c-muted">{x.reads ? `${x.reads.toLocaleString("en")} companies a month` : "25,000 and up"}</span></div>))}</div>);
  const c = CHANGELOG[0];
  return <div className="c-app pp-card sh-change"><span className="c-mono">{c.date} · {c.version}</span>{c.items.slice(0, 6).map((i) => <div key={i.area}><b>{i.area}</b><span>{i.text}</span></div>)}</div>;
}

export function ShareCardView({ card }: { card: ShareCard }) {
  return (
    <div id={`share-${card.id}`} className={`sh theme-open-range sh--${card.piece}`}>
      <div className="sh__copy">
        <div className="sh__brand"><Mark size={30} /><span>Corral</span>{card.kicker !== "Corral" && <em>{card.kicker}</em>}</div>
        <h2>{card.title}</h2>
        <div className="sh__foot"><FitBar value={94} size="md" /><span>corral.app</span></div>
      </div>
      <div className="sh__piece" aria-hidden="true" inert><Piece p={card.piece} /></div>
    </div>
  );
}
