"use client";
/* A page outside the app failed to render (M10). Say it plainly, say nothing was lost, offer the retry. */
import { useEffect } from "react";
import Link from "next/link";
// Deep imports on purpose: a root error/not-found file ships with every route, so it must not pull in the app.
import "@/components/marketing/site/styles";
import { SiteFooter, SiteNav } from "@/components/marketing/site/Chrome";
import { HOME, homeOf } from "@/lib/marketing/site";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="theme-open-range sn">
      <SiteNav />
      <main id="main" className="sn-wrap sn-404">
        <p className="sn-kicker">Something broke</p>
        <h1 className="sn-h1">This page didn’t load.</h1>
        <p className="sn-lede">The problem is on our side, not yours. Nothing you’d saved is affected. Try again, or head back home.</p>
        <div className="sn-404__go">
          <button type="button" className="c-btn c-btn--primary c-btn--lg" onClick={() => retry()}>Try again</button>
          <Link className="sn-link" href={homeOf(HOME)}>Go to the home page</Link>
        </div>
        {error.digest && <p className="sn-err__digest">Reference {error.digest}</p>}
      </main>
      <SiteFooter />
    </div>
  );
}
