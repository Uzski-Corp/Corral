"use client";
/* /styleguide — M1 system pieces, each shown live in the place it is used. */
import { useId, useState, type ReactNode } from "react";
import { CodeInput } from "@/components/app/screens/CodeInput";
import {
  AppDemo, Avatar, Banner, Button, Calendar, Checkbox, CommandPalette, DatePicker, DEMO_TODAY, DropdownMenu, EmptyState, EnrollDialog, ErrorState,
  FormField, Icon, Logo, RadioGroup, Segmented, Select, SegmentTable, SkeletonTable, SkeletonThreads, Spinner, Switch, Tabs, TextInput, Textarea,
  Toast, ToastProvider, Tooltip, WorkspaceSwitcher, buildCommands, useToast, AccountRow, Monogram, Tag,
} from "@/components/app";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};
const CMDS = buildCommands({ go: noop, openThread: noop, openCompany: noop, act: noop });

export function ShellDemo() {
  return (
    <div className="sg-shells">
      <div className="sg-shell sg-shell--full"><AppDemo frame="contained" hotkeys={false} /></div>
      <div><Label>collapsed · the panel icon or [ toggles · hover an icon for its name</Label><div className="sg-shell sg-shell--collapsed"><AppDemo frame="contained" hotkeys={false} collapsed initialView="companies" /></div></div>
      <div className="sg-shells__row">
        <div><Label>390px · top bar + drawer</Label><div className="sg-shell sg-shell--phone"><AppDemo frame="contained" hotkeys={false} drawer /></div></div>
        <div><Label>390px · list</Label><div className="sg-shell sg-shell--phone"><AppDemo frame="contained" hotkeys={false} /></div></div>
      </div>
    </div>
  );
}

export function CmdkDemo() {
  const p = { open: true, onClose: noop, inline: true, ...CMDS };
  return (
    <div className="sg-cmdk">
      <div><Label>open · nothing typed</Label><CommandPalette {...p} /></div>
      <div><Label>typing “kil” · keyboard highlight on the first match</Label><CommandPalette {...p} defaultQuery="kil" /></div>
      <div><Label>loading · local commands instant, search skeleton</Label><CommandPalette {...p} defaultQuery="mara" forceLoading /></div>
      <div><Label>no results · one fallback, never a dead end</Label><CommandPalette {...p} defaultQuery="solar farms" /></div>
    </div>
  );
}

export function OverlayDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className="sg-overlays">
      <div>
        <Label>dialog · one decision, one blue button</Label>
        <div className="sg-dialogstage c-app">
          <div className="sg-dialogstage__bg" aria-hidden="true"><SegmentTable selected={new Set(["kilima", "pwani", "savanna"])} limit={9} /></div>
          <EnrollDialog inline open={open} onClose={() => setOpen(false)} count={3} includesReplied />
          {!open && <div className="sg-reopen"><Button variant="primary" onClick={() => setOpen(true)}>Enroll 3 in sequence</Button></div>}
        </div>
      </div>
      <div className="sg-overlays__col">
        <div className="sg-card sg-menucard"><Label>dropdown · workspace switcher, open</Label><div className="c-side c-side--app sg-miniside"><WorkspaceSwitcher defaultOpen /></div></div>
        <div className="sg-card"><Label>dropdown · row actions</Label>
          <div className="sg-rowmenu">
            <Logo company="Pwani Fresh" /><span className="c-strong">Pwani Fresh</span><span style={{ flex: 1 }} />
            <DropdownMenu align="end" width={228} label="Row actions" items={[
              { label: "Open in Unibox", icon: "inbox", kbd: "↵" }, { label: "Enroll in sequence", icon: "seq", kbd: "E" }, { label: "Copy domain", icon: "link" }, "separator",
              { label: "Mark as disqualified", icon: "x", danger: true }]}
              trigger={(tp) => <button type="button" className="c-iconbtn" aria-label="Row actions" {...tp}><Icon name="more" /></button>} />
          </div>
          <p className="sg-hint">Click ··· to open. ↑↓ move, ↵ picks, Esc closes.</p>
        </div>
        <div className="sg-card"><Label>tooltip · icon-only controls get a name and a key</Label>
          <div className="sg-tips">
            <Tooltip label="Collapse sidebar" kbd="[" open side="right"><button type="button" className="c-iconbtn" aria-label="Collapse sidebar"><Icon name="panel" /></button></Tooltip>
            <Tooltip label="Archive thread" kbd="E"><button type="button" className="c-iconbtn" aria-label="Archive thread"><Icon name="archive" /></button></Tooltip>
            <Tooltip label="Notifications"><button type="button" className="c-iconbtn" aria-label="Notifications"><Icon name="bell" /><span className="c-iconbtn__dot" /></button></Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FormDemo() {
  const [tz, setTz] = useState("nbo");
  const [start, setStart] = useState<Date | null>(new Date(2026, 9, 1));
  const [win, setWin] = useState("morning");
  const [boxes, setBoxes] = useState({ tomas: true, sales: true, ops: false });
  const [pause, setPause] = useState(true);
  const [track, setTrack] = useState(false);
  const [cap, setCap] = useState("30");
  const [sig, setSig] = useState("Tomás Ibarra\nFounder, ColdTrace Sensors");
  const all = Object.values(boxes);
  return (
    <div className="sg-forms">
      <div className="c-win c-win--flat sg-settings c-app">
        <div className="sg-form__head"><span className="c-strong" style={{ fontSize: 16 }}>Sending</span><span className="c-muted">Settings · ColdTrace</span></div>
        <div className="sg-form__body">
          <FormField label="Your time zone" help="Digests and reports use this. Sends always follow the recipient’s clock.">
            <Select value={tz} onChange={setTz} icon="globe" options={[{ value: "nbo", label: "Nairobi", meta: "UTC+3" }, { value: "lag", label: "Lagos", meta: "UTC+1" }, { value: "lon", label: "London", meta: "UTC+1" }]} /></FormField>
          <FormField label="Pause all sequences until" optional><DatePicker value={start} onChange={setStart} today={DEMO_TODAY} min={DEMO_TODAY} placeholder="Not paused" /></FormField>
          <FormField label="Send window"><RadioGroup value={win} onChange={setWin} label="Send window" options={[
            { value: "morning", label: "Recipient’s morning", description: "08:00–11:00 local" }, { value: "hours", label: "Business hours", description: "08:00–17:00 local" }, { value: "any", label: "Any time", description: "Not recommended for cold email", disabled: true }]} /></FormField>
          <FormField label="Mailboxes in rotation">
            <div className="sg-checks">
              <Checkbox checked={all.every(Boolean)} indeterminate={!all.every(Boolean) && all.some(Boolean)} onChange={(v) => setBoxes({ tomas: v, sales: v, ops: v })} label="All mailboxes" description={`${all.filter(Boolean).length} of 3 sending`} />
              <div className="sg-checks__kids">
                <Checkbox checked={boxes.tomas} onChange={(v) => setBoxes({ ...boxes, tomas: v })} label="tomas@coldtrace.io" description="Warm · 30 a day" />
                <Checkbox checked={boxes.sales} onChange={(v) => setBoxes({ ...boxes, sales: v })} label="sales@coldtrace.io" description="Warm · 30 a day" />
                <Checkbox checked={boxes.ops} onChange={(v) => setBoxes({ ...boxes, ops: v })} label="ops@coldtrace.io" description="Warming · day 3 of 14" />
              </div>
            </div>
          </FormField>
          <div className="sg-form__row"><span>Daily cap per mailbox</span><Segmented options={["20", "30", "35"]} value={cap} onChange={setCap} label="Daily cap" /></div>
          <Switch checked={pause} onChange={setPause} label="Pause a sequence on any reply" description="Including out-of-office. The Unibox decides what happens next." />
          <Switch checked={track} onChange={setTrack} label="Track opens" description="Off by default. Tracking pixels hurt deliverability for cold email." />
          <FormField label="Reply-to" error="Use an address on coldtrace.io so replies thread back into the Unibox."><TextInput value="tomas@gmail.com" readOnly icon="mail" /></FormField>
          <FormField label="Signature" help="Plain text. Corral never adds a logo or links to cold email."><Textarea rows={2} value={sig} onChange={(e) => setSig(e.target.value)} /></FormField>
        </div>
        <div className="sg-form__foot"><span className="c-faint">Saved 2 min ago</span><span style={{ flex: 1 }} /><Button>Discard</Button><Button variant="primary">Save changes</Button></div>
      </div>
      <div className="sg-forms__open">
        <div><Label>select · open</Label><div className="sg-openbox"><Select defaultOpen value="nbo" icon="globe" options={[{ value: "nbo", label: "Nairobi", meta: "UTC+3" }, { value: "lag", label: "Lagos", meta: "UTC+1" }, { value: "jnb", label: "Johannesburg", meta: "UTC+2" }, { value: "lon", label: "London", meta: "UTC+1" }]} /></div></div>
        <div><Label>date picker · quick picks, today outlined, past disabled</Label>
          <div className="c-menu sg-calcard"><Calendar value={new Date(2026, 9, 1)} onChange={noop} today={DEMO_TODAY} min={DEMO_TODAY} quick={[["Tomorrow", new Date(2026, 8, 30)], ["Thursday", new Date(2026, 9, 1)], ["Next Monday", new Date(2026, 9, 5)]]} /></div></div>
        <div><Label>states</Label><div className="sg-card sg-inputstates">
          <FormField label="Default"><TextInput placeholder="name@company.com" /></FormField>
          <FormField label="Disabled"><TextInput value="coldtrace.io" disabled readOnly /></FormField>
          <FormField label="With prefix"><TextInput prefix="corral.app/" defaultValue="coldtrace" /></FormField>
        </div></div>
      </div>
    </div>
  );
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="c-actions" style={{ flexWrap: "wrap" }}>
      <Button onClick={() => toast({ tone: "success", children: "Enrolled 3 in Cold-room pilot", meta: "first send Thu 08:10", action: { label: "Undo", onClick: noop } })}>Success with undo</Button>
      <Button onClick={() => toast({ icon: "cal", children: "Brian Kamau booked Thu 10:30", meta: "Cal.com" })}>Event</Button>
      <Button onClick={() => toast({ tone: "error", children: "Couldn’t send to sales@coldtrace.io", action: { label: "Retry", onClick: noop } })}>Error with retry</Button>
    </div>
  );
}
export function TabsToastDemo() {
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState("week");
  return (
    <div className="sg-tabsdemo">
      <div className="c-win c-win--flat sg-company c-app">
        <div className="sg-company__head"><Logo company="Kilima Dairies" /><span className="c-strong" style={{ fontSize: 16 }}>Kilima Dairies</span><span className="c-mono">kilima.co.ke</span><span style={{ flex: 1 }} />
          <Tabs variant="pill" label="Range" value={range} onChange={setRange} tabs={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} /></div>
        <div className="c-subbar"><Tabs label="Company" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "people", label: "People", count: 3 }, { id: "signals", label: "Signals", count: 2 }, { id: "emails", label: "Emails", count: 4 }, { id: "activity", label: "Activity" }]} /></div>
        <div className="sg-company__body">
          {tab === "people" ? ["wanjiru", "grace", "reza"].map((a, i) => <div key={a} className="c-person"><Avatar id={a} size={24} /><div className="c-person__txt"><span className="c-strong">{["Wanjiru Mwangi", "Grace Holloway", "Reza Santos"][i]}</span><span>{["Head of Supply Chain", "QA Lead", "Plant Manager"][i]}</span></div></div>)
            : tab === "overview" ? <p className="c-message" style={{ fontSize: 14, lineHeight: "22px" }}>Three cold rooms across Nakuru and Eldoret, dairy and yoghurt, no live alerting. Corral read 38 pages and matched every ColdTrace pain. Fit 94.</p>
            : <EmptyState compact icon="clock" title={`No ${tab} this ${range}`}>Try a longer range, or check Activity for everything Corral did here.</EmptyState>}
        </div>
      </div>
      <div className="sg-toasts">
        <Label>toasts · ink, one line, at most one action</Label>
        <Toast tone="success" action={{ label: "Undo", onClick: noop }} onClose={noop} meta="first send Thu 08:10">Enrolled 3 in Cold-room pilot</Toast>
        <Toast meta="Cal.com" onClose={noop}>Brian Kamau booked Thu 10:30</Toast>
        <Toast tone="error" action={{ label: "Retry", onClick: noop }} onClose={noop}>Couldn’t send to sales@coldtrace.io</Toast>
        <Toast tone="error" action={{ label: "Try again", onClick: noop }} onClose={noop}>Sign-out didn’t go through. You’re still signed in.</Toast>
        <Label>live · appear bottom-centre, 4s</Label>
        <ToastProvider><ToastButtons /></ToastProvider>
      </div>
    </div>
  );
}

export function StatesDemo() {
  const [retry, setRetry] = useState<"error" | "loading" | "done">("error");
  return (
    <div className="sg-statesgrid">
      <div className="c-win c-win--flat sg-statecard c-app"><div className="sg-statecard__bar"><span className="c-strong">Unibox</span><span className="c-sep">/</span>Snoozed</div>
        <EmptyState art="range" title="Nothing snoozed">Press <span className="c-kbd">H</span> on a thread to hide it until a date. It comes back to the top of Needs you that morning.</EmptyState></div>
      <div className="c-win c-win--flat sg-statecard c-app"><div className="sg-statecard__bar"><span className="c-strong">Products</span></div>
        <EmptyState icon="box" title="No products yet" actions={<><Button variant="ink" size="lg">Add your first product</Button><Button size="lg">Import a deck</Button></>}>Corral scores companies against something you sell. Start with one.</EmptyState></div>
      <div className="c-win c-win--flat sg-statecard c-app"><div className="sg-statecard__bar"><span className="c-strong">Knowledge base</span><span className="c-sep">/</span>kivucoffee.rw</div>
        {retry === "error" ? <ErrorState title="Couldn’t read kivucoffee.rw" detail="HTTP 503 · 3 tries · last at 20:14 EAT"
          actions={<><Button onClick={() => { setRetry("loading"); setTimeout(() => setRetry("done"), 1200); }}><Icon name="refresh" />Try again</Button><Button variant="quiet">Add pages by hand</Button></>}>
          Their site was down when we tried. Nothing was lost; the fit score stays at 64 until we can read it again.</ErrorState>
          : retry === "loading" ? <EmptyState icon="globe" title={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Spinner />Reading kivucoffee.rw</span>}>Usually under a minute.</EmptyState>
          : <EmptyState icon="check" title="Read 22 pages" actions={<Button variant="quiet" onClick={() => setRetry("error")}>Reset demo</Button>}>Fit updated: 64 → 71.</EmptyState>}
      </div>
      <div className="c-win c-win--flat sg-statecard sg-statecard--wide c-app"><div className="sg-statecard__bar"><span className="c-strong">Companies</span><span className="c-sep">/</span>loading · same 40px rows, no layout jump</div><SkeletonTable rows={5} /></div>
      <div className="c-win c-win--flat sg-statecard c-app"><div className="sg-statecard__bar"><span className="c-strong">Unibox</span><span className="c-sep">/</span>loading</div><SkeletonThreads rows={3} /></div>
      <div className="sg-banners">
        <Label>banners · top of a form or panel</Label>
        <Banner tone="info" title="Corral is reading 1,284 companies">Scores land in Companies as they finish. About 10 minutes.</Banner>
        <Banner tone="caution" title="coldtrace.io has no DMARC record" action={<Button>Copy record</Button>}>Add one before sending more than 30 a day.</Banner>
        <Banner tone="error" title="That sign-in didn’t finish">It may have timed out or been opened twice. Start again below.</Banner>
        <Banner tone="success" title="Mailbox connected">tomas@coldtrace.io starts warming today.</Banner>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ M1 follow-ups */
type Step = { token: string; was: string; now: string; use: string; white: string; worst: string };
const LADDER: Step[] = [
  { token: "--color-text-secondary", was: "#5D5D5D", now: "#4F4F4F", use: "meta that still matters", white: "6.58 → 8.19", worst: "6.86 on #EBEBE9" },
  { token: "--color-text-tertiary", was: "#7F7F7F", now: "#5F5F5F", use: "labels, columns, receipts", white: "4.00 → 6.39", worst: "5.35 on #EBEBE9" },
  { token: "--color-text-quaternary", was: "#A1A1A1", now: "#6A6A6A", use: "timings, domains, placeholders", white: "2.58 → 5.41", worst: "4.53 on #EBEBE9" },
  { token: "--color-text-disabled", was: "(new)", now: "#A1A1A1", use: "disabled controls only, exempt", white: "2.58", worst: "never readable text" },
];
const TAGS: [string, string, string, string, string][] = [
  ["positive", "Interested", "#059669", "#047857", "3.58 → 5.21"],
  ["caution", "Objection", "#C26A05", "#A35A04", "3.78 → 5.04"],
  ["negative", "Bounced", "#E11D48", "#BE123C", "4.28 → 5.72"],
  ["info", "Meeting booked", "#2563EB", "#2563EB", "4.75 (kept)"],
  ["referral", "Referral", "#7C3AED", "#7C3AED", "5.20 (kept)"],
  ["neutral", "Contacted", "#57534E", "#57534E", "6.99 (kept)"],
];

export function ContrastDemo() {
  return (
    <div className="sg-contrast">
      <div className="sg-card"><Label>text ladder · 12px sample on white and on active nav (#EBEBE9)</Label>
        <table className="sg-ctable"><thead><tr><th>Token</th><th>Was</th><th>Now</th><th>On white</th><th>Worst real surface</th><th>Sample</th></tr></thead>
          <tbody>{LADDER.map((r) => (
            <tr key={r.token}><td className="c-mono">{r.token}</td><td className="c-mono"><i style={{ background: r.was.startsWith("#") ? r.was : "transparent" }} />{r.was}</td>
              <td className="c-mono"><i style={{ background: r.now }} />{r.now}</td><td className="c-num">{r.white}</td><td className="c-num">{r.worst}</td>
              <td>{r.was === "(new)" ? <Button size="sm" disabled>Disabled button</Button> : <><span style={{ color: r.now, fontSize: 12 }}>{r.use}</span><span className="sg-ctable__dark" style={{ color: r.now, fontSize: 12 }}>on #EBEBE9</span></>}</td></tr>))}
          </tbody></table></div>
      <div className="sg-card"><Label>status tags · 600 text on its own 50 fill</Label>
        <table className="sg-ctable"><thead><tr><th>Triple</th><th>Tag</th><th>600 was</th><th>600 now</th><th>Ratio</th></tr></thead>
          <tbody>{TAGS.map(([k, tag, was, now, r]) => (
            <tr key={k}><td className="c-mono">{k}</td><td><Tag status={tag as Parameters<typeof Tag>[0]["status"]} /></td><td className="c-mono"><i style={{ background: was }} />{was}</td><td className="c-mono"><i style={{ background: now }} />{now}</td><td className="c-num">{r}</td></tr>))}
          </tbody></table></div>
      <div className="sg-card sg-contrast__ui"><Label>controls · 3:1 against the surface (WCAG 1.4.11)</Label>
        <div className="sg-contrast__row"><Checkbox checked={false} onChange={noop} label="Unchecked" /><Checkbox checked onChange={noop} label="Checked" /></div>
        <div className="sg-contrast__row"><RadioGroup value="a" onChange={noop} label="Radio" options={[{ value: "a", label: "Selected" }, { value: "b", label: "Not selected" }]} /></div>
        <div className="sg-contrast__row"><Switch checked={false} onChange={noop} label="Switch off" /><Switch checked onChange={noop} label="Switch on" /></div>
        <p className="sg-contrast__note"><span className="c-mono">--color-border-control #8F8F8C</span> 3.24:1 on white for checkbox, radio and switch-off. Focus is a solid 2px <span className="c-mono">--color-action</span> outline (5.73:1); the 28% ring stays only as a halo around focused inputs.</p>
      </div>
      <div className="sg-card sg-contrast__ui"><Label>inline links · underline, never colour alone</Label>
        <p className="s-onb__help">Stuck? <a href="#help">Book 15 minutes</a> with us, or press <span className="c-kbd">?</span></p>
        <p className="s-auth__small">By continuing you agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
        <p className="sg-contrast__note">Any <span className="c-mono">&lt;a&gt;</span> or <span className="c-mono">.s-link</span> inside running text gets a 1px underline at 45% of its colour, full on hover. Add <span className="c-mono">.c-link</span> anywhere else a link sits in text. Standalone links (nav, footers, buttons) don’t need it.</p>
      </div>
    </div>
  );
}

export function AccountStatesDemo() {
  return (
    <div className="sg-accounts c-side c-side--app">
      <div><Label>sample person (review)</Label><AccountRow /></div>
      <div><Label>signed in, picture</Label><AccountRow account={{ name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "Owner", avatarUrl: "/corral/app/av-wanjiru.jpg", workspace: "Kilima Dairies" }} /></div>
      <div><Label>signed in, no picture · monogram</Label><AccountRow account={{ name: "Amani Odhiambo", email: "amani@coldtrace.io", role: "Member", avatarUrl: null, workspace: "ColdTrace" }} /></div>
      <div><Label>/me loading · Skeleton primitive</Label><AccountRow account="loading" /></div>
      <div><Label>session check failed</Label><AccountRow account="unavailable" /></div>
      <div><Label>monogram sizes</Label><span className="sg-monos">{([48, 36, 28, 24, 20] as const).map((z, i) => <Monogram key={z} size={z} name={["Amani Odhiambo", "Brian Kamau", "Njeri", "Grace Holloway", "reza@kivu.rw"][i]} email={i === 4 ? "reza@kivu.rw" : undefined} />)}</span></div>
    </div>
  );
}

export function SessionErrorDemo() {
  return (
    <div className="sg-shells">
      <div className="sg-shell sg-shell--full"><AppDemo frame="contained" hotkeys={false} account="unavailable" sessionError={{ checkedAt: "23:14", onRetry: () => new Promise<boolean>((r) => setTimeout(() => r(false), 900)) }} /></div>
      <div className="sg-shells__row">
        <div><Label>390px</Label><div className="sg-shell sg-shell--phone"><AppDemo frame="contained" hotkeys={false} account="unavailable" sessionError={{ checkedAt: "23:14", autoRetrySeconds: 0 }} /></div></div>
        <div className="sg-card"><Label>anatomy</Label><ul className="sg-anatomy">
          <li>The shell stays: rail, top bar and nav keep the product recognisable. Only the body is replaced.</li>
          <li>Headline says what failed in plain words. The sentence says nothing is lost and you’re still signed in.</li>
          <li>One blue <b>Try again</b>. Status page is secondary. Automatic retry every 30s, shown as a countdown.</li>
          <li>The failing request in mono, last, for support. Account row switches from skeleton to a static “Not connected”.</li>
          <li>401 never shows this: it goes to sign-in. Only 502/503/504, timeouts and network errors do.</li></ul></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ENG-80 · sign-in code */
function CodeCell({ label, value = "", invalid, disabled, busy, locked, hint, error, caution }: { label: string; value?: string; invalid?: boolean; disabled?: boolean; busy?: boolean; locked?: boolean; hint?: ReactNode; error?: ReactNode; caution?: ReactNode }) {
  const id = useId();
  const [v, setV] = useState(value);
  return (
    <div className="sg-code c-app">
      <Label>{label}</Label>
      <div className="s-code__form">
        <div className="s-code__top"><label htmlFor={id}>Sign-in code</label>{busy && <span className="s-code__busy"><Spinner size={12} />Checking…</span>}</div>
        <CodeInput id={id} value={v} onChange={setV} invalid={invalid} disabled={disabled} busy={busy} locked={locked} describedBy={`${id}-m`} />
        <span id={`${id}-m`} className={invalid ? "c-field__hint is-error" : caution ? "c-field__hint is-caution" : "c-field__hint"}>{error ? <><Icon name="alert" size={12} />{error}</>
          : caution ? <><Icon name="clock" size={12} />{caution}</> : hint ?? "From Corral. Paste it whole, or type it."}</span>
      </div>
    </div>
  );
}

const CODE_URLS: [string, string][] = [
  ["sent", "code entry, resend cooldown 0:20"], ["code-verifying", "sixth digit landed, checking"], ["code-wrong", "inline error, digits kept, selected"],
  ["code-expired", "field locked, primary becomes Send a new code"], ["code-resent", "success banner, field cleared"],
  ["resend-limited", "3 a minute, countdown from Retry-After"], ["verify-limited", "too many tries, field locked with its digits, countdown"],
  ["code-failed", "verify refused, field locked, primary becomes Send a new code"], ["change-email", "form, old address selected, note"],
];

export function CodeStatesDemo() {
  return (
    <div className="sg-codes">
      <div className="sg-codes__grid">
        <CodeCell label="empty · click to focus" />
        <CodeCell label="typing" value="482" />
        <CodeCell label="verifying · read-only" value="482913" busy />
        <CodeCell label="wrong · kept, retry" value="482193" invalid error="That code isn’t right. Check the newest email from Corral and try again." />
        <CodeCell label="expired · locked" value="639204" invalid disabled error="That code has expired. Codes last 10 minutes." />
        <CodeCell label="too many tries · locked, countdown" value="482193" locked caution={<>Too many tries for now. You can try again in <span className="c-num">0:42</span>.</>} />
        <CodeCell label="failed · locked, send a new code" value="482913" invalid disabled error="We couldn’t sign you in with that code. Send a new code and try again." />
        <div className="sg-code c-app"><Label>banners on the code screen</Label>
          <Banner tone="success" title="New code sent">Use the code in the newest email. It expires in 10 minutes.</Banner>
          <Banner tone="caution" icon="clock" title="Too many codes asked for">You can ask for 3 codes a minute. The last code we sent still works, or send another in <span className="c-strong c-num">0:41</span>.</Banner>
        </div>
      </div>
      <div className="sg-card"><Label>reach every state · /sign-in?state=</Label>
        <ul className="sg-anatomy">{CODE_URLS.map(([s, d]) => <li key={s}><a className="c-link" href={`/sign-in?state=${s}`}><code>{s}</code></a> · {d}</li>)}</ul>
        <p className="sg-faint" style={{ margin: "10px 0 0", fontSize: 12.5 }}>Review flow without an API: <code>123456</code> signs in, <code>111111</code> is expired, anything else is wrong. The 4th send inside a minute is rate-limited.</p>
      </div>
    </div>
  );
}
