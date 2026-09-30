"use client";
import { useState } from "react";
import { Dialog } from "../Overlays";
import { Button, Segmented, cx } from "../primitives";
import { Icon } from "../icons";
import { Select } from "../Form";
import { Banner } from "../States";
import { MultiPick } from "../leads/parts";
import { estimateCredits, etaText, plural, setupIssues, type Criteria } from "@/lib/discovery/run";
import { CREDITS, DEFAULT_CRITERIA, ICP, PRODUCTS } from "./data";

const f = (n: number) => n.toLocaleString("en-US");
const LIMITS = ["100", "250", "500", "1,000"];
const BARS = ["60", "70", "80"];

export type RunSetupSeed = { criteria?: Criteria; limit?: number; enrichAt?: number };
/** The seed for the `new-error` review state: no country picked and more credits than are free. */
export const SETUP_ERROR_SEED: RunSetupSeed = { criteria: { ...DEFAULT_CRITERIA, countries: [] }, limit: 1000, enrichAt: 60 };

/**
 * New run. What to look for comes from the product's knowledge base (Who buys it) and can be
 * narrowed for this run. The credit estimate updates as you change the limit and the fit bar;
 * problems block Start and say why. A run that starts while another runs is queued behind it.
 */
export function RunSetup({ open, onClose, onStart, inline, seed, queueBehind, held = 171 }: {
  open: boolean; onClose: () => void; onStart: (r: { name: string; criteria: Criteria; limit: number; enrichAt: number; queued: boolean }) => void;
  inline?: boolean; seed?: RunSetupSeed; queueBehind?: string;
  /** Credits held by the run in progress (its estimate minus what it has used). */ held?: number;
}) {
  const [product, setProduct] = useState("sensors");
  const [c, setC] = useState<Criteria>(seed?.criteria ?? DEFAULT_CRITERIA);
  const [limit, setLimit] = useState(seed?.limit ?? 250);
  const [bar, setBar] = useState(seed?.enrichAt ?? 70);
  const est = estimateCredits(limit, bar);
  const free = CREDITS.left - held;
  const issues = setupIssues(c, { need: est.total, left: free });
  const searches = Math.max(1, Math.round(c.industries.length * c.countries.length * 1.5));
  const name = `${c.industries.slice(0, 2).join(" & ") || "Companies"} · ${c.countries.length > 2 ? "East Africa" : c.countries.join(", ") || "anywhere"}`;
  const bad = (k: string) => issues.some((i) => i.field === k);
  const put = (k: keyof Criteria) => (v: string[]) => setC((x) => ({ ...x, [k]: v }));

  const body = (
    <div className="d-setup">
      {issues.length > 0 && (
        <Banner tone="error" title={issues.length === 1 ? "One thing to fix" : `${issues.length} things to fix`}>
          <ul className="d-setup__issues">{issues.map((i) => <li key={i.field}>{i.text}</li>)}</ul>
        </Banner>
      )}
      <div className="d-setup__row">
        <span className="d-setup__label">Product</span>
        <div><Select label="Product" value={product} onChange={setProduct} options={PRODUCTS} width={260} />
          <p className="d-setup__help">Corral scores every company against this product&rsquo;s knowledge base.</p></div>
      </div>
      <div className="d-setup__row">
        <span className="d-setup__label">Look for</span>
        <div className="d-setup__look">
          <div className="d-setup__pick"><span>Industry</span><MultiPick label="Industries" values={c.industries} options={ICP.industries} onChange={put("industries")} invalid={bad("industries")} /></div>
          <div className="d-setup__pick"><span>Country</span><MultiPick label="Countries" values={c.countries} options={ICP.countries} onChange={put("countries")} invalid={bad("countries")} /></div>
          <div className="d-setup__pick"><span>Size</span><MultiPick label="Company sizes" values={c.sizes} options={ICP.sizes} onChange={put("sizes")} /></div>
          <p className="d-setup__help"><Icon name="book" size={12} />From ColdTrace Sensors · Who buys it. Changes here apply to this run only.</p>
        </div>
      </div>
      <div className="d-setup__row">
        <span className="d-setup__label">Searches</span>
        <div>
          {c.countries.length && c.industries.length ? <>
            <p className="d-setup__lede">Corral writes {plural(searches, "search", "searches")} from these, for example:</p>
            <ul className="d-queries">{DEFAULT_CRITERIA.queries.slice(0, 3).map((q) => <li key={q} className="c-mono">{q}</li>)}</ul>
            {searches > 3 && <p className="d-setup__help">and {searches - 3} more. You&rsquo;ll see each search and what it found in the run.</p>}
          </> : <p className="d-setup__lede c-muted">Pick an industry and a country, and Corral writes the searches from them.</p>}
        </div>
      </div>
      <div className="d-setup__row">
        <span className="d-setup__label">Stop after</span>
        <div className="d-setup__inline"><Segmented label="Stop after" options={LIMITS} value={f(limit)} onChange={(v) => setLimit(Number(v.replace(/,/g, "")))} /><span className="c-muted">companies</span></div>
      </div>
      <div className="d-setup__row">
        <span className="d-setup__label">Find people when fit is at least</span>
        <div>
          <div className="d-setup__inline"><Segmented label="Find people when fit is at least" options={BARS} value={String(bar)} onChange={(v) => setBar(Number(v))} /><span className="c-muted">/ 100</span></div>
          <p className="d-setup__help">Finding people and checking emails costs credits. Companies under the bar are still added with their fit; you can find people for them later.</p>
        </div>
      </div>
      <div className={cx("d-estimate", bad("credits") && "is-error")}>
        <span className="d-estimate__head">This run</span>
        <ul>
          <li><span className="c-num">~{f(est.lookups)}</span> people lookups <span className="c-faint">site → Hunter → Dropcontact</span></li>
          <li><span className="c-num">~{f(est.checks)}</span> email checks <span className="c-faint">ZeroBounce</span></li>
          <li><span className="c-num">{f(est.total)}</span> of {f(free)} credits free this month {held > 0 && <span className="c-faint">({f(held)} held for the run in progress)</span>}</li>
          <li>{etaText(est.minutes)}. You can close this page; Corral tells you when it&rsquo;s done.</li>
        </ul>
      </div>
    </div>
  );
  const why = issues.length ? `Fix ${issues.length === 1 ? "1 thing" : `${issues.length} things`} above to start` : queueBehind ? `Starts after ${queueBehind}` : null;
  return (
    <Dialog open={open} onClose={onClose} inline={inline} width={640} title="New discovery run" description="Corral searches the web, reads each site and scores it for your product. Nothing is sent to anyone."
      footer={<>{why && <span className="d-setup__why">{why}</span>}<Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={issues.length > 0} onClick={() => onStart({ name, criteria: c, limit, enrichAt: bar, queued: !!queueBehind })}>{queueBehind ? "Queue run" : "Start run"}</Button></>}>
      {body}
    </Dialog>
  );
}
