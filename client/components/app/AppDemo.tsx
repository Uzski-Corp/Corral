"use client";
/* The M1 app, wired with sample data: shell + Unibox home, Companies, Segments, Contacts, ⌘K,
   an enroll dialog and toasts. Engineering: copy the composition, replace data.ts with real queries. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LEADS, THREADS, type Lead, type Thread } from "./data";
import { Avatar, Button, FitBar, Logo, Receipt, Receipts, Tag } from "./primitives";
import { Icon } from "./icons";
import { AppShell, APP_NAV, SAVED_SEGMENTS, type ShellAccountProp, type ViewId } from "./Shell";
import { SegmentTable } from "./SegmentTable";
import { CommandPalette, type Command } from "./CommandPalette";
import { Dialog, DropdownMenu, Tooltip } from "./Overlays";
import { Checkbox, DatePicker, FormField, RadioGroup, Select } from "./Form";
import { Tabs } from "./Tabs";
import { EmptyState, ErrorState, SkeletonTable } from "./States";
import { ContactsEmpty, SegmentsEmpty } from "./Empties";
import type { ContactsReviewState } from "@/lib/contacts/state";
import { ToastProvider, useToast } from "./Toaster";
import { SessionUnavailable, type SessionUnavailableProps } from "./SessionUnavailable";
import { KnowledgeBase, PRODUCT } from "./kb";
import { productRows } from "@/lib/kb/products";
import { useKbProducts } from "./kb/live";
import { useLeadProduct, useLiveSegments } from "./leads/live";
import { useAppData } from "@/components/session/AppData";
import type { KbReviewState } from "@/lib/kb/state";
import { LeadsView } from "./leads";
import type { LeadsReviewState } from "@/lib/leads/state";
import { CREDITS, DiscoveryView, type DiscoveryCatalog } from "./discovery";
import type { DiscoveryReviewState } from "@/lib/discovery/state";
import { SequencesView, seedFor, type SequenceCatalog, type SeqTab } from "./sequences";
import type { KeysApi } from "./mcp/Keys";
import type { TeamApi } from "./settings";
import type { Member } from "@/lib/api";
import type { WorkspaceInvite } from "@/lib/api/workspace";
import { firstCallFrom, type ApiKey as ApiKeyRow, type Connection as ConnRow, type FirstCallCheck } from "./mcp/data";
import type { SequenceReviewState } from "@/lib/sequences/state";
import { poolSummary } from "@/lib/sequences/sequence";
import { UniboxView, UNIBOX_TABS, needsYou, UNIBOX_THREADS, uniboxSeedFor, type UniboxTab } from "./unibox";
import type { UniboxReviewState } from "@/lib/unibox/state";
import { appPath, locationFromPath } from "@/lib/appPath";
import { isAppPath } from "@/lib/auth/paths";
import { SettingsView, settingsTabLabel, settingsTabOf } from "./handoff";
import { ProductsView } from "./products/Products";
import type { SettingsReviewState } from "@/lib/integrations/state";
import { detailFromApi, type LastEvent } from "@/lib/integrations/live";
import type { MapRow } from "@/lib/integrations/integrations";
import type { LoadDetail } from "./handoff/Integrations";
import { SECTION_TITLE, sectionOf, type McpReviewState } from "@/lib/mcp/state";

/** Fixed "today" for the demo so static renders are deterministic. Replace with new Date(). */
export const DEMO_TODAY = new Date(2026, 8, 29);
const addDays = (n: number) => new Date(DEMO_TODAY.getFullYear(), DEMO_TODAY.getMonth(), DEMO_TODAY.getDate() + n);

/* ------------------------------------------------------------ commands */
export type CommandHandlers = { go: (v: ViewId) => void; openThread: (id: string) => void; openCompany: (id: string) => void; act: (id: string, label: string) => void };
export function buildCommands(h: CommandHandlers, sample = true) {
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
  const recent: Command[] = sample ? [company("pwani"), company("kilima"), person(THREADS[0]), person(THREADS.find((t) => t.id === "sofia")!)].map((c) => ({ ...c, id: `r-${c.id}` })) : [];
  const entities: Command[] = sample ? [...LEADS.map((l) => company(l.id)), ...THREADS.map(person),
    ...LEADS.filter((l) => !THREADS.some((t) => t.name === l.person)).map((l): Command => ({ id: `pl-${l.id}`, group: "People", label: l.person, keywords: `${l.company} ${l.title}`, lead: <Avatar id={l.avatar} />, sub: `${l.title} · ${l.company}`, meta: <Tag status={l.reply} />, run: () => h.openCompany(l.id) }))] : [];
  const fallback = (q: string): Command => ({ id: "fb", group: "Search the market", label: `Find companies matching “${q}”`, icon: "globe", sub: "Corral reads their sites and scores them for ColdTrace Sensors", run: () => h.act("find", `Finding “${q}”`) });
  return { commands, recent, entities, fallback };
}

/* ------------------------------------------------------------ views */
function ContactsView({ state, onFind, people }: {
  state?: ContactsReviewState; onFind: () => void;
  people?: { phase: "loading" | "ready" | "error"; rows: Lead[]; onRetry?: () => void };
}) {
  // M10: loading / empty / error, in the same voice and skeleton as every other table.
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">(people ? people.phase === "error" ? "error" : people.phase === "loading" ? "loading" : people.rows.length ? "ready" : "empty" : state === "empty" ? "empty" : state === "error" ? "error" : "loading");
  useEffect(() => {
    if (people || phase !== "loading" || state === "loading") return;
    const t = setTimeout(() => setPhase("ready"), 900); return () => clearTimeout(t);
  }, [people, phase, state]);
  const empty = phase === "empty";
  return (
    <div className="c-view">
      <div className="c-subbar"><Tabs label="Contacts" value="dm" tabs={[{ id: "dm", label: "Decision-makers", count: empty ? 0 : people ? undefined : 412 }, { id: "all", label: "Everyone", count: empty ? 0 : people ? people.rows.length : "3,902" }]} /></div>
      {phase === "ready" && <div className="c-view__scroll"><SegmentTable leads={people?.rows} selected={new Set()} label="Contacts" fitLabel={people ? "Fit" : undefined} /></div>}
      {phase === "loading" && <div className="c-view__scroll" style={{ overflow: "hidden" }} /* a skeleton never scrolls */><SkeletonTable rows={9} label="Loading contacts" /></div>}
      {empty && <div className="c-view c-view--center"><ContactsEmpty onFind={onFind} /></div>}
      {phase === "error" && <div className="c-view c-view--center"><ErrorState title="Couldn’t load contacts" detail="GET /api/v1/contacts · 503"
        actions={<Button variant="primary" onClick={() => { people?.onRetry?.(); setPhase("loading"); }}><Icon name="refresh" />Try again</Button>}>
        Nothing is lost. Corral keeps reading companies and finding people while this page is down.
      </ErrorState></div>}
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
  /** Knowledge-base review state (M2): /app/knowledge?state=… */
  kb?: KbReviewState;
  /** Lead table / segment review state (M3): /app/companies?state=… or /app/segments?state=… */
  leads?: LeadsReviewState;
  /** Discovery review state (M4): /app/discovery?state=… */
  discovery?: DiscoveryReviewState;
  /** Sequences / mailbox pool review state (M6): /app/sequences?state=… */
  sequences?: SequenceReviewState;
  /** Unibox review state (M7): /app?state=… */
  unibox?: UniboxReviewState;
  /** Settings → Integrations review state (M8): /app/settings?state=… */
  settings?: SettingsReviewState;
  /** Settings → Developers review state (M9): MCP, API keys, Docs. /app/settings?state=… */
  developer?: McpReviewState;
  /** Contacts review state (M10): /app/contacts?state=loading | empty | error */
  contacts?: ContactsReviewState;
  /** Which Settings page opens: /app/settings/mcp | keys | docs | workspace | profile | … */
  settingsTab?: string;
  /** /app/segments/<name> — the saved segment to open. */
  initialSegment?: string;
};
export function AppDemo(p: AppDemoProps) { return <ToastProvider><Demo {...p} /></ToastProvider>; }

function Demo({ initialView = "unibox", cmdk = false, collapsed: c0 = false, drawer = false, dialog = false, frame = "viewport", hotkeys = true, className, account, onSignOut, sessionError, kb, leads, discovery, sequences, unibox, settings, developer, contacts, settingsTab, initialSegment }: AppDemoProps) {
  const router = useRouter();
  const data = useAppData();
  const inboxLive = !!data && !unibox;
  const settingsPage = settingsTabOf(settingsTab);
  const [setSection, setSetSection] = useState(developer ? SECTION_TITLE[sectionOf(developer)] : settingsPage ? settingsTabLabel(settingsPage) : settings?.startsWith("team") ? "Team" : settings?.startsWith("billing") ? "Billing" : "Integrations");
  const toast = useToast();
  const signOut = useCallback(() => {
    if (!onSignOut) { router.push("/sign-in"); return; }
    // M1 follow-up 5c: say what state you're in, then the one thing to do. Stays up 10s.
    const attempt = () => { void onSignOut().then((r) => { if (!r.ok) toast({ tone: "error", children: "Sign-out didn’t go through. You’re still signed in.", duration: 10000, action: { label: "Try again", onClick: attempt } }); }); };
    attempt();
  }, [onSignOut, router, toast]);
  const [view, setView] = useState<ViewId>(initialView);
  const [segment, setSegment] = useState<string | undefined>(initialView === "segments" ? (initialSegment || SAVED_SEGMENTS[0][0]) : undefined);
  const [tabNow, setTabNow] = useState<string | undefined>(settingsTabOf(settingsTab));
  const [collapsed, setCollapsed] = useState(c0);
  const [palette, setPalette] = useState(cmdk);
  const [ub] = useState(() => uniboxSeedFor(unibox));
  const sampleThreads = () => (ub.empty ? UNIBOX_THREADS.filter((t) => t.handled) : UNIBOX_THREADS.map((t) => (ub.patch?.[t.id] ? { ...t, ...ub.patch[t.id] } : t)));
  const [threads, setThreadsState] = useState<Thread[]>(() => (inboxLive ? [] : sampleThreads()));
  const [inboxPhase, setInboxPhase] = useState<"loading" | "ready" | "error">(inboxLive ? "loading" : "ready");
  const [trackedInboxLive, setTrackedInboxLive] = useState(inboxLive);
  if (inboxLive !== trackedInboxLive) {
    setTrackedInboxLive(inboxLive);
    if (inboxLive) { setThreadsState([]); setInboxPhase("loading"); }
  }
  // Signed in, a triage, handled, read or snooze change is saved. The PATCH goes out here, once, and
  // not inside the state updater (React may run an updater twice). threadsRef is the latest list, so
  // two updates in one tick still chain.
  const threadsRef = useRef(threads);
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  const setThreads = useCallback<typeof setThreadsState>((update) => {
    const prev = threadsRef.current;
    const next = typeof update === "function" ? update(prev) : update;
    threadsRef.current = next;
    setThreadsState(next);
    if (!data || unibox) return;
    for (const t of next) {
      const old = prev.find((p) => p.id === t.id);
      if (old && (old.triage !== t.triage || old.handled !== t.handled || old.unread !== t.unread || old.snoozed !== t.snoozed || old.status !== t.status)) {
        void data.inbox.patch(t.id, { triage: t.triage ?? null, handled: !!t.handled, unread: !!t.unread, snoozed: t.snoozed ?? null, status: t.status });
      }
    }
  }, [data, unibox]);
  const [active, setActive] = useState(ub.active);
  const [tab, setTab] = useState<UniboxTab>(ub.tab);
  const [pane, setPane] = useState<"list" | "read">(ub.pane);
  const [enrollFor, setEnrollFor] = useState({ n: 3, replied: true });
  const [enroll, setEnroll] = useState(dialog);
  const [importOpen, setImportOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [enrollAll, setEnrollAll] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [kbAdd, setKbAdd] = useState(kb === "upload" || kb === "upload-errors" || kb === "replace");
  const [seqTab, setSeqTab] = useState<SeqTab>(() => seedFor(sequences).tab);
  const [pool, setPool] = useState(() => (data && !sequences ? [] : seedFor(sequences).pool));
  const [newSeq, setNewSeq] = useState(0);
  const [adding, setAdding] = useState(false);
  const poolNow = poolSummary(pool);
  useEffect(() => {
    if (!data || unibox || view !== "unibox") return;
    const c = new AbortController();
    void data.inbox.list(undefined, c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) { setInboxPhase("error"); return; }
      setThreadsState(r.value as Thread[]);
      setInboxPhase("ready");
    });
    return () => c.abort();
  }, [data, unibox, view]);
  const [needsCount, setNeedsCount] = useState<number | null>(null);
  useEffect(() => {
    if (!data || unibox) return;
    const c = new AbortController();
    void data.inbox.summary(c.signal).then((r) => {
      if (!c.signal.aborted && r.ok) setNeedsCount(r.value.needs_you);
    });
    return () => c.abort();
  }, [data, unibox]);
  // Signed in against the API (and not showing a review state): the knowledge base uses real data.
  const kbProducts = useKbProducts(data && !kb ? data.kb : null, { active: view === "knowledge", workspace: data?.me.organization.name ?? "" });
  const kbLive = data && kbProducts ? { data, products: kbProducts } : undefined;
  // Companies and segments on the API (ENG-81), unless a leads review state is showing.
  const leadsOn = !!data && !leads;
  const leadProduct = useLeadProduct(leadsOn ? data!.kb : null);
  const liveSegments = useLiveSegments(leadsOn ? data!.leads : null);
  const leadsLive = leadsOn && liveSegments ? { api: data!.leads, product: leadProduct, segments: liveSegments } : undefined;
  const sidebarSegments = useMemo<[string, number][] | undefined>(() => (liveSegments ? liveSegments.list.map((s) => [s.name, s.count]) : undefined), [liveSegments]);
  const firstSegment = liveSegments ? liveSegments.list[0]?.name : SAVED_SEGMENTS[0][0];
  // A segment name from the sample (or one that was deleted) isn't in the workspace: open the first real one.
  if (liveSegments?.phase === "ready" && view === "segments" && segment !== firstSegment && !liveSegments.byName(segment)) setSegment(firstSegment);
  const productName = kbLive ? kbProducts?.selected?.name ?? data?.me.organization.name ?? PRODUCT.name : PRODUCT.name;
  const discoveryLive = !!data && !discovery && view === "discovery";
  const sequencesLive = !!data && !sequences && view === "sequences";
  const settingsLive = !!data && !settings && !developer && view === "settings";
  const contactsLive = !!data && !contacts && view === "contacts";
  const [discPhase, setDiscPhase] = useState<"loading" | "ready" | "error">(discoveryLive ? "loading" : "ready");
  const [trackedDiscovery, setTrackedDiscovery] = useState(discoveryLive);
  if (discoveryLive !== trackedDiscovery) {
    setTrackedDiscovery(discoveryLive);
    if (discoveryLive) setDiscPhase("loading");
  }
  const [discRuns, setDiscRuns] = useState<DiscoveryCatalog["runs"]>([]);
  const [discTry, setDiscTry] = useState(0);
  const [seqTry, setSeqTry] = useState(0);
  // Sequences the server has. A sequence made on this screen is created on its first save, then updated.
  const seqKnown = useRef(new Set<string>());
  const [seqPhase, setSeqPhase] = useState<"loading" | "ready" | "error">(sequencesLive ? "loading" : "ready");
  const [trackedSequences, setTrackedSequences] = useState(sequencesLive);
  if (sequencesLive !== trackedSequences) {
    setTrackedSequences(sequencesLive);
    if (sequencesLive) setSeqPhase("loading");
  }
  const [seqList, setSeqList] = useState<SequenceCatalog["list"]>([]);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
  const [integrationConn, setIntegrationConn] = useState<Record<"cal" | "phoenix" | "autosend", "off" | "connected" | "reauth" | "error" | "connecting"> | null>(null);
  const [integrationLast, setIntegrationLast] = useState<Partial<Record<"cal" | "phoenix" | "autosend", LastEvent | null>>>({});
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<WorkspaceInvite[] | null>(null);
  // Team writes the pending list it was given plus what it adds; the ref keeps the latest without remounting Team.
  const invitesRef = useRef<WorkspaceInvite[]>([]);
  useEffect(() => { invitesRef.current = invites ?? []; }, [invites]);
  const [liveKeys, setLiveKeys] = useState<import("./mcp/data").ApiKey[] | null>(null);
  const [liveConns, setLiveConns] = useState<import("./mcp/data").Connection[] | null>(null);
  const [contactPhase, setContactPhase] = useState<"loading" | "ready" | "error">(contactsLive ? "loading" : "ready");
  const [trackedContacts, setTrackedContacts] = useState(contactsLive);
  if (contactsLive !== trackedContacts) {
    setTrackedContacts(contactsLive);
    if (contactsLive) setContactPhase("loading");
  }
  const [contactTry, setContactTry] = useState(0);
  const [contactRows, setContactRows] = useState<Lead[]>([]);
  useEffect(() => {
    if (!data || sequences) return;
    const c = new AbortController();
    void data.sequences.mailboxes(c.signal).then((r) => {
      if (c.signal.aborted || !r.ok) return;
      setPool(r.value.mailboxes.map((box) => ({
        id: String(box.id ?? box.address ?? "box"),
        address: String(box.address ?? ""),
        provider: box.provider === "microsoft" || box.provider === "smtp" ? box.provider : "google",
        owner: String(box.owner ?? ""),
        state: box.state === "warming" || box.state === "disconnected" || box.state === "resting" ? box.state : "warm",
        cap: typeof box.cap === "number" ? box.cap : 35,
        day: typeof box.day === "number" ? box.day : undefined,
        sentToday: typeof box.sentToday === "number" ? box.sentToday : 0,
        bouncedToday: typeof box.bouncedToday === "number" ? box.bouncedToday : 0,
        bounce30: typeof box.bounce30 === "number" ? box.bounce30 : 0,
        complaints30: typeof box.complaints30 === "number" ? box.complaints30 : 0,
        auth: { spf: true, dkim: true, dmarc: true },
        sequences: typeof box.sequences === "number" ? box.sequences : 0,
      })));
    });
    return () => c.abort();
  }, [data, sequences]);
  useEffect(() => {
    if (!discoveryLive || !data) return;
    const c = new AbortController();
    void data.discovery.runs(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) { setDiscPhase("error"); return; }
      setDiscRuns(r.value.runs as DiscoveryCatalog["runs"]);
      setCreditsLeft(r.value.credits.left);
      setDiscPhase("ready");
    });
    return () => c.abort();
  }, [data, discoveryLive, discTry]);
  useEffect(() => {
    if (!sequencesLive || !data) return;
    const c = new AbortController();
    void data.sequences.list(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) { setSeqPhase("error"); return; }
      seqKnown.current = new Set(r.value.map((s) => String(s.id)));
      setSeqList(r.value as SequenceCatalog["list"]);
      setSeqPhase("ready");
    });
    return () => c.abort();
  }, [data, sequencesLive, seqTry]);
  const persistSequence = useCallback((seq: SequenceCatalog["list"][number]) => {
    if (!data) return;
    const { id, ...body } = seq;
    if (seqKnown.current.has(id)) { void data.sequences.update(id, body); return; }
    seqKnown.current.add(id);
    void data.sequences.create({ id, ...body }).then((r) => { if (!r.ok) seqKnown.current.delete(id); });
  }, [data]);
  const teamApi = useMemo<TeamApi | undefined>(() => {
    if (!data) return undefined;
    const save = async (next: WorkspaceInvite[]) => {
      const r = await data.workspace.update({ invites: next });
      if (r.ok) invitesRef.current = r.value.invites;
      return r.ok;
    };
    return {
      invite: (emails, role) => save([...invitesRef.current, ...emails.map((email): WorkspaceInvite => ({ email, role: role === "admin" ? "admin" : "member" }))]),
    };
  }, [data]);
  // M14: a connected integration's page reads only the API: its detail and its log, together.
  const loadDetail = useCallback<LoadDetail>(async (id) => {
    if (!data) return null;
    const [d, l] = await Promise.all([data.integrations.detail(id), data.integrations.logs(id)]);
    return d.ok && l.ok ? detailFromApi(id, d.value, l.value) : null;
  }, [data]);
  const saveMapping = useCallback(async (id: string, rows: MapRow[]) => (data ? (await data.integrations.saveMapping(id, rows)).ok : false), [data]);
  const mcpCheck = useMemo<FirstCallCheck | undefined>(() => (data ? async (known) => {
    const list = await data.developers.connections();
    const fresh = list.ok ? list.value.find((c) => typeof c.id === "string" && !known.includes(c.id)) : undefined;
    if (!fresh) return null;
    const conn = fresh as unknown as ConnRow;
    const calls = await data.developers.calls(conn.id);
    const first = firstCallFrom(conn, calls.ok ? calls.value : []);
    return first ? { conn, first } : null;
  } : undefined), [data]);
  const keysApi = useMemo<KeysApi | undefined>(() => (data ? {
    create: async (d) => {
      const r = await data.developers.createKey({ name: d.name, env: d.env, scopes: d.scopes, expires: d.expires });
      return r.ok && typeof r.value.secret === "string" ? { key: r.value as unknown as ApiKeyRow, secret: r.value.secret } : null;
    },
    rotate: async (id, overlap) => {
      const r = await data.developers.rotateKey(id, overlap);
      return r.ok && typeof r.value.secret === "string" ? { key: r.value as unknown as ApiKeyRow, secret: r.value.secret } : null;
    },
    revoke: async (id) => (await data.developers.revokeKey(id)).ok,
  } : undefined), [data]);
  const viewer = useMemo(() => (data ? { name: data.person.name, role: data.me.role === "member" ? "member" as const : "owner" as const } : undefined), [data]);
  useEffect(() => {
    if (!settingsLive || !data) return;
    const c = new AbortController();
    void data.integrations.list(c.signal).then((r) => {
      if (c.signal.aborted) return;
      const conn = { cal: "off" as const, phoenix: "off" as const, autosend: "off" as const };
      const last: Partial<Record<keyof typeof conn, LastEvent | null>> = {};
      for (const row of r.ok ? r.value : []) {
        if (row.provider !== "cal" && row.provider !== "phoenix" && row.provider !== "autosend") continue;
        conn[row.provider] = row.status as typeof conn.cal;
        last[row.provider] = row.lastEvent ? { event: row.lastEvent.event, at: row.lastEvent.at } : null;
      }
      setIntegrationLast(last);
      setIntegrationConn(conn);
    });
    void data.integrations.members(c.signal).then((r) => { if (!c.signal.aborted) setMembers(r.ok ? r.value : []); });
    void data.workspace.get(c.signal).then((r) => { if (!c.signal.aborted) setInvites(r.ok ? r.value.invites : []); });
    void data.developers.keys(c.signal).then((r) => { if (!c.signal.aborted && r.ok) setLiveKeys(r.value as import("./mcp/data").ApiKey[]); });
    void data.developers.connections(c.signal).then((r) => { if (!c.signal.aborted && r.ok) setLiveConns(r.value as import("./mcp/data").Connection[]); });
    return () => c.abort();
  }, [data, settingsLive]);
  useEffect(() => {
    if (!contactsLive || !data) return;
    const c = new AbortController();
    void data.leads.people(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) { setContactPhase("error"); return; }
      setContactRows(r.value.map((p): Lead => ({
        id: p.id, company: p.companyName || "—", domain: "", person: [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "Unknown",
        title: p.title || "", avatar: "", fit: 0, email: "Unverified", reply: "Not contacted", last: "", why: [],
      })));
      setContactPhase("ready");
    });
    return () => c.abort();
  }, [contactsLive, data, contactTry]);

  // The shell at /app writes the screen into the path. Styleguide and marketing embeds keep their own state.
  const liveRoute = frame === "viewport" && typeof window !== "undefined" && isAppPath(window.location.pathname);
  const place = useCallback((v: ViewId, opts?: { segment?: string; tab?: string }) => {
    const seg = v === "segments" ? (opts?.segment ?? firstSegment) : undefined;
    setView(v);
    setSegment(seg);
    setBuilderOpen(false);
    if (v === "settings") setTabNow(settingsTabOf(opts?.tab));
    if (!liveRoute) return;
    const href = appPath(v, { segment: seg, tab: v === "settings" ? opts?.tab : undefined });
    if (`${window.location.pathname}${window.location.search}` === href) return;
    router.push(href, { scroll: false });
  }, [firstSegment, liveRoute, router]);
  const go = useCallback((v: ViewId) => place(v), [place]);

  useEffect(() => {
    if (!liveRoute) return;
    const apply = () => {
      const loc = locationFromPath(window.location.pathname);
      setView(loc.view);
      if (loc.view === "segments") setSegment(loc.segment ?? firstSegment);
      if (loc.view === "settings") {
        const tab = settingsTabOf(loc.tab);
        setTabNow(tab);
        if (tab) setSetSection(settingsTabLabel(tab));
      }
    };
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [liveRoute, firstSegment]);

  useEffect(() => {
    if (!liveRoute) return;
    const name = APP_NAV.find((n) => n.id === view)!.label;
    document.title = `${name} · Corral`;
  }, [liveRoute, view]);

  const archive = useCallback((id: string) => {
    const i = threads.findIndex((t) => t.id === id); if (i < 0) return;
    const gone = threads[i]; const rest = threads.filter((t) => t.id !== id);
    setThreads(rest); setActive(rest[Math.min(i, rest.length - 1)]?.id ?? "");
    toast({ tone: "success", icon: "archive", children: `Archived ${gone.name}`, action: { label: "Undo", onClick: () => { setThreads((l) => { const n = [...l]; n.splice(i, 0, gone); return n; }); setActive(gone.id); } } });
  }, [threads, toast, setThreads]);

  const cmds = useMemo(() => buildCommands({
    go,
    openThread: (id) => { place("unibox"); setTab("needs"); setActive(id); setPane("read"); },
    openCompany: (id) => { const t = THREADS.find((x) => x.company === LEADS.find((l) => l.id === id)?.company);
      if (t) { place("unibox"); setTab("needs"); setActive(t.id); setPane("read"); } else place("companies"); },
    act: (id, label) => {
      if (id === "sidebar") setCollapsed((c) => !c);
      else if (id === "signout") signOut();
      else if (id === "invite") router.push("/onboarding?step=5");
      else if (id === "mailbox") router.push("/onboarding?step=4");
      else if (id === "product") { if (data) { place("products"); setAdding(true); } else router.push("/onboarding?step=2"); }
      else if (id === "segment") { place("companies"); toast({ icon: "layers", children: "Filters ready. Press S to save them as a segment." }); }
      else if (id === "find") { place("discovery"); setSetupOpen(true); }
      else toast({ icon: "mail", children: label, meta: "sample action" });
    },
  }, !data), [data, go, place, router, toast, signOut]);

  // Global keys: ⌘K and G-sequences. The Unibox handles its own keys (J K E 1–6 T R ⌘↵ …) in <UniboxView>.
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
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hotkeys, palette, enroll, kbAdd, importOpen, setupOpen, go]);

  const label = APP_NAV.find((n) => n.id === view)!.label;
  const ws = typeof account === "object" ? account.workspace : account === undefined ? "ColdTrace" : "Corral";
  const crumbs = view === "unibox" ? [ws, "Unibox", UNIBOX_TABS.find((x) => x.id === tab)!.label]
    : view === "knowledge" ? [ws, "Knowledge base", productName]
    : view === "sequences" && seqTab === "pool" ? [ws, "Sequences", "Mailbox pool"]
    : view === "settings" ? [ws, "Settings", setSection]
    : segment && !(view === "segments" && leads === "empty") ? [ws, "Segments", segment] : [ws, label];
  // M13 gap 2: no saved segments yet (or the review state) shows the segments empty state instead of the table.
  const noSegments = view === "segments" && (leads === "empty" || (liveSegments ? liveSegments.phase === "ready" && liveSegments.list.length === 0 : SAVED_SEGMENTS.length === 0));
  const table = view === "companies" || (view === "segments" && !noSegments);
  const findCompanies = () => { go("discovery"); setSetupOpen(true); };
  const actions = view === "unibox" ? <>
      <DropdownMenu align="end" width={240} label="Product" items={[{ heading: "Replies about" }, { label: "All products", checked: true }, { label: "ColdTrace Sensors", meta: "11" }, { label: "ColdTrace Gateway", meta: "1" }]}
        trigger={(tp) => <button type="button" className="c-btn c-btn--quiet" {...tp}><Icon name="filter" />All products<Icon name="down" size={12} /></button>} />
      <Tooltip label="Archive thread" kbd="E" side="bottom"><button type="button" className="c-iconbtn" aria-label="Archive thread" onClick={() => archive(active)}><Icon name="archive" /></button></Tooltip>
      <Button kbd="C" onClick={() => toast({ icon: "mail", children: "Compose", meta: "sample action" })}>Compose</Button>
    </>
    : view === "knowledge" ? <>
      <DropdownMenu align="end" width={240} label="Product" items={kbLive && kbProducts
          ? [{ heading: "Knowledge for" }, ...productRows(kbProducts.products, kbProducts.selected?.id).map((r) => ({ label: r.label, checked: r.checked, meta: r.meta, onSelect: () => kbProducts.select(r.id) }))]
          : [{ heading: "Knowledge for" }, ...productRows([{ id: "s", name: "ColdTrace Sensors" }, { id: "g", name: "ColdTrace Gateway" }], "s", { s: 12 })
              .map((r) => ({ label: r.label, checked: r.checked, meta: r.meta, onSelect: r.checked ? undefined : () => toast({ icon: "book", children: r.label, meta: "sample action" }) }))]}
        trigger={(tp) => <button type="button" className="c-btn c-btn--quiet k-prodbtn" {...tp}><Icon name="box" />{productName}<Icon name="down" size={12} /></button>} />
      <Button variant="primary" onClick={() => setKbAdd(true)}><Icon name="plus" />Add sources</Button>
    </>
    : view === "companies" ? <><Button onClick={() => setImportOpen(true)}><Icon name="upload" />Import CSV</Button><Button variant="primary" onClick={findCompanies}><Icon name="globe" />Find companies</Button></>
    : view === "discovery" ? <><span className="d-credits"><span className="c-num c-strong">{(discoveryLive ? creditsLeft ?? 0 : CREDITS.left).toLocaleString("en-US")}</span> credits left this month</span>{discovery !== "empty" && (!discoveryLive || discRuns.length > 0) && <Button variant="primary" onClick={() => setSetupOpen(true)}><Icon name="plus" />New run</Button>}</>
    : view === "sequences" ? (seqTab === "pool"
      ? <Button onClick={() => router.push("/onboarding?step=4")}><Icon name="plus" />Connect a mailbox</Button>
      : sequences !== "empty" && sequences !== "loading" && sequences !== "error" && (!sequencesLive || seqList.length > 0) ? <Button onClick={() => setNewSeq((x) => x + 1)}><Icon name="plus" />New sequence</Button> : null)
    : view === "segments" && noSegments ? null
    : view === "segments" ? <><Button onClick={() => toast({ icon: "upload", children: `Exporting ${segment}`, meta: "CSV lands in your downloads" })}>Export</Button><Button variant="primary" onClick={() => setEnrollAll((x) => x + 1)}><Icon name="seq" />Enroll segment</Button></>
    : view === "products" && data ? <Button variant="primary" onClick={() => setAdding(true)}><Icon name="plus" />Add a product</Button>
    : null;

  return (
    <>
      <AppShell frame={frame} className={className} active={view} onNavigate={go} crumbs={sessionError ? [ws, "Not connected"] : crumbs} actions={sessionError ? null : actions} collapsed={collapsed} onCollapsedChange={setCollapsed}
        onSearch={() => setPalette(true)} segment={segment} onSegment={(s) => place("segments", { segment: s })} defaultDrawer={drawer} hotkeys={hotkeys} account={account} onSignOut={signOut}
        pool={{ sent: poolNow.sent, cap: poolNow.cap, mailboxes: poolNow.total, attention: poolNow.attention }} onPool={() => { go("sequences"); setSeqTab("pool"); }}
        counts={{ unibox: String(inboxLive && view === "unibox" && inboxPhase === "ready" ? needsYou(threads) : inboxLive ? (needsCount ?? 0) : needsYou(threads)) }} segments={view === "segments" && leads === "empty" ? [] : sidebarSegments}>
        {sessionError ? <SessionUnavailable {...sessionError} /> : <>
        {view === "unibox" && <UniboxView key={unibox ?? inboxPhase} state={unibox ?? (inboxLive && inboxPhase !== "ready" ? inboxPhase : undefined)} threads={threads} setThreads={setThreads} active={active} setActive={setActive} tab={tab} setTab={setTab} pane={pane} setPane={setPane}
          onArchive={archive} onSend={data && !unibox ? (id, text) => { void data.inbox.send(id, text); } : undefined} hotkeys={hotkeys && !palette && !enroll && !kbAdd && !importOpen && !setupOpen} />}
        {table && <LeadsView key={`${view}-${segment ?? ""}`} view={view} state={leads} segment={segment} importOpen={importOpen} onImportOpenChange={setImportOpen}
          builderOpen={builderOpen} onBuilderOpenChange={setBuilderOpen} enrollAllSignal={enrollAll} onFind={findCompanies} onEnroll={(n, replied) => { setEnrollFor({ n, replied }); setEnroll(true); }} live={leadsLive} />}
        {view === "discovery" && <DiscoveryView key={discovery ?? (discoveryLive ? `${discPhase}:${discRuns.length}` : "sample")} state={discovery} catalog={discoveryLive ? { phase: discPhase, runs: discRuns, productName: data?.me.organization.name, onRetry: () => { setDiscPhase("loading"); setDiscTry((n) => n + 1); }, onCreate: (run) => { void data?.discovery.create({ name: run.name, status: "queued" }); } } : undefined} setupOpen={setupOpen} onSetupOpenChange={setSetupOpen} onOpenCompanies={() => go("companies")} />}
        {view === "sequences" && <SequencesView key={sequences ?? (sequencesLive ? `${seqPhase}:${seqList.length}` : "sample")} state={sequences} catalog={sequencesLive ? { phase: seqPhase, list: seqList, onRetry: () => { setSeqPhase("loading"); setSeqTry((n) => n + 1); }, onPersist: persistSequence } : undefined} tab={seqTab} onTabChange={setSeqTab} pool={pool} onPoolChange={setPool} newSignal={newSeq} onConnectMailbox={() => router.push("/onboarding?step=4")} />}
        {noSegments && <div className="c-view c-view--center"><SegmentsEmpty onCreate={() => { place("companies"); setBuilderOpen(true); }}
          onImport={() => { place("companies"); setImportOpen(true); }} /></div>}
        {view === "contacts" && <ContactsView key={contacts ?? contactPhase} state={contacts} people={contactsLive ? { phase: contactPhase, rows: contactRows, onRetry: () => { setContactPhase("loading"); setContactTry((n) => n + 1); } } : undefined} onFind={() => place("discovery")} />}
        {view === "settings" && <SettingsView key={`${settings ?? developer ?? "live"}-${tabNow ?? "integrations"}`} state={settings} developer={developer} tab={tabNow} onSection={(label, id) => { setSetSection(label); place("settings", { tab: id }); }} liveIntegrations={settingsLive ? integrationConn : undefined} liveLast={settingsLive ? integrationLast : undefined}
          loadDetail={settingsLive ? loadDetail : undefined} onSaveMapping={settingsLive ? saveMapping : undefined}
          members={settingsLive ? members : undefined} invites={settingsLive ? invites : undefined} teamApi={settingsLive ? teamApi : undefined} liveKeys={settingsLive ? (liveKeys ?? []) : undefined} liveConnections={settingsLive ? (liveConns ?? []) : undefined}
          keysApi={settingsLive ? keysApi : undefined} viewer={settingsLive ? viewer : undefined}
          onDisconnect={settingsLive ? (id) => { void data?.developers.deleteConnection(id); } : undefined}
          onIntegration={settingsLive ? async (id, status) => (data ? (await data.integrations.update(id, { status })).ok : false) : undefined} mcpCheck={settingsLive ? mcpCheck : undefined} />}
        {view === "knowledge" && <KnowledgeBase key={kbLive ? "live" : "sample"} state={kb} addOpen={kbAdd} onAddOpenChange={setKbAdd} contained={frame === "contained"} live={kbLive} />}
        {view === "products" && data && <ProductsView adding={adding} onAddingChange={setAdding} onChanged={() => kbProducts?.retry()} onOpen={(id) => { kbProducts?.select(id); place("knowledge"); }} />}
        {!table && !noSegments && view !== "unibox" && view !== "contacts" && view !== "knowledge" && view !== "discovery" && view !== "sequences" && view !== "settings" && !(view === "products" && data) && <PendingView id={view} onSearch={() => setPalette(true)} />}
        </>}
      </AppShell>
      {palette && <CommandPalette open onClose={() => setPalette(false)} {...cmds} />}
      <EnrollDialog open={enroll} onClose={() => setEnroll(false)} count={enrollFor.n} includesReplied={enrollFor.replied} onConfirm={(msg, meta) => toast({ tone: "success", children: msg, meta, action: { label: "Undo", onClick: () => toast({ children: "Enrollment undone" }) } })} />
    </>
  );
}
