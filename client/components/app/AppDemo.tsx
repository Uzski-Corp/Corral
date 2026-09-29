"use client";
/* The M1 app, wired with sample data: shell + Unibox home, Companies, Segments, Contacts, ⌘K,
   an enroll dialog and toasts. Engineering: copy the composition, replace data.ts with real queries. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LEADS, THREADS, type Thread } from "./data";
import { Avatar, Button, FitBar, Kbd, Logo, Receipt, Receipts, Tag } from "./primitives";
import { Icon } from "./icons";
import { AppShell, APP_NAV, SAVED_SEGMENTS, type ShellAccountProp, type ViewId } from "./Shell";
import { ContextRail, ReadingPane, ThreadList } from "./Unibox";
import { SegmentTable } from "./SegmentTable";
import { CommandPalette, type Command } from "./CommandPalette";
import { Dialog, DropdownMenu, Tooltip } from "./Overlays";
import { Checkbox, DatePicker, FormField, RadioGroup, Select } from "./Form";
import { Tabs } from "./Tabs";
import { EmptyState, SkeletonTable } from "./States";
import { ToastProvider, useToast } from "./Toaster";
import { SessionUnavailable, type SessionUnavailableProps } from "./SessionUnavailable";
import { KnowledgeBase, PRODUCT } from "./kb";
import type { KbReviewState } from "@/lib/kb/state";
import { LeadsView } from "./leads";
import type { LeadsReviewState } from "@/lib/leads/state";
import { CREDITS, DiscoveryView } from "./discovery";
import type { DiscoveryReviewState } from "@/lib/discovery/state";

/** Fixed "today" for the demo so static renders are deterministic. Replace with new Date(). */
export const DEMO_TODAY = new Date(2026, 8, 29);
const addDays = (n: number) => new Date(DEMO_TODAY.getFullYear(), DEMO_TODAY.getMonth(), DEMO_TODAY.getDate() + n);

/* ------------------------------------------------------------ commands */
export type CommandHandlers = { go: (v: ViewId) => void; openThread: (id: string) => void; openCompany: (id: string) => void; act: (id: string, label: string) => void };
export function buildCommands(h: CommandHandlers) {
  const commands: Command[] = [
    ...APP_NAV.map((n): Command => ({ id: `go-${n.id}`, group: "Navigate", label: `Go to ${n.label}`, icon: n.icon, kbd: n.keys, keywords: n.label, run: () => h.go(n.id) })),
    { id: "a-segment", group: "Actions", label: "New segment from filters", icon: "layers", kbd: "N S", keywords: "create filter", run: () => h.act("segment", "New segment") },
    { id: "a-product", group: "Actions", label: "Add a product", icon: "box", keywords: "create offering pitch deck", run: () => h.act("product", "Add a product") },
    { id: "a-compose", group: "Actions", label: "Compose email", icon: "mail", kbd: "C", keywords: "write send new message", run: () => h.act("compose", "Compose") },
    { id: "a-mailbox", group: "Actions", label: "Connect a mailbox", icon: "send", keywords: "google microsoft smtp pool", run: () => h.act("mailbox", "Connect a mailbox") },
    { id: "a-invite", group: "Actions", label: "Invite teammates", icon: "users", keywords: "team member add", run: () => h.act("invite", "Invite teammates") },
    { id: "a-side", group: "Actions", label: "Toggle sidebar", icon: "panel", kbd: "[", keywords: "collapse expand", run: () => h.act("sidebar", "Toggle sidebar") },
    { id: "a-signout", group: "Actions", label: "Sign out", icon: "logout", keywords: "log out", run: () => h.act("signout", "Sign out") },
  ];
  const company = (id: string): Command => { const l = LEADS.find((x) => x.id === id)!;
    return { id: `co-${l.id}`, group: "Companies", label: l.company, keywords: `${l.domain} ${l.person}`, lead: <Logo company={l.company} />, sub: <span className="c-mono">{l.domain}</span>, meta: <FitBar value={l.fit} />, run: () => h.openCompany(l.id) }; };
  const person = (t: Thread): Command => ({ id: `pe-${t.id}`, group: "People", label: t.name, keywords: `${t.company} ${t.title}`, lead: <Avatar id={t.avatar} />, sub: `${t.title} · ${t.company}`, meta: <Tag status={t.status} />, run: () => h.openThread(t.id) });
  const recent: Command[] = [company("pwani"), company("kilima"), person(THREADS[0]), person(THREADS.find((t) => t.id === "sofia")!)].map((c) => ({ ...c, id: `r-${c.id}` }));
  const entities: Command[] = [...LEADS.map((l) => company(l.id)), ...THREADS.map(person),
    ...LEADS.filter((l) => !THREADS.some((t) => t.name === l.person)).map((l): Command => ({ id: `pl-${l.id}`, group: "People", label: l.person, keywords: `${l.company} ${l.title}`, lead: <Avatar id={l.avatar} />, sub: `${l.title} · ${l.company}`, meta: <Tag status={l.reply} />, run: () => h.openCompany(l.id) }))];
  const fallback = (q: string): Command => ({ id: "fb", group: "Search the market", label: `Find companies matching “${q}”`, icon: "globe", sub: "Corral reads their sites and scores them for ColdTrace Sensors", run: () => h.act("find", `Finding “${q}”`) });
  return { commands, recent, entities, fallback };
}

/* ------------------------------------------------------------ views */
const TABS = [{ id: "needs", label: "Needs you", count: 7 }, { id: "meetings", label: "Meetings", count: 1 }, { id: "snoozed", label: "Snoozed" }, { id: "all", label: "All", count: 214 }];

function UniboxView({ threads, active, setActive, tab, setTab, pane, setPane }: {
  threads: Thread[]; active: string; setActive: (id: string) => void; tab: string; setTab: (t: string) => void; pane: "list" | "read"; setPane: (p: "list" | "read") => void;
}) {
  const shown = tab === "meetings" ? threads.filter((t) => t.status === "Meeting booked") : tab === "snoozed" ? [] : threads;
  const t = shown.find((x) => x.id === active) ?? shown[0];
  return (
    <div className="c-view">
      <div className="c-subbar"><Tabs label="Unibox" tabs={TABS.map((x) => (x.id === "needs" ? { ...x, count: threads.length } : x))} value={tab} onChange={setTab} /><span className="c-subbar__keys"><Kbd>J</Kbd><Kbd>K</Kbd> move<Kbd>E</Kbd> archive<Kbd>⌘K</Kbd> jump</span></div>
      {shown.length === 0 ? (
        <EmptyState art="range" title="Nothing snoozed">Press <span className="c-kbd">H</span> on a thread to hide it until a date. It comes back to the top of Needs you on that morning.</EmptyState>
      ) : (
        <div className="c-ux" data-pane={pane}>
          <div className="c-ux__list"><ThreadList threads={shown} active={t.id} title={TABS.find((x) => x.id === tab)!.label} count={shown.length}
            onPick={(id) => { setActive(id); setPane("read"); }} /></div>
          <div className="c-ux__pane">
            <button type="button" className="c-ux__back" onClick={() => setPane("list")}><Icon name="back" />Needs you</button>
            <ReadingPane t={t} />
          </div>
          <div className="c-ux__rail"><ContextRail t={t} /></div>
        </div>
      )}
    </div>
  );
}

function ContactsView() {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 900); return () => clearTimeout(t); }, []);
  return (
    <div className="c-view">
      <div className="c-subbar"><Tabs label="Contacts" value="dm" tabs={[{ id: "dm", label: "Decision-makers", count: 412 }, { id: "all", label: "Everyone", count: "3,902" }]} /></div>
      <div className="c-view__scroll">{ready ? <SegmentTable selected={new Set()} /> : <SkeletonTable rows={9} label="Loading contacts" />}</div>
    </div>
  );
}

function PendingView({ id, onSearch }: { id: ViewId; onSearch: () => void }) {
  const n = APP_NAV.find((x) => x.id === id)!;
  return (
    <div className="c-view c-view--center">
      <EmptyState art="grass" title={`${n.label} is designed in a later milestone`} actions={<Button onClick={onSearch} kbd="⌘K">Jump somewhere else</Button>}>
        M1 covers the shell, navigation, sign-in, onboarding and the command menu. This screen keeps the shell and gets its own layout next.
      </EmptyState>
    </div>
  );
}


/* ------------------------------------------------------------ enroll dialog */
export function EnrollDialog({ open, onClose, count: n, includesReplied, onConfirm, inline }: {
  open: boolean; onClose: () => void; count: number; includesReplied?: boolean; onConfirm?: (message: string, meta?: string) => void; inline?: boolean;
}) {
  const [seq, setSeq] = useState("pilot");
  const [start, setStart] = useState<Date | null>(addDays(2));
  const [windowPref, setWindowPref] = useState("morning");
  const [skipReplied, setSkipReplied] = useState(true);
  const name = seq === "pilot" ? "Cold-room pilot" : seq === "proof" ? "Dairy proof drip" : "Re-engage Q4";
  return (
    <Dialog open={open} onClose={onClose} width={480} inline={inline}
      title={`Enroll ${n} ${n === 1 ? "company" : "companies"} in a sequence`}
      description="Corral writes to the verified decision-maker at each company and pauses the moment anyone replies."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onClose(); onConfirm?.(`Enrolled ${n} in ${name}`, start ? `first send ${start.toLocaleDateString("en-GB", { weekday: "short" })} 08:10` : undefined); }}>Enroll {n}</Button></>}>
      <FormField label="Sequence"><Select value={seq} onChange={setSeq} icon="seq" options={[
        { value: "pilot", label: "Cold-room pilot", meta: "4 steps · 12 days" }, { value: "proof", label: "Dairy proof drip", meta: "3 steps · 9 days" }, { value: "q4", label: "Re-engage Q4", meta: "2 steps · 5 days" }]} /></FormField>
      <FormField label="First send" help="Sends start at 08:10 in each recipient’s time zone, with 2–7 minutes of jitter.">
        <DatePicker value={start} onChange={setStart} today={DEMO_TODAY} min={DEMO_TODAY} quick={[["Tomorrow", addDays(1)], ["Thursday", addDays(2)], ["Next Monday", addDays(6)]]} /></FormField>
      <FormField label="Send window"><RadioGroup value={windowPref} onChange={setWindowPref} label="Send window" options={[
        { value: "morning", label: "Their morning", description: "08:00–11:00 local. Best reply rate for operations leads." },
        { value: "hours", label: "Business hours", description: "08:00–17:00 local, weekdays." }]} /></FormField>
      <Checkbox checked={skipReplied} onChange={setSkipReplied} label="Skip anyone who replied in the last 30 days"
        description={includesReplied ? "Brian Kamau (Pwani Fresh) replied 5h ago and would be skipped." : "No one in this selection has replied yet."} />
      <Receipts><Receipt meta="verified today">{n} decision-makers found, 0 catch-all</Receipt><Receipt meta="pool">Rotates across 6 warm mailboxes</Receipt></Receipts>
    </Dialog>
  );
}

/* ------------------------------------------------------------ host */
export type AppDemoProps = {
  initialView?: ViewId; cmdk?: boolean; collapsed?: boolean; drawer?: boolean; dialog?: boolean; frame?: "viewport" | "contained"; hotkeys?: boolean; className?: string;
  /** Signed-in person for the account menu and workspace switcher; omit for the sample person. */
  account?: ShellAccountProp;
  /** Ends the session. Resolves `{ ok: false }` when it could not, and the shell shows an error toast. */
  onSignOut?: () => Promise<{ ok: boolean }>;
  /** The session check failed (API down): the shell stays up and the body becomes <SessionUnavailable>. */
  sessionError?: SessionUnavailableProps;
  /** Knowledge-base review state (M2): /app?view=knowledge&state=… */
  kb?: KbReviewState;
  /** Lead table / segment review state (M3): /app?view=companies&state=… or view=segments&state=… */
  leads?: LeadsReviewState;
  /** Discovery review state (M4): /app?view=discovery&state=… */
  discovery?: DiscoveryReviewState;
};
export function AppDemo(p: AppDemoProps) { return <ToastProvider><Demo {...p} /></ToastProvider>; }

function Demo({ initialView = "unibox", cmdk = false, collapsed: c0 = false, drawer = false, dialog = false, frame = "viewport", hotkeys = true, className, account, onSignOut, sessionError, kb, leads, discovery }: AppDemoProps) {
  const router = useRouter();
  const toast = useToast();
  const signOut = useCallback(() => {
    if (!onSignOut) { router.push("/sign-in"); return; }
    // M1 follow-up 5c: say what state you're in, then the one thing to do. Stays up 10s.
    const attempt = () => { void onSignOut().then((r) => { if (!r.ok) toast({ tone: "error", children: "Sign-out didn’t go through. You’re still signed in.", duration: 10000, action: { label: "Try again", onClick: attempt } }); }); };
    attempt();
  }, [onSignOut, router, toast]);
  const [view, setView] = useState<ViewId>(initialView);
  const [segment, setSegment] = useState<string | undefined>(initialView === "segments" ? SAVED_SEGMENTS[0][0] : undefined);
  const [collapsed, setCollapsed] = useState(c0);
  const [palette, setPalette] = useState(cmdk);
  const [threads, setThreads] = useState(THREADS);
  const [active, setActive] = useState("brian");
  const [tab, setTab] = useState("needs");
  const [pane, setPane] = useState<"list" | "read">("list");
  const [enrollFor, setEnrollFor] = useState({ n: 3, replied: true });
  const [enroll, setEnroll] = useState(dialog);
  const [importOpen, setImportOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [enrollAll, setEnrollAll] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [kbAdd, setKbAdd] = useState(kb === "upload" || kb === "upload-errors");

  const go = useCallback((v: ViewId) => { setView(v); setSegment(v === "segments" ? SAVED_SEGMENTS[0][0] : undefined); setBuilderOpen(false); }, []);

  const archive = useCallback((id: string) => {
    const i = threads.findIndex((t) => t.id === id); if (i < 0) return;
    const gone = threads[i]; const rest = threads.filter((t) => t.id !== id);
    setThreads(rest); setActive(rest[Math.min(i, rest.length - 1)]?.id ?? "");
    toast({ tone: "success", icon: "archive", children: `Archived ${gone.name}`, action: { label: "Undo", onClick: () => { setThreads((l) => { const n = [...l]; n.splice(i, 0, gone); return n; }); setActive(gone.id); } } });
  }, [threads, toast]);

  const cmds = useMemo(() => buildCommands({
    go,
    openThread: (id) => { setView("unibox"); setTab("needs"); setActive(id); setPane("read"); },
    openCompany: (id) => { const t = THREADS.find((x) => x.company === LEADS.find((l) => l.id === id)?.company);
      if (t) { setView("unibox"); setTab("needs"); setActive(t.id); setPane("read"); } else setView("companies"); },
    act: (id, label) => {
      if (id === "sidebar") setCollapsed((c) => !c);
      else if (id === "signout") signOut();
      else if (id === "invite") router.push("/onboarding?step=5");
      else if (id === "mailbox") router.push("/onboarding?step=4");
      else if (id === "product") router.push("/onboarding?step=2");
      else if (id === "segment") { setView("companies"); toast({ icon: "layers", children: "Filters ready. Press S to save them as a segment." }); }
      else if (id === "find") { setView("discovery"); setSegment(undefined); setSetupOpen(true); }
      else toast({ icon: "mail", children: label, meta: "sample action" });
    },
  }), [go, router, toast, signOut]);

  // Global keys: ⌘K, G-sequences, J/K/E in the Unibox
  const gAt = useRef(0);
  useEffect(() => {
    if (!hotkeys) return;
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((o) => !o); return; }
      const t = e.target as HTMLElement;
      if (palette || enroll || kbAdd || importOpen || setupOpen || t.closest("input, textarea, [contenteditable], [role=dialog], [role=menu], [role=listbox]:not(.c-threads)")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (Date.now() - gAt.current < 900) {
        const n = APP_NAV.find((x) => x.keys === `G ${key === "," ? "," : key.toUpperCase()}`);
        gAt.current = 0; if (n) { go(n.id); return; }
      }
      if (key === "g") { gAt.current = Date.now(); return; }
      if (view === "unibox" && tab !== "snoozed") {
        const list = tab === "meetings" ? threads.filter((x) => x.status === "Meeting booked") : threads;
        const i = list.findIndex((x) => x.id === active);
        if (key === "j" || key === "k") { e.preventDefault(); setActive(list[(i + (key === "j" ? 1 : list.length - 1)) % list.length].id); }
        if (key === "e" && active) archive(active);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hotkeys, palette, enroll, kbAdd, importOpen, setupOpen, view, tab, threads, active, go, archive]);

  const label = APP_NAV.find((n) => n.id === view)!.label;
  const ws = typeof account === "object" ? account.workspace : account === undefined ? "ColdTrace" : "Corral";
  const crumbs = view === "unibox" ? [ws, "Unibox", TABS.find((x) => x.id === tab)!.label]
    : view === "knowledge" ? [ws, "Knowledge base", PRODUCT.name]
    : segment ? [ws, "Segments", segment] : [ws, label];
  const table = view === "companies" || view === "segments";
  const findCompanies = () => { go("discovery"); setSetupOpen(true); };
  const actions = view === "unibox" ? <>
      <DropdownMenu align="end" width={240} label="Product" items={[{ heading: "Replies about" }, { label: "All products", checked: true }, { label: "ColdTrace Sensors", meta: "11" }, { label: "ColdTrace Gateway", meta: "1" }]}
        trigger={(tp) => <button type="button" className="c-btn c-btn--quiet" {...tp}><Icon name="filter" />All products<Icon name="down" size={12} /></button>} />
      <Tooltip label="Archive thread" kbd="E" side="bottom"><button type="button" className="c-iconbtn" aria-label="Archive thread" onClick={() => archive(active)}><Icon name="archive" /></button></Tooltip>
      <Button kbd="C" onClick={() => toast({ icon: "mail", children: "Compose", meta: "sample action" })}>Compose</Button>
    </>
    : view === "knowledge" ? <>
      <DropdownMenu align="end" width={240} label="Product" items={[{ heading: "Knowledge for" }, { label: "ColdTrace Sensors", checked: true, meta: "12 sources" }, { label: "ColdTrace Gateway", meta: "4 sources", onSelect: () => toast({ icon: "book", children: "ColdTrace Gateway", meta: "sample action" }) }]}
        trigger={(tp) => <button type="button" className="c-btn c-btn--quiet k-prodbtn" {...tp}><Icon name="box" />ColdTrace Sensors<Icon name="down" size={12} /></button>} />
      <Button variant="primary" onClick={() => setKbAdd(true)}><Icon name="plus" />Add sources</Button>
    </>
    : view === "companies" ? <><Button onClick={() => setImportOpen(true)}><Icon name="upload" />Import CSV</Button><Button variant="primary" onClick={findCompanies}><Icon name="globe" />Find companies</Button></>
    : view === "discovery" ? <><span className="d-credits"><span className="c-num c-strong">{CREDITS.left.toLocaleString("en-US")}</span> credits left this month</span>{discovery !== "empty" && <Button variant="primary" onClick={() => setSetupOpen(true)}><Icon name="plus" />New run</Button>}</>
    : view === "segments" ? <><Button onClick={() => toast({ icon: "upload", children: `Exporting ${segment}`, meta: "CSV lands in your downloads" })}>Export</Button><Button variant="primary" onClick={() => setEnrollAll((x) => x + 1)}><Icon name="seq" />Enroll segment</Button></>
    : null;

  return (
    <>
      <AppShell frame={frame} className={className} active={view} onNavigate={go} crumbs={sessionError ? [ws, "Not connected"] : crumbs} actions={sessionError ? null : actions} collapsed={collapsed} onCollapsedChange={setCollapsed}
        onSearch={() => setPalette(true)} segment={segment} onSegment={(s) => { setView("segments"); setSegment(s); setBuilderOpen(false); }} defaultDrawer={drawer} hotkeys={hotkeys} account={account} onSignOut={signOut}>
        {sessionError ? <SessionUnavailable {...sessionError} /> : <>
        {view === "unibox" && <UniboxView threads={threads} active={active} setActive={setActive} tab={tab} setTab={setTab} pane={pane} setPane={setPane} />}
        {table && <LeadsView key={`${view}-${segment ?? ""}`} view={view} state={leads} segment={segment} importOpen={importOpen} onImportOpenChange={setImportOpen}
          builderOpen={builderOpen} onBuilderOpenChange={setBuilderOpen} enrollAllSignal={enrollAll} onFind={findCompanies} onEnroll={(n, replied) => { setEnrollFor({ n, replied }); setEnroll(true); }} />}
        {view === "discovery" && <DiscoveryView key={discovery ?? "live"} state={discovery} setupOpen={setupOpen} onSetupOpenChange={setSetupOpen} onOpenCompanies={() => go("companies")} />}
        {view === "contacts" && <ContactsView />}
        {view === "knowledge" && <KnowledgeBase state={kb} addOpen={kbAdd} onAddOpenChange={setKbAdd} contained={frame === "contained"} />}
        {!table && view !== "unibox" && view !== "contacts" && view !== "knowledge" && view !== "discovery" && <PendingView id={view} onSearch={() => setPalette(true)} />}
        </>}
      </AppShell>
      {palette && <CommandPalette open onClose={() => setPalette(false)} {...cmds} />}
      <EnrollDialog open={enroll} onClose={() => setEnroll(false)} count={enrollFor.n} includesReplied={enrollFor.replied} onConfirm={(msg, meta) => toast({ tone: "success", children: msg, meta, action: { label: "Undo", onClick: () => toast({ children: "Enrollment undone" }) } })} />
    </>
  );
}
