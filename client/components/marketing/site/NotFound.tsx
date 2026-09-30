/* The 404 (M10): the page Corral couldn’t find, told the way Corral tells you about a site it read.
   A server component: only the address it read is client-side, so the 404 (loaded with every route) stays small. */
import Link from "next/link";
import { CurrentPath } from "./CurrentPath";
import { AuthLink } from "./Visitor";
import { FitBar, Receipt, Receipts } from "@/components/app/primitives"; // deep import, see Chrome.tsx
import { HOME, NAV, homeOf } from "@/lib/marketing/site";

export function NotFoundBody() {
  return (
    <div className="sn-wrap sn-404">
      <p className="sn-kicker">404</p>
      <h1 className="sn-h1">Nothing here fits.</h1>
      <p className="sn-lede">Corral read this address and found no page. It may have moved, or the link had a typo.</p>
      <div className="c-app sn-404__read">
        <Receipts>
          <Receipt meta="0.1s">Read <CurrentPath /></Receipt>
          <Receipt meta={<FitBar value={0} />}>Matched nothing on this site</Receipt>
        </Receipts>
      </div>
      <nav className="sn-404__go" aria-label="Where to next">
        <Link className="c-btn c-btn--primary c-btn--lg" href={homeOf(HOME)}>Go to the home page</Link>
        {NAV.map((n) => <Link key={n.href} className="sn-link" href={n.href}>{n.label}</Link>)}
        <AuthLink className="sn-link" />
      </nav>
    </div>
  );
}
