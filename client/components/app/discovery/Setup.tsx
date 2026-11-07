"use client";
import { useState } from "react";
import { Dialog } from "../Overlays";
import { Button, Segmented, cx } from "../primitives";
import { Icon } from "../icons";
import { Select } from "../Form";
import { Banner } from "../States";
import { MultiPick } from "../leads/parts";
import { estimateCredits, etaText, exampleSearches, plural, setupIssues, type Criteria } from "@/lib/discovery/run";
import { COUNTRIES, INDUSTRIES } from "@/lib/discovery/markets";
import { CREDITS, DEFAULT_CRITERIA, ICP, PRODUCTS } from "./data";

const f = (n: number) => n.toLocaleString("en-US");
const LIMITS = ["100", "250", "500", "1,000"];
const BARS = ["60", "70", "80"];

export type RunSetupSeed = { criteria?: Criteria; limit?: number; enrichAt?: number };
/** The seed for the `new-error` review state: no country picked and more credits than are free. */
export const SETUP_ERROR_SEED: RunSetupSeed = { criteria: { ...DEFAULT_CRITERIA, countries: [] }, limit: 1000, enrichAt: 60 };

/** A product the signed-in workspace actually has. */
export type SetupProduct = { id: string; name: string; sourceCount: number | null };

const BLANK_CRITERIA: Criteria = { industries: [], countries: [], sizes: ["51–200", "201–1,000"], queries: [] };
const EAST_AFRICA = new Set(["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia"]);

function sourceMeta(n: number | null): string | undefined {
  if (n == null) return undefined;
  if (n === 0) return "No sources yet";
  return `${n.toLocaleString("en-US")} ${n === 1 ? "source" : "sources"}`;
}

function placeName(countries: string[]): string {
  if (countries.length === 0) return "anywhere";
  if (countries.length > 2 && countries.every((c) => EAST_AFRICA.has(c))) return "East Africa";
  if (countries.length > 2) return `${countries.length} countries`;
  return countries.join(", ");
}

/**
 * New run. What to look for comes from the product's knowledge base (Who buys it) and can be
 * narrowed for this run. The credit estimate updates as you change the limit and the fit bar;
 * problems block Start and say why. A run that starts while another runs is queued behind it.
 */
export function RunSetup({ open, onClose, onStart, inline, seed, queueBehind, held = 171, products, productsPhase = "ready", onRetryProducts, creditsLeft }: {
  open: boolean; onClose: () => void; onStart: (r: { name: string; product: string; productId?: string; criteria: Criteria; limit: number; enrichAt: number; queued: boolean }) => void;
  inline?: boolean; seed?: RunSetupSeed; queueBehind?: string;
  /** Credits held by the run in progress (its estimate minus what it has used). */ held?: number;
  /** Workspace products. Omit this for the sample catalog used in design review. */
  products?: SetupProduct[];
  productsPhase?: "loading" | "ready" | "error";
  onRetryProducts?: () => void;
  /** Credits left this month. Omit for the sample balance; null while that number is still loading. */
  creditsLeft?: number | null;
}) {
  const live = products !== undefined;
  const firstId = products?.[0]?.id ?? null;
  const [product, setProduct] = useState<string | null>(live ? firstId : "sensors");
  const [c, setC] = useState<Criteria>(seed?.criteria ?? (live ? BLANK_CRITERIA : DEFAULT_CRITERIA));
  const [limit, setLimit] = useState(seed?.limit ?? 250);
  const [bar, setBar] = useState(seed?.enrichAt ?? 70);
  const [attempted, setAttempted] = useState(false);
  if (live && product === null && firstId && productsPhase === "ready") setProduct(firstId);
  const est = estimateCredits(limit, bar);
  const knownCredits = creditsLeft !== undefined && creditsLeft !== null;
  const free = (knownCredits ? creditsLeft : CREDITS.left) - held;
  // A queued run spends nothing yet, so a zero balance is not a reason to block the form.
  const issues = setupIssues(c, { need: est.total, left: creditsLeft === null ? est.total : free });
  const chosen = live ? products.find((p) => p.id === product) : undefined;
  const sample = PRODUCTS.find((p) => p.value === product);
  const productName = live ? (chosen?.name ?? "") : (sample?.label ?? "");
  const productIssues = live && productsPhase === "error"
    ? [{ field: "product", text: "Couldn’t load your products." }]
    : live && productsPhase === "ready" && !chosen
      ? [{ field: "product", text: "Add a product first. Corral scores every company against it." }]
      : [];
  const shown = live ? issues.filter((i) => i.field === "credits") : [...productIssues, ...issues];
  const missing = live && attempted && (!chosen || c.industries.length === 0 || c.countries.length === 0);
  const options = live
    ? products.map((p) => ({ value: p.id, label: p.name, meta: sourceMeta(p.sourceCount) }))
    : PRODUCTS;
  const searches = Math.max(1, Math.round(c.industries.length * c.countries.length * 1.5));
  const examples = live ? exampleSearches(c, 3) : DEFAULT_CRITERIA.queries.slice(0, 3);
  const name = `${c.industries.slice(0, 2).join(" & ") || "Companies"} · ${placeName(c.countries)}`;
  const bad = (k: string) => (!live || attempted) && issues.some((i) => i.field === k);
  const put = (k: keyof Criteria) => (v: string[]) => setC((x) => ({ ...x, [k]: v }));
  const placeholder = productsPhase === "loading" ? "Loading products" : "No products yet";

  const body = (
    <div className="d-setup">
      {shown.length > 0 && (
        <Banner tone="error" title={shown.length === 1 ? "One thing to fix" : `${shown.length} things to fix`}>
          <ul className="d-setup__issues">{shown.map((i) => <li key={i.field}>{i.text}</li>)}</ul>
        </Banner>
      )}
      <div className="d-setup__row">
        <span className="d-setup__label">Product</span>
        <div><Select label="Product" value={product} onChange={setProduct} options={options} placeholder={placeholder} width={260} />
          <p className="d-setup__help">Corral scores every company against this product&rsquo;s knowledge base.{live && productsPhase === "error" && <> <button type="button" className="c-link" onClick={onRetryProducts}>Try again</button></>}</p></div>
      </div>
      <div className="d-setup__row">
        <span className="d-setup__label">Look for</span>
        <div className="d-setup__look">
          <div className="d-setup__pick"><span>Industry</span><MultiPick label="Industries" values={c.industries} options={live ? INDUSTRIES : ICP.industries} onChange={put("industries")} invalid={!live && bad("industries")} searchable={live} /></div>
          <div className="d-setup__pick"><span>Country</span><MultiPick label="Countries" values={c.countries} options={live ? COUNTRIES : ICP.countries} onChange={put("countries")} invalid={!live && bad("countries")} searchable={live} /></div>
          <div className="d-setup__pick"><span>Size</span><MultiPick label="Company sizes" values={c.sizes} options={ICP.sizes} onChange={put("sizes")} /></div>
          <p className="d-setup__help"><Icon name="book" size={12} />{live
            ? (chosen ? <>From {chosen.name}. Changes here apply to this run only.</> : <>Add a product under Products. Changes here apply to this run only.</>)
            : <>From {productName} · Who buys it. Changes here apply to this run only.</>}</p>
        </div>
      </div>
      <div className="d-setup__row">
        <span className="d-setup__label">Searches</span>
        <div>
          {c.countries.length && c.industries.length ? <>
            <p className="d-setup__lede">Corral writes {plural(searches, "search", "searches")} from these, for example:</p>
            <ul className="d-queries">{examples.map((q) => <li key={q} className="c-mono">{q}</li>)}</ul>
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
      <div className={cx("d-estimate", !live && bad("credits") && "is-error")}>
        <span className="d-estimate__head">This run</span>
        {live ? (
          <p>{creditsLeft === null ? "…" : `${f(est.total)} credits`} · {etaText(est.minutes)}</p>
        ) : (
          <ul>
            <li><span className="c-num">~{f(est.lookups)}</span> people lookups <span className="c-faint">site → Hunter → Dropcontact</span></li>
            <li><span className="c-num">~{f(est.checks)}</span> email checks <span className="c-faint">ZeroBounce</span></li>
            <li><span className="c-num">{f(est.total)}</span> of {f(free)} credits free this month {held > 0 && <span className="c-faint">({f(held)} held for the run in progress)</span>}</li>
            <li>{etaText(est.minutes)}. You can close this page; Corral tells you when it&rsquo;s done.</li>
          </ul>
        )}
      </div>
    </div>
  );
  const blocked = shown.length > 0 || (live && productsPhase === "loading");
  const why = live
    ? (productsPhase === "loading" ? "Loading products" : missing ? (!chosen ? "Add a product first." : "Pick an industry and a country.") : queueBehind ? `Starts after ${queueBehind}` : null)
    : shown.length ? `Fix ${shown.length === 1 ? "1 thing" : `${shown.length} things`} above to start` : queueBehind ? `Starts after ${queueBehind}` : null;
  const go = () => {
    if (live && (productsPhase !== "ready" || !chosen || c.industries.length === 0 || c.countries.length === 0 || issues.some((i) => i.field === "credits"))) { setAttempted(true); return; }
    onStart({ name, product: productName, productId: chosen?.id, criteria: live ? { ...c, queries: exampleSearches(c, searches) } : c, limit, enrichAt: bar, queued: !!queueBehind });
  };
  return (
    <Dialog open={open} onClose={onClose} inline={inline} width={640} title="New discovery run" description="Corral searches the web, reads each site and scores it for your product. Nothing is sent to anyone."
      footer={<>{why && <span className="d-setup__why">{why}</span>}<Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={blocked} onClick={go}>{queueBehind ? "Queue run" : "Start run"}</Button></>}>
      {body}
    </Dialog>
  );
}
