/* /changelog (M10). One entry per release, dated in the margin; the launch entry carries a real screen. */
import { CHANGELOG, ROUTES } from "@/lib/marketing/site";
import Link from "next/link";
import { AgentSitePage } from "@/components/marketing/landing-v/SitePage";
import { ProductFrame } from "./ProductFrame";
import { Screen } from "./Screen";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${MON[m - 1]} ${d}, ${y}`; };

export function ChangelogPage() {
  return (
    <AgentSitePage current={ROUTES.changelog} kicker="Changelog" title="What’s new in Corral." lede="What changed, when, and where to find it. Entries land here with every release.">
      {CHANGELOG.map((c, i) => (
        <article key={c.version} className="sn-wrap sn-entry" aria-labelledby={`v-${c.version}`}>
          <div className="sn-entry__margin"><time dateTime={c.date}>{longDate(c.date)}</time><span className="c-mono">v{c.version}</span></div>
          <div className="sn-entry__body">
            <h2 id={`v-${c.version}`} className="sn-h2">{c.title}</h2>
            <p className="sn-lede">{c.lede}</p>
            {i === 0 && <ProductFrame label="Companies, Kilima Dairies open on why it scored 94" height={640} phone={580}
              caption="Companies, with Kilima Dairies open on why it scored 94.">
              <Screen view="companies" leads="fit" />
            </ProductFrame>}
            <dl className="sn-changes">{c.items.map((it) => (
              <div key={it.area}><dt>{it.area}</dt><dd>{it.text}{it.href && <> <Link className="sn-link" href={it.href}>More</Link></>}</dd></div>
            ))}</dl>
          </div>
        </article>
      ))}
    </AgentSitePage>
  );
}
