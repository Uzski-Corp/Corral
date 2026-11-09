import type { ReactNode } from "react";
import Link from "next/link";
import { Mark } from "@/components/app/icons";
import { ROUTES } from "@/lib/marketing/site";
import { editorialFont } from "../landing-v/editorial-font";
import "./editorial-document.css";
import "../landing-v/editorial-mount.css";

/** The shared reading layout from the recommended Doop desktop and mobile pages. */
export function EditorialDocument({ kicker, title, lede, contact = "hello@uzskicorp.agency", children }: {
  kicker: string; title: string; lede: string; contact?: string; children: ReactNode;
}) {
  return <main className={`ed-doc ${editorialFont.variable}`} id="main" key={title}>
    <div className="ed-doc-wrap">
      <Link className="ed-doc-brand ed-mount" href={ROUTES.home}><Mark size={22} /><span>Corral</span></Link>
      <p className="ed-doc-k ed-mount ed-mount--1">{kicker}</p>
      <h1 className="ed-mount ed-mount--2">{title}</h1>
      <p className="ed-doc-lede ed-mount ed-mount--3">{lede}</p>
      <div className="ed-mount ed-mount--body ed-mount--4">{children}</div>
      <p className="ed-doc-note ed-mount ed-mount--body ed-mount--4">corral.uzskicorp.agency · Contact <a href={`mailto:${contact}`}>{contact}</a></p>
      <Link className="ed-doc-back ed-mount ed-mount--body ed-mount--4" href={ROUTES.home}>← Back to landing</Link>
    </div>
  </main>;
}
