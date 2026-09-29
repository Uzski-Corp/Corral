"use client";
/* /styleguide — M1 system pieces, each shown live in the place it is used. */
import { useState, type ReactNode } from "react";
import {
  AppDemo, Avatar, Banner, Button, Calendar, Checkbox, CommandPalette, DatePicker, DEMO_TODAY, DropdownMenu, EmptyState, EnrollDialog, ErrorState,
  FormField, Icon, Logo, RadioGroup, Segmented, Select, SegmentTable, SkeletonTable, SkeletonThreads, Spinner, Switch, Tabs, TextInput, Textarea,
  Toast, ToastProvider, Tooltip, WorkspaceSwitcher, buildCommands, useToast,
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
        <Banner tone="error" title="That link has expired">Sign-in links work once and last 15 minutes.</Banner>
        <Banner tone="success" title="Mailbox connected">tomas@coldtrace.io starts warming today.</Banner>
      </div>
    </div>
  );
}
