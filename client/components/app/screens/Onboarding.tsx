"use client";
/* Workspace onboarding: five steps, two required (workspace, product), three skippable.
   Left: steps with done / current / skipped. Centre: the step. Right: what Corral knows so far. */
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Button, Receipt, Receipts, Segmented, cx } from "../primitives";
import { GoogleG, Icon, Mark, MicrosoftMark } from "../icons";
import { FormField, RadioGroup, Select, Switch, TextInput, Textarea } from "../Form";
import { Banner, Spinner } from "../States";
import { WorkspaceTile } from "../Shell";
import { ToastProvider, useToast } from "../Toaster";

export const STEPS = [
  { n: 1, id: "workspace", title: "Name your workspace", short: "Workspace", required: true },
  { n: 2, id: "product", title: "Add your first product", short: "First product", required: true },
  { n: 3, id: "site", title: "Let Corral read your site", short: "Your site" },
  { n: 4, id: "mailbox", title: "Connect a mailbox", short: "Mailbox" },
  { n: 5, id: "team", title: "Invite your teammates", short: "Teammates" },
] as const;

const PAGES: [string, string][] = [["coldtrace.io", "home"], ["/product", "4 sensor models"], ["/pricing", "3 plans"], ["/customers", "2 case studies"], ["/blog", "11 posts"], ["/docs/alerts", "alerting rules"], ["/about", "team of 14, Nairobi"]];
const PAINS = ["Spoilage from doors left open", "No alert until the morning check", "Paper temperature logs for audits", "Insurance claims without evidence"];

export type OnboardingProps = {
  initialStep?: number; skipped?: number[]; crawl?: "idle" | "done"; connected?: boolean;
  /** Called just before leaving for /app ("Save and exit" or "Open Corral"). */
  onExit?: () => void;
};
export function Onboarding(p: OnboardingProps) { return <ToastProvider><Flow {...p} /></ToastProvider>; }

function Flow({ initialStep = 1, skipped: sk0 = [], crawl: crawl0 = "idle", connected = false, onExit }: OnboardingProps) {
  const router = useRouter();
  const exit = () => { onExit?.(); router.push("/app"); };
  const toast = useToast();
  const [step, setStep] = useState(initialStep);
  const [done, setDone] = useState<number[]>(() => Array.from({ length: initialStep - 1 }, (_, i) => i + 1).filter((n) => !sk0.includes(n)));
  const [skipped, setSkipped] = useState<number[]>(sk0);
  // step 1
  const [name, setName] = useState("ColdTrace");
  const [slug, setSlug] = useState("coldtrace");
  const [tz, setTz] = useState("nbo");
  const [team, setTeam] = useState("small");
  const [nameErr, setNameErr] = useState(false);
  // step 2
  const [product, setProduct] = useState(initialStep > 2 ? "ColdTrace Sensors" : "");
  const [pitch, setPitch] = useState(initialStep > 2 ? "Wireless temperature and door sensors that page the right person the minute a cold room drifts." : "");
  const [prodErr, setProdErr] = useState(false);
  // step 3
  const [site, setSite] = useState("coldtrace.io");
  const [read, setRead] = useState(crawl0 === "done" || (initialStep > 3 && !sk0.includes(3)) ? PAGES.length : 0);
  const [crawling, setCrawling] = useState(false);
  const [siteErr, setSiteErr] = useState(false);
  // step 4
  const [provider, setProvider] = useState("google");
  const [boxes, setBoxes] = useState<string[]>(connected || (initialStep > 4 && !sk0.includes(4)) ? ["tomas@coldtrace.io"] : []);
  const [connecting, setConnecting] = useState(false);
  const [cap, setCap] = useState("30");
  // step 5
  const [invites, setInvites] = useState<[string, string][]>([["amina@coldtrace.io", "member"], ["joseph@coldtrace.io", "admin"]]);
  const [domainJoin, setDomainJoin] = useState(true);

  useEffect(() => {
    if (!crawling) return;
    if (read >= PAGES.length) { const t = setTimeout(() => setCrawling(false), 0); return () => clearTimeout(t); }
    const t = setTimeout(() => setRead((r) => r + 1), 520);
    return () => clearTimeout(t);
  }, [crawling, read]);

  const finish = (n: number, how: "done" | "skip") => {
    setDone((d) => (how === "done" ? [...new Set([...d, n])] : d.filter((x) => x !== n)));
    setSkipped((s) => (how === "skip" ? [...new Set([...s, n])] : s.filter((x) => x !== n)));
    setStep(n + 1);
  };
  const next = () => {
    if (step === 1) { if (!name.trim()) { setNameErr(true); return; } finish(1, "done"); }
    else if (step === 2) { if (!product.trim()) { setProdErr(true); return; } finish(2, "done"); }
    else if (step === 5) { finish(5, "done"); toast({ tone: "success", children: `Invited ${invites.filter(([e]) => e).length} teammates`, meta: "links expire in 7 days" }); }
    else finish(step, "done");
  };
  const crawlDone = read >= PAGES.length;

  const body: Record<number, ReactNode> = {
    1: <>
      <FormField label="Workspace name" error={nameErr ? "Give the workspace a name. Most teams use the company name." : undefined}>
        <TextInput value={name} onChange={(e) => { setName(e.target.value); setNameErr(false); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} autoFocus />
      </FormField>
      <FormField label="Workspace URL" help="Teammates use this to find you. You can change it later."><TextInput prefix="corral.app/" value={slug} onChange={(e) => setSlug(e.target.value)} /></FormField>
      <FormField label="Time zone" help="Sequences send in each recipient’s morning; this sets your own reports and digests.">
        <Select value={tz} onChange={setTz} icon="globe" options={[{ value: "nbo", label: "Nairobi", meta: "UTC+3" }, { value: "lag", label: "Lagos", meta: "UTC+1" }, { value: "jnb", label: "Johannesburg", meta: "UTC+2" }, { value: "lon", label: "London", meta: "UTC+1" }, { value: "nyc", label: "New York", meta: "UTC−4" }]} />
      </FormField>
      <FormField label="Who will use Corral?"><RadioGroup variant="cards" value={team} onChange={setTeam} label="Team size" options={[
        { value: "solo", label: "Just me", description: "A founder doing outbound" }, { value: "small", label: "A small team", description: "2–10 people" }, { value: "sales", label: "A sales team", description: "SDRs and AEs" }]} /></FormField>
    </>,
    2: <>
      <FormField label="Product name" error={prodErr ? "Name the thing you sell. Corral scores every company against it." : undefined}>
        <TextInput value={product} placeholder="ColdTrace Sensors" onChange={(e) => { setProduct(e.target.value); setProdErr(false); }} autoFocus />
      </FormField>
      <FormField label="What it does, in one sentence" help="Plain words beat taglines. This is what the copilot quotes back to prospects.">
        <Textarea rows={2} value={pitch} placeholder="Wireless temperature and door sensors that page the right person the minute a cold room drifts." onChange={(e) => setPitch(e.target.value)} />
      </FormField>
      <FormField label="Pitch deck" optional help="PDF up to 20 MB. Corral pulls pains, proof points and objections from it.">
        <button type="button" className="s-drop"><Icon name="upload" /><span><span className="c-strong">Drop a PDF</span> or choose a file</span></button>
      </FormField>
      <p className="s-note">Selling more than one thing? Add the rest from Products after setup. Each product gets its own fit score.</p>
    </>,
    3: <>
      <FormField label="Your site" error={siteErr ? "We couldn’t reach that address. Check the spelling, or skip and add pages later." : undefined}
        help={!siteErr ? "Corral reads public pages only, up to 200, and never logs in." : undefined}>
        <div className="s-inline">
          <TextInput prefix="https://" value={site} onChange={(e) => { setSite(e.target.value); setSiteErr(false); }} disabled={crawling} />
          <Button size="lg" variant={crawlDone ? "default" : "ink"} disabled={crawling} onClick={() => { if (!/\.[a-z]{2,}$/i.test(site.trim())) { setSiteErr(true); return; } setRead(0); setCrawling(true); }}>
            {crawling ? <><Spinner />Reading</> : crawlDone ? <><Icon name="refresh" />Read again</> : "Read my site"}</Button>
        </div>
      </FormField>
      {(crawling || read > 0) && (
        <div className="s-crawl">
          <div className="s-crawl__top"><span className="c-strong">{crawlDone ? `Read ${site}` : `Reading ${site}`}</span><span className="c-faint c-num">{Math.round((read / PAGES.length) * 38)} of ~38 pages</span></div>
          <span className="s-meter" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < Math.round((read / PAGES.length) * 20) ? "on" : undefined} />)}</span>
          <Receipts>{PAGES.slice(0, read).map(([u, m], i) => <Receipt key={u} live={i === read - 1 && crawling} meta={m}>Read {u}</Receipt>)}</Receipts>
          {crawlDone && <div className="s-found"><span className="c-rail__label">Pains Corral will match against</span><div className="s-chips">{PAINS.map((x) => <span key={x} className="c-chip">{x}</span>)}</div>
            <span className="c-muted">Plus 3 objections and 2 proof points. Edit them any time in Knowledge base.</span></div>}
        </div>
      )}
    </>,
    4: <>
      <div className="s-providers"><RadioGroup variant="cards" value={provider} onChange={setProvider} label="Mailbox provider" options={[
        { value: "google", label: "Google Workspace", lead: <GoogleG size={14} />, description: "OAuth, no password" },
        { value: "ms", label: "Microsoft 365", lead: <MicrosoftMark size={13} />, description: "OAuth, no password" },
        { value: "smtp", label: "Other", lead: <Icon name="mail" />, description: "SMTP and IMAP" }]} /></div>
      <Button size="lg" className="s-wide" disabled={connecting} onClick={() => { setConnecting(true); setTimeout(() => { setConnecting(false); setBoxes((b) => b.includes("tomas@coldtrace.io") ? [...b, `sales${b.length}@coldtrace.io`] : [...b, "tomas@coldtrace.io"]); }, 900); }}>
        {connecting ? <><Spinner />Waiting for {provider === "ms" ? "Microsoft" : "Google"}…</> : <>{provider === "ms" ? <MicrosoftMark size={13} /> : provider === "smtp" ? <Icon name="mail" /> : <GoogleG size={14} />}{boxes.length ? "Connect another mailbox" : `Connect ${provider === "ms" ? "Microsoft 365" : provider === "smtp" ? "an SMTP mailbox" : "Google Workspace"}`}</>}
      </Button>
      {boxes.length > 0 && <>
        <div className="s-boxes">{boxes.map((b, i) => (
          <div key={b} className="s-box"><Avatar id="tomas" size={24} /><div className="c-person__txt"><span className="c-strong">{b}</span><span>Warming up · day {i ? 1 : 3} of 14 · 8 a day for now</span></div><span style={{ flex: 1 }} /><span className="s-warm"><i className="on" /><i className={i ? undefined : "on"} /><i /><i /><i /></span></div>))}
        </div>
        <Receipts><Receipt meta="coldtrace.io">SPF record found</Receipt><Receipt meta="selector google">DKIM signing verified</Receipt></Receipts>
        <Banner tone="caution" title="coldtrace.io has no DMARC record" action={<Button onClick={() => toast({ icon: "check", children: "DMARC record copied", meta: "add it as a TXT record" })}>Copy record</Button>}>Add one before sending more than 30 a day, or replies will land in spam.</Banner>
        <div className="s-row"><span><span className="c-strong">Daily cap per mailbox</span><br /><span className="c-muted">Corral adds 2–7 minutes of jitter between sends.</span></span><Segmented options={["20", "30", "35"]} value={cap} onChange={setCap} label="Daily cap per mailbox" /></div>
      </>}
    </>,
    5: <>
      <div className="s-invites">{invites.map(([e, r], i) => (
        <div key={i} className="s-invite">
          <TextInput value={e} placeholder="name@coldtrace.io" icon="mail" onChange={(ev) => setInvites((l) => l.map((x, j) => (j === i ? [ev.target.value, x[1]] : x)))} aria-label={`Teammate ${i + 1} email`} />
          <Select value={r} width={132} onChange={(v) => setInvites((l) => l.map((x, j) => (j === i ? [x[0], v] : x)))} options={[{ value: "admin", label: "Admin" }, { value: "member", label: "Member" }, { value: "viewer", label: "Viewer" }]} />
        </div>))}
        <button type="button" className="s-link s-add" onClick={() => setInvites((l) => [...l, ["", "member"]])}><Icon name="plus" size={12} />Add another</button>
      </div>
      <Switch checked={domainJoin} onChange={setDomainJoin} label="Anyone with an @coldtrace.io email can join" description="They join as Members. You can turn this off in Settings." />
      <Receipts><Receipt meta="Admins">Can connect mailboxes and change sending limits</Receipt><Receipt meta="Members">Can work the Unibox, build segments and enroll</Receipt></Receipts>
    </>,
  };

  const meta = STEPS[step - 1];
  const tzLabel = { nbo: "Nairobi", lag: "Lagos", jnb: "Johannesburg", lon: "London", nyc: "New York" }[tz];

  return (
    <div className="s-onb c-app">
      <aside className="s-onb__rail">
        <Link href="/" className="s-auth__brand"><Mark size={18} /><span>Corral</span></Link>
        <div className="s-onb__progress"><span className="c-strong">Set up {name || "your workspace"}</span><span className="c-faint c-num">{done.length} of 5 done{skipped.length ? ` · ${skipped.length} skipped` : ""}</span></div>
        <span className="s-meter s-meter--steps" aria-hidden="true">{STEPS.map((s) => <i key={s.n} className={cx(done.includes(s.n) && "on", skipped.includes(s.n) && "skip", step === s.n && "cur")} />)}</span>
        <ol className="s-steps">
          {STEPS.map((s) => {
            const st = step === s.n ? "current" : done.includes(s.n) ? "done" : skipped.includes(s.n) ? "skipped" : "todo";
            const sub = st === "done" ? ({ 1: `corral.app/${slug}`, 2: product, 3: `${site} · 38 pages`, 4: `${boxes.length} mailbox${boxes.length === 1 ? "" : "es"}`, 5: `${invites.length} invited` } as Record<number, string>)[s.n]
              : st === "skipped" ? "Skipped · finish any time" : "required" in s ? "Required" : "Optional";
            return (
              <li key={s.n}><button type="button" className={cx("s-step", `is-${st}`)} disabled={st === "todo"} onClick={() => setStep(s.n)} aria-current={st === "current" ? "step" : undefined}>
                <span className="s-step__n">{st === "done" ? <Icon name="check" size={12} /> : st === "skipped" ? <Icon name="arrow" size={11} /> : s.n}</span>
                <span className="s-step__t"><span>{s.short}</span><em>{sub}</em></span></button></li>
            );
          })}
        </ol>
        <div style={{ flex: 1 }} />
        <p className="s-onb__help">Stuck? <a href="#help">Book 15 minutes</a> with us, or press <span className="c-kbd">?</span></p>
      </aside>

      <main className="s-onb__main">
        <header className="s-onb__top">
          <span className="c-muted">{step <= 5 ? `Step ${step} of 5` : "All set"}</span>
          <span style={{ flex: 1 }} />
          <Button variant="quiet" onClick={exit}>Save and exit</Button>
        </header>
        {step <= 5 ? (
          <div className="s-onb__stage">
            <div className="s-onb__step" key={step}>
              <div className="s-onb__head"><h1>{meta.title}</h1><p>{({
                1: "A workspace holds your products, mailboxes and team. Most companies need one.",
                2: "Corral scores every company against something you sell. Start with the product you pitch most.",
                3: "Corral reads your public pages to learn your pains, proof and objections, so drafts sound like you.",
                4: "Sequences send from your own mailboxes, rotated and warmed, so replies come back to you.",
                5: "Teammates share the Unibox and segments. Mailboxes and sending limits stay with admins.",
              } as Record<number, string>)[step]}</p></div>
              <div className="s-onb__body">{body[step]}</div>
              <footer className="s-onb__foot">
                {step > 1 && <Button size="lg" onClick={() => setStep(step - 1)}><Icon name="back" />Back</Button>}
                <span style={{ flex: 1 }} />
                {!("required" in meta) && <Button size="lg" variant="quiet" onClick={() => finish(step, "skip")}>{step === 3 ? "Skip, add sources later" : step === 4 ? "Skip, connect later" : "Skip for now"}</Button>}
                <Button size="lg" variant="primary" onClick={next} disabled={(step === 3 && !crawlDone) || (step === 4 && boxes.length === 0) || crawling}>
                  {step === 5 ? `Send ${invites.filter(([e]) => e).length} invites` : "Continue"}</Button>
              </footer>
            </div>
            <Preview name={name} slug={slug} tz={tzLabel} product={product} pitch={pitch} read={read} site={site} boxes={boxes} invites={step > 5 || done.includes(5) ? invites.length : 0} skipped={skipped} />
          </div>
        ) : (
          <div className="s-onb__stage">
            <div className="s-onb__step s-onb__done">
              <div className="s-onb__head"><h1>{name} is ready</h1><p>{skipped.length ? "You can finish the skipped steps from Settings. Corral reminds you once, in the Unibox, not by email." : "Corral is reading your market now. The first scored companies land in about ten minutes."}</p></div>
              <div className="s-summary">
                {STEPS.map((s) => {
                  const sk = skipped.includes(s.n);
                  return <div key={s.n} className={cx("s-sum", sk && "is-skipped")}><span className="s-step__n">{sk ? <Icon name="alert" size={12} /> : <Icon name="check" size={12} />}</span>
                    <span className="s-step__t"><span>{s.short}</span><em>{sk ? ({ 3: "Drafts will be generic until Corral reads your site.", 4: "Sequences can’t send until a mailbox is connected.", 5: "Only you can see this workspace." } as Record<number, string>)[s.n] : "Done"}</em></span>
                    {sk && <Button onClick={() => setStep(s.n)}>{s.n === 4 ? "Connect" : "Finish"}</Button>}</div>;
                })}
              </div>
              <footer className="s-onb__foot"><span style={{ flex: 1 }} /><Button size="lg" variant="primary" onClick={exit}>Open Corral<Icon name="arrow" /></Button></footer>
            </div>
            <Preview name={name} slug={slug} tz={tzLabel} product={product} pitch={pitch} read={read} site={site} boxes={boxes} invites={done.includes(5) ? invites.length : 0} skipped={skipped} />
          </div>
        )}
      </main>
    </div>
  );
}

function Preview({ name, slug, tz, product, pitch, read, site, boxes, invites, skipped }: {
  name: string; slug: string; tz?: string; product: string; pitch: string; read: number; site: string; boxes: string[]; invites: number; skipped: number[];
}) {
  const row = (label: string, v: ReactNode, on: boolean, sk?: boolean) => (
    <div className={cx("s-know__row", !on && "is-empty", sk && "is-skipped")}><span className="c-rail__label">{label}</span><span>{on ? v : sk ? "Skipped" : "—"}</span></div>
  );
  return (
    <aside className="s-know c-card" aria-label="What Corral knows so far">
      <div className="s-know__band"><Image src="/corral/or/range-wide.jpg" alt="" fill sizes="360px" loading="eager" fetchPriority="high" className="s-know__img" /><span className="s-know__tile"><WorkspaceTile letter={(name[0] || "C").toUpperCase()} size={36} /></span></div>
      <div className="s-know__body">
        <div><span className="c-strong" style={{ fontSize: 16 }}>{name || "Your workspace"}</span><br /><span className="c-mono">corral.app/{slug}{tz ? ` · ${tz}` : ""}</span></div>
        {row("Product", <><span className="c-strong">{product}</span>{pitch && <span className="s-know__pitch">{pitch}</span>}</>, !!product)}
        {row("Site", <>{site} · {Math.round((read / PAGES.length) * 38)} pages, 4 pains</>, read > 0, skipped.includes(3))}
        {row("Mailboxes", <>{boxes.length} connected · warming</>, boxes.length > 0, skipped.includes(4))}
        {row("Team", <>You + {invites} invited</>, invites > 0, skipped.includes(5))}
        <span className="c-faint" style={{ fontSize: 12 }}>This is what the copilot uses. Nothing is sent until you enroll someone.</span>
      </div>
    </aside>
  );
}
