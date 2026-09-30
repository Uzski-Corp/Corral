import type { Metadata } from "next";
import "./share.css";
import { SHARE_CARDS } from "@/lib/marketing/share";
import { ShareCardView } from "./Card";

export const metadata: Metadata = { title: "Share images", robots: { index: false } };

/** /styleguide/share: every route's 1200×630 share image, from live components (M10). Screenshotted to opengraph-image.jpg. */
export default function SharePage() {
  return (
    <main className="sh-page">
      <h1 className="sh-page__h">Share images · 1200×630 · saved as each route’s opengraph-image.jpg</h1>
      {SHARE_CARDS.map((c) => <figure key={c.id}><ShareCardView card={c} /><figcaption><code>{c.dir}/opengraph-image.jpg</code> · {c.alt}</figcaption></figure>)}
    </main>
  );
}
