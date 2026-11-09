import type { ReactNode } from "react";
import Link from "next/link";
import { Mark } from "@/components/app/icons";
import { ROUTES } from "@/lib/marketing/site";
import { editorialFont } from "../landing-v/editorial-font";
import "./editorial-document.css";

/** The shared reading layout from the recommended Doop desktop and mobile pages. */
export function EditorialDocument({ kicker, title, lede, contact = "hello@uzskicorp.agency", children }: {
  kicker: string; title: string; lede: string; contact?: string; children: ReactNode;
}) {
  return <main className={`ed-doc ${editorialFont.variable}`} id="main">
    <div className="ed-doc-wrap">
      <Link className="ed-doc-brand" href={ROUTES.home}><Mark size={22} /><span>Corral</span></Link>
      <p className="ed-doc-k">{kicker}</p>
      <h1>{title}</h1>
      <p className="ed-doc-lede">{lede}</p>
      {children}
      <p className="ed-doc-note">corral.uzskicorp.agency · Contact <a href={`mailto:${contact}`}>{contact}</a></p>
      <Link className="ed-doc-back" href={ROUTES.home}>← Back to landing</Link>
    </div>
  </main>;
}
