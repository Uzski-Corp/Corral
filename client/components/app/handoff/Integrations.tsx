"use client";
/* Settings → Integrations (M8, ENG-58): Cal.com (meetings), Phoenix ERP (deals), AutoSend (follow-up mail).
   Connect, connected, needs sign-in, failing, disconnect; per-integration logs, Phoenix’s field mapping, and
   what each one may do. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { Checkbox, FormField, Select, TextInput } from "../Form";
import { Tabs } from "../Tabs";
import { Banner, ErrorState, Skeleton, Spinner } from "../States";
import { useToast } from "../Toaster";
import { dealPayload, filterLogs, healthOf, isProblem, mappingIssues, RESULT_WORD, type Connection, type IntegrationId, type LogFilter, type LogRow, type MapRow } from "@/lib/integrations/integrations";
import type { SettingsReviewState } from "@/lib/integrations/state";
import { sectionOf, type DevSection, type McpReviewState } from "@/lib/mcp/state";
import { Developer, McpConsent } from "../mcp";
import { AUTOSEND_SENDER, CORRAL_FIELDS, ERP_FIELDS, ERP_URL, GRACE_VALUES, INTEGRATIONS, LOGS, MAPPING, MAPPING_BROKEN, PROBLEM, SCOPES, STAGE_MAP, integration, liveSeed, settingsSeed, type SettingsSeed } from "./data";
import { LiveIntegrationPage } from "./Live";
import { LIVE_COPY, type IntegrationDetail, type LastEvent } from "@/lib/integrations/live";
import { agoLabel } from "@/lib/time";
import { useNow } from "../useNow";
import { BrandLockup, Pill, Tile } from "./Handoff";
import { ProfileSettings } from "./ProfileSettings";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { BillingConnected, BillingView, SmsPlayground, TeamView, type TeamApi, type TeamSession } from "../settings";
import { useAppData } from "@/components/session/AppData";
import { displayName, type Member } from "@/lib/api";
import type { WorkspaceInvite } from "@/lib/api/workspace";

type Tab = SettingsSeed["tab"];
type DialogKind = NonNullable<SettingsSeed["dialog"]>;
const TILE: Record<IntegrationId, string> = { cal: "Ca", phoenix: "Px", autosend: "As" };

const SECTIONS: { id: string; label: string; note?: string; href?: string; group?: "dev" }[] = [
  { id: "profile", label: "Profile", note: "Your name and photo" },
  { id: "workspace", label: "Workspace", note: "Name, time zone, sending hours" }, { id: "team", label: "Team", note: "People and roles" },
  { id: "mailboxes", label: "Mailboxes", href: "/app/sequences?state=mailboxes" }, { id: "integrations", label: "Integrations" },
  { id: "billing", label: "Billing", note: "Plan and credits" },
  { id: "sms", label: "SMS", note: "Send a text" },
  /* M9 (ENG-59): Developers. */
  { id: "mcp", label: "MCP", group: "dev" }, { id: "keys", label: "API keys", group: "dev" }, { id: "docs", label: "Docs", group: "dev" },
];
const isDev = (id: string): id is DevSection => id === "mcp" || id === "keys" || id === "docs";
/** `/app/settings/<id>` (works in production, unlike `state`): a Settings page with its own place, or undefined. */
export const settingsTabOf = (tab?: string): string | undefined => SECTIONS.find((x) => x.id === tab && !x.href)?.id;
export const settingsTabLabel = (tab: string): string => SECTIONS.find((x) => x.id === tab)!.label;

/** The settings page. Integrations (M8) and Developers (M9) are designed; the others keep their place. */
/** M13: which review states open Team or Billing. */
const sectionFor = (s?: SettingsReviewState) => (s?.startsWith("team") ? "team" : s?.startsWith("billing") ? "billing" : undefined);
/** Review-only placeholders (example.com, never a made-up person), in the API's shapes. Live: members from the API,
 *  invites from the workspace. */
const REVIEW_MEMBERS: Member[] = [{ id: "m2", name: "Teammate", email: "teammate@example.com", role: "member" }];

export function SettingsView({ state, developer, tab, onSection, liveIntegrations, liveLast, onSaveMapping, loadDetail, members, invites, teamApi, liveKeys, liveConnections, keysApi, viewer, onDisconnect, onIntegration, mcpCheck }: {
  state?: SettingsReviewState; developer?: McpReviewState; tab?: string; onSection?: (label: string, id: string) => void;
  liveIntegrations?: Record<IntegrationId, Connection> | null;
  /** M14: GET /api/v1/integrations/:id plus its log. Signed in, the detail page reads only this, never the M8 samples. */
  loadDetail?: LoadDetail;
  /** Signed in: GET /workspace/members (null while it loads) and the workspace's pending invites. */
  members?: Member[] | null;
  invites?: WorkspaceInvite[] | null;
  teamApi?: TeamApi;
  liveKeys?: import("../mcp/data").ApiKey[] | null;
  liveConnections?: import("../mcp/data").Connection[] | null;
  /** Signed in: what persists a key, a disconnect and an integration's status, and who is looking. */
  keysApi?: import("../mcp/Keys").KeysApi;
  viewer?: import("@/lib/mcp/keys").Viewer;
  onDisconnect?: (id: string) => void;
  onIntegration?: (id: IntegrationId, status: "off" | "connected") => Promise<boolean> | void;
  /** Signed in: each integration's newest log row, and where Phoenix's mapping is saved. */
  liveLast?: Partial<Record<IntegrationId, LastEvent | null>>;
  onSaveMapping?: (id: IntegrationId, rows: MapRow[]) => Promise<boolean>;
  mcpCheck?: import("../mcp/data").FirstCallCheck;
}) {
  const [section, setSection] = useState<string>(developer ? sectionOf(developer) : settingsTabOf(tab) ?? sectionFor(state) ?? "integrations");
  const data = useAppData();
  const [now] = useState(() => new Date());
  // You: the session says which member is you, and gives the avatar. The members API has no avatar.
  const session: TeamSession = data ? { userId: data.me.user.id, email: data.me.user.email, avatarUrl: data.me.user.profilePictureUrl } : { userId: "me", email: "you@example.com" };
  const meMember: Member = data ? { id: data.me.user.id, name: displayName(data.me.user), email: data.me.user.email, role: data.me.role } : { id: "me", name: "", email: "you@example.com", role: "owner" };
  const liveTeam = members !== undefined;
  // The members API sends the email as the name when someone has none: the row then shows the email once.
  const teamMembers: Member[] = liveTeam ? (members ?? []).map((m) => (m.name === m.email ? { ...m, name: "" } : m))
    : state === "team-solo" ? [meMember] : [meMember, ...REVIEW_MEMBERS];
  const teamInvites: WorkspaceInvite[] = liveTeam ? invites ?? []
    : state === "team-solo" ? [] : [{ email: "sales@example.com", role: "member", invitedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString() }];
  const teamLoading = state === "team-loading" || (liveTeam && members === null);
  // Who connected an integration: you from the session, anyone else by the member list.
  const names = Object.fromEntries((members ?? []).filter((m) => m.name && m.name !== m.email).map((m) => [m.id, m.name]));
  const s = SECTIONS.find((x) => x.id === section)!;
  const go = (id: string) => {
    setSection(id);
    const row = SECTIONS.find((x) => x.id === id)!;
    onSection?.(row.label, id);
  };
  // On a phone the nav is one scrolling row; keep the page you're on in view (Developers sits past Billing).
  const nav = useRef<HTMLElement>(null);
  useEffect(() => { nav.current?.querySelector<HTMLElement>(".is-on")?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [section]);
  if (developer === "mcp-consent") return <div className="c-view"><McpConsent /></div>;
  const item = (x: (typeof SECTIONS)[number]) => <li key={x.id}>{x.href
    ? <a className="i-nav__item" href={x.href}>{x.label}<Icon name="arrow" size={12} /></a>
    : <button type="button" className={cx("i-nav__item", x.id === section && "is-on")} aria-current={x.id === section ? "page" : undefined} onClick={() => go(x.id)}>{x.label}</button>}</li>;
  return (
    <div className="c-view i-settings">
      <nav ref={nav} className="i-nav" aria-label="Settings">
        <span className="i-nav__title">Settings</span>
        <ul>{SECTIONS.filter((x) => !x.group).map(item)}</ul>
        <span className="i-nav__title i-nav__group" id="i-nav-dev">Developers</span>
        <ul aria-labelledby="i-nav-dev">{SECTIONS.filter((x) => x.group === "dev").map(item)}</ul>
      </nav>
      <div className="i-main">
        {section === "integrations" ? <Integrations key={state ?? (liveIntegrations ? "api" : liveIntegrations === null ? "api-loading" : "sample")} state={state} live={liveIntegrations} onChange={liveIntegrations && !state ? onIntegration : undefined} loadDetail={liveIntegrations && !state ? loadDetail : undefined} names={names} last={liveLast} onSaveMapping={onSaveMapping} />
          : section === "profile" ? <ProfileSettings />
          : section === "workspace" ? <WorkspaceSettings />
          : section === "team" ? <TeamView key={state ?? (liveTeam ? `api-${members?.length ?? "loading"}-${invites?.length ?? 0}` : "live")} members={teamMembers} invites={teamInvites} session={session} now={now} load={teamLoading ? "loading" : undefined} defaultInvite={state === "team-invite"}
              onInvite={liveTeam && teamApi ? async (emails, role) => { if (!(await teamApi.invite(emails, role))) throw new Error("The invites weren’t saved."); } : undefined} />
          : section === "billing" ? (data && !state ? <BillingConnected key="live" /> : <BillingView key={state ?? "review"} load={state === "billing-loading" ? "loading" : undefined} />)
          : section === "sms" ? <SmsPlayground />
          : isDev(section) ? <Developer key={`${section}-${developer ?? "live"}-${liveKeys?.length ?? "s"}-${liveConnections?.length ?? "s"}`} section={section} state={developer && sectionOf(developer) === section ? developer : undefined} keys={developer ? null : liveKeys} connections={developer ? null : liveConnections} keysApi={keysApi} viewer={viewer} onDisconnect={onDisconnect} check={mcpCheck} />
          : <div className="i-later"><h2>{s.label}</h2><p className="c-muted">{s.note}. Designed in a later milestone; this keeps its place in Settings.</p></div>}
      </div>
    </div>
  );
}

/** Signed in: an integration's detail (GET /integrations/:id), then its log, as the page reads them. */
export type LoadDetail = (id: IntegrationId) => Promise<IntegrationDetail | null>;

export function Integrations({ state, live: api, onChange, loadDetail, names, onSaveMapping, last }: { state?: SettingsReviewState; live?: Record<IntegrationId, Connection> | null;
  /** Signed in: PUT Phoenix's mapping. */ onSaveMapping?: (id: IntegrationId, rows: MapRow[]) => Promise<boolean>;
  /** Signed in: each integration's newest log row, for the list (null: nothing yet). */ last?: Partial<Record<IntegrationId, LastEvent | null>>;
  /** Signed in: store a connect or a disconnect. The dialogs' in-between states stay on the screen. */ onChange?: (id: IntegrationId, status: "off" | "connected") => Promise<boolean> | void;
  loadDetail?: LoadDetail;
  /** Member names by id, for "Connected by" when it wasn't you. */ names?: Record<string, string> }) {
  const toast = useToast();
  const seed = useMemo<SettingsSeed>(() => (state || api === undefined ? settingsSeed(state)
    : api ? { conn: api, tab: "overview" } : { conn: { cal: "off", phoenix: "off", autosend: "off" }, tab: "overview", load: "loading" }), [api, state]);
  const app = useAppData();
  // M14: the live detail page. Review states seed it (placeholders, times against the real clock); signed in it
  // comes from loadDetail, and until that answers the page shows its skeleton, never sample content.
  const [live] = useState(() => liveSeed(state, new Date()));
  const [details, setDetails] = useState<Partial<Record<IntegrationId, IntegrationDetail>>>(() => (live ? { [live.open]: live.detail } : {}));
  const signedIn = !!loadDetail && !state;
  const [load, setLoad] = useState(seed.load);
  const [conn, setConn] = useState(seed.conn);
  const [open, setOpen] = useState<IntegrationId | undefined>(live?.open ?? seed.open);
  const [tab, setTab] = useState<Tab>(live?.tab ?? seed.tab);
  // Signed in: the open integration's detail, fetched once per visit (and again after a connect, disconnect or reconnect).
  const [failed, setFailed] = useState<IntegrationId | undefined>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!signedIn || !open || !loadDetail || details[open]) return;
    let gone = false;
    void loadDetail(open).then((d) => { if (gone) return; if (d) setDetails((m) => ({ ...m, [open]: d })); else setFailed(open); });
    return () => { gone = true; };
  }, [signedIn, open, loadDetail, details, retry]);
  const forget = (id: IntegrationId) => { setFailed(undefined); setDetails((m) => { const n = { ...m }; delete n[id]; return n; }); };
  const reconnect = async (id: IntegrationId) => {
    if (await onChange?.(id, "connected") === false) { toast({ tone: "error", children: `Couldn’t reconnect ${integration(id).name}. Try again.` }); forget(id); return; }
    set(id, "connected"); forget(id);
    toast({ tone: "success", children: `${integration(id).name} reconnected` });
  };
  const [dialog, setDialog] = useState<DialogKind | undefined>(seed.dialog);
  const set = (id: IntegrationId, c: Connection) => setConn((m) => ({ ...m, [id]: c }));
  const connect = (id: IntegrationId) => setDialog(id === "cal" ? "connect-cal" : id === "phoenix" ? "connect-erp" : "connect-autosend");
  // Signed in, nothing has happened yet on a new connection: the toast says only that it's connected.
  const done = (id: IntegrationId) => { set(id, "connected"); void onChange?.(id, "connected"); if (signedIn) forget(id); setDialog(undefined); toast({ tone: "success", children: `${integration(id).name} connected`, meta: signedIn ? undefined : id === "cal" ? "1 booking caught up" : id === "phoenix" ? "test deal delivered" : "2 journeys on" }); };
  const fix = (id: IntegrationId) => { if (conn[id] === "reauth") { set(id, "connecting"); setDialog("connecting"); } else if (id === "phoenix") setDialog("connect-erp"); };

  if (app && !state) return <div className="i-page"><div className="i-head"><h2>Integrations</h2><p>Self-service connections are not available yet. Use the demo mailbox in Unibox for approved email conversations.</p></div>
    <ul className="i-list" aria-label="Integrations">{INTEGRATIONS.map(i => <li className="i-row" key={i.id}><span>{i.name}</span><span className="c-faint">{api === null ? "Loading status…" : api?.[i.id] === "connected" ? "Recorded as connected" : "Not connected"}</span></li>)}</ul>
  </div>;

  if (load === "loading") return (
    <div className="i-page" aria-busy="true"><div className="i-head"><h2>Integrations</h2></div>
      <span className="u-sr" role="status">Loading integrations</span>
      <ul className="i-list" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="i-row"><Skeleton w={32} h={32} r={8} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Skeleton w={140} /><Skeleton w="70%" h={8} /></div><Skeleton w={84} h={20} r={5} /></li>)}</ul></div>
  );
  if (load === "error") return (
    <div className="i-page i-page--center"><ErrorState title="Couldn’t load integrations" detail="GET /api/v1/integrations · 503"
      actions={<Button variant="primary" onClick={() => setLoad(undefined)}><Icon name="refresh" />Try again</Button>}>
      Nothing was disconnected. Bookings, deals and follow-ups keep flowing; this is only the page failing to load.</ErrorState></div>
  );

  return (
    <>
      {open && signedIn && failed === open ? <div className="i-page i-page--center"><ErrorState title={`Couldn’t load ${integration(open).name}`} detail={`GET /api/v1/integrations/${open}`}
          actions={<Button variant="primary" onClick={() => { setFailed(undefined); setRetry((n) => n + 1); }}><Icon name="refresh" />Try again</Button>}>
          Nothing was disconnected. This is only the page failing to load.</ErrorState></div>
        : open && (live || signedIn) ? <LiveIntegrationPage key={`${open}:${details[open] ? "ready" : "loading"}`} id={open} detail={details[open] ?? "loading"} tab={tab} setTab={setTab} local={!!live}
          people={{ meId: app?.me.user.id, meName: app?.person.name, names }} onBack={() => { setOpen(undefined); setTab("overview"); }} onDisconnect={() => setDialog("disconnect")}
          onReconnect={signedIn ? () => void reconnect(open) : undefined} onSaveMapping={signedIn && onSaveMapping ? (rows) => onSaveMapping(open, rows) : undefined} />
        : open ? <IntegrationPage id={open} conn={conn[open]} tab={tab} setTab={setTab} onBack={() => { setOpen(undefined); setTab("overview"); }}
          onFix={() => fix(open)} onDisconnect={() => setDialog("disconnect")} mapErrors={seed.mapErrors} logOpen={seed.logOpen} />
        : <Home conn={conn} last={signedIn ? last ?? {} : undefined} onOpen={(id) => { setOpen(id); setTab("overview"); }} onConnect={connect} onFix={fix} />}
      <ConnectCal open={dialog === "connect-cal"} onClose={() => setDialog(undefined)} onContinue={() => { set("cal", "connecting"); setDialog("connecting"); }} />
      <Connecting open={dialog === "connecting"} onClose={() => { setDialog(undefined); set("cal", conn.cal === "connecting" ? "off" : conn.cal); }} onBack={() => done("cal")} />
      <ConnectErp open={dialog === "connect-erp" || dialog === "connect-erp-failed"} failed={dialog === "connect-erp-failed"} onClose={() => setDialog(undefined)} onConnect={() => done("phoenix")} />
      <ConnectAutoSend open={dialog === "connect-autosend"} onClose={() => setDialog(undefined)} onConnect={() => done("autosend")} />
      <Disconnect open={dialog === "disconnect"} id={open ?? "phoenix"} onClose={() => setDialog(undefined)}
        onConfirm={() => { const id = open ?? "phoenix"; set(id, "off"); void onChange?.(id, "off"); if (signedIn) forget(id); setDialog(undefined); setOpen(undefined); toast({ children: `${integration(id).name} disconnected`, meta: "nothing in it was deleted", action: { label: "Reconnect", onClick: () => connect(id) } }); }} />
    </>
  );
}

/* ------------------------------------------------------------ the list */
function Home({ conn, last, onOpen, onConnect, onFix }: { conn: Record<IntegrationId, Connection>; last?: Partial<Record<IntegrationId, LastEvent | null>>; onOpen: (id: IntegrationId) => void; onConnect: (id: IntegrationId) => void; onFix: (id: IntegrationId) => void }) {
  const none = Object.values(conn).every((c) => c === "off");
  const now = useNow();
  // Signed in, the list reads the real last event (or nothing yet), and a problem line only says what's known.
  const lastLine = (id: IntegrationId, sample: string) => {
    if (!last) return <span className="c-mono i-row__last">Last: {sample}</span>;
    const e = last[id];
    return e ? <span className="c-mono i-row__last">Last: {e.event} · {agoLabel(new Date(e.at), now)}</span> : <span className="c-faint i-row__last">{LIVE_COPY.emptyTitle}</span>;
  };
  return (
    <div className="i-page">
      <div className="i-head"><h2>Integrations</h2>
        <p>Corral hands a lead on when it’s ready: the meeting through Cal.com, the deal to Phoenix ERP, the follow-up through AutoSend. Cold email never leaves your mailbox pool.</p></div>
      <Flow conn={conn} />
      {none && <Banner tone="info" icon="bolt" title="Nothing is connected yet.">Corral still finds, writes and replies without them. Start with Cal.com: it’s what turns a reply into a meeting, and the others hang off the meeting.</Banner>}
      <ul className="i-list" aria-label="Integrations">
        {INTEGRATIONS.map((i) => {
          const c = conn[i.id]; const h = healthOf(c); const p = PROBLEM[i.id];
          return (
            <li key={i.id} className={cx("i-row", h.needsYou && `is-${h.tone}`)}>
              <Tile label={i.tile} />
              <div className="i-row__txt">
                <span className="i-row__top"><span className="c-strong">{i.name}</span><span className="c-faint">{i.role}</span><Pill tone={h.tone}>{h.word}</Pill></span>
                <span className="i-row__what">{i.what}</span>
                {c !== "off" && c !== "connecting" && lastLine(i.id, i.last)}
                {h.needsYou && p && !last && <span className={cx("i-row__problem", `is-${h.tone}`)}><Icon name="alert" size={12} /><span><b>{p.title}</b> {p.body}</span></span>}
              </div>
              <div className="i-row__acts">
                {c === "off" ? <Button variant={i.id === "cal" && none ? "primary" : "default"} onClick={() => onConnect(i.id)}>Connect</Button>
                  : c === "connecting" ? <span className="i-row__busy"><Spinner />Connecting…</span>
                  : h.needsYou ? <><Button variant="primary" onClick={() => onFix(i.id)}>{p?.action ?? "Fix"}</Button><Button variant="quiet" onClick={() => onOpen(i.id)} aria-label={`Open ${i.name}`}>Open</Button></>
                  : <Button onClick={() => onOpen(i.id)} aria-label={`Manage ${i.name}`}>Manage</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="i-foot c-faint"><Icon name="check" size={12} />Everything in and out is signed and logged. Replays are safe: each push carries an idempotency key, so Phoenix can’t open the same deal twice.</p>
    </div>
  );
}

/** How a lead is handed on: reply → meeting → deal → follow-up, each with the state of its connection. */
function Flow({ conn }: { conn: Record<IntegrationId, Connection> }) {
  const steps: [string, string, string, Connection | "on"][] = [
    ["Reply", "Unibox", "Cold email and replies, from your mailbox pool", "on"],
    ["Meeting", "Cal.com", "A booking stops the sequence", conn.cal],
    ["Deal", "Phoenix ERP", "Opened at Discovery, kept in step", conn.phoenix],
    ["Follow-up", "AutoSend", "Reminders and case studies, never cold", conn.autosend],
  ];
  return (
    <ol className="i-flow" aria-label="How a lead is handed on">
      {steps.map(([what, who, line, c], i) => {
        const tone = c === "on" ? "positive" : healthOf(c).tone;
        return <li key={what} className={cx("i-flow__step", `is-${tone}`)}><span className="i-flow__n">{i + 1}</span>
          <span className="i-flow__txt"><span className="c-strong">{what}</span><span className="i-flow__who"><span className={cx("i-dot", `is-${tone}`)} aria-hidden="true" />{who === "Cal.com" && <img className="h-logo h-logo--cal is-sm" src="/assets/cal-logo.svg" alt="" />}{who === "AutoSend" && <img className="h-logo h-logo--as" src="/assets/AutosendLogoSquareIndigo.svg" alt="" />}{who}{c !== "on" && c !== "connected" && <span className="u-sr"> ({healthOf(c).word})</span>}</span><span className="c-faint">{line}</span></span></li>;
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ one integration */
function IntegrationPage({ id, conn, tab, setTab, onBack, onFix, onDisconnect, mapErrors, logOpen }: {
  id: IntegrationId; conn: Connection; tab: Tab; setTab: (t: Tab) => void; onBack: () => void; onFix: () => void; onDisconnect: () => void; mapErrors?: boolean; logOpen?: string;
}) {
  const i = integration(id); const h = healthOf(conn); const p = PROBLEM[id];
  const problems = LOGS[id].filter(isProblem).length;
  const tabs = [{ id: "overview", label: "Overview" }, ...(id === "phoenix" ? [{ id: "mapping", label: "Field mapping" }] : []), { id: "logs", label: "Logs", count: conn === "error" && problems ? problems : undefined }, { id: "scopes", label: "Permissions" }];
  return (
    <div className="i-page i-detail">
      <button type="button" className="i-back" onClick={onBack}><Icon name="back" />Integrations</button>
      <header className="i-dhead"><Tile label={TILE[id]} />
        <div className="i-dhead__t"><h2>{i.name}</h2><span className="i-dhead__sub"><span className="c-faint">{i.role}</span><Pill tone={h.tone}>{h.word}</Pill></span></div>
        <div className="i-dhead__acts">{h.needsYou && p && <Button variant="primary" onClick={onFix}>{p.action}</Button>}
          {conn !== "off" && <Button variant="quiet" className="i-danger" onClick={onDisconnect}>Disconnect</Button>}</div>
      </header>
      {h.needsYou && p && <Banner tone={conn === "error" ? "error" : "caution"} title={p.title}>{p.body}</Banner>}
      <div className="i-tabs"><Tabs label={`${i.name} sections`} tabs={tabs} value={tab} onChange={(v) => setTab(v as Tab)} /></div>
      {tab === "overview" && <Overview id={id} />}
      {tab === "mapping" && <Mapping broken={mapErrors} />}
      {tab === "logs" && <Logs id={id} initialOpen={logOpen} />}
      {tab === "scopes" && <Scopes id={id} />}
    </div>
  );
}

function Overview({ id }: { id: IntegrationId }) {
  const i = integration(id);
  return (
    <div className="i-over">
      <p className="i-over__what">{i.what}</p>
      <dl className="i-facts">{i.account.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={cx(/https|whsec|BOOKING|@/.test(v) && "c-mono")}>{v}</dd></div>)}</dl>
      <section className="i-sec"><h3>What Corral does with it</h3><ul className="i-does">{i.does.map((d) => <li key={d}><Icon name="check" size={12} />{d}</li>)}</ul></section>
      {id === "phoenix" && <section className="i-sec"><h3>Stages</h3><StageMap /></section>}
      {id === "autosend" && <TwoEngines />}
    </div>
  );
}

function StageMap() {
  return (
    <table className="i-table i-stages"><caption className="u-sr">Corral’s meeting stages and the Phoenix stage each sets</caption>
      <thead><tr><th scope="col">When the meeting is</th><th scope="col">Phoenix stage</th><th scope="col">The deal</th></tr></thead>
      <tbody>{STAGE_MAP.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className="c-mono">{b}</td><td className="c-faint">{c}</td></tr>)}
        <tr><td>Won or Lost in Phoenix</td><td className="c-mono">Won · Lost</td><td className="c-faint">comes back to Corral: every sequence for that company stops</td></tr></tbody>
    </table>
  );
}

/** AutoSend’s role: the second engine. Cold stays one-to-one in the pool; what follows a reply or booking goes here. */
function TwoEngines() {
  return (
    <section className="i-sec"><h3>Two engines, never mixed</h3>
      <div className="i-engines">
        <div className="i-engine"><span className="c-strong">Your mailbox pool</span><span className="c-faint">Cold email and every reply</span>
          <ul><li>One person to one person, plain text</li><li>No unsubscribe header, no tracking images</li><li>30–35 a day per mailbox</li></ul></div>
        <Icon name="arrow" size={14} />
        <div className="i-engine is-as"><span className="c-strong i-engine__name"><img className="h-logo h-logo--as" src="/assets/AutosendLogoSquareIndigo.svg" alt="" />AutoSend · mail.coldtrace.io</span><span className="c-faint">After they reply or book</span>
          <ul><li>Before your call · one email, 24 h before</li><li>After your call · three emails over ten days</li><li>Unsubscribe link, and it stops Corral too</li></ul></div>
      </div>
      <p className="c-faint i-engines__why">Why: mail that looks like marketing, sent from a cold mailbox, teaches Gmail and Outlook to file that mailbox as promotions. Keeping them apart protects both.</p>
    </section>
  );
}

/* ------------------------------------------------------------ logs */
function Logs({ id, initialOpen }: { id: IntegrationId; initialOpen?: string }) {
  const toast = useToast();
  const [f, setF] = useState<LogFilter>("all");
  const [open, setOpen] = useState<string | undefined>(initialOpen);
  const rows = filterLogs(LOGS[id], f);
  const n = LOGS[id].filter(isProblem).length;
  return (
    <div className="i-logs">
      <div className="i-logs__bar"><Tabs variant="pill" label="Show" value={f} onChange={(v) => setF(v as LogFilter)}
        tabs={[{ id: "all", label: "All" }, { id: "problems", label: "Problems", count: n || undefined }, { id: "in", label: `From ${integration(id).name}` }, { id: "out", label: "From Corral" }]} />
        <span className="c-faint i-logs__keep">Kept 30 days · secrets never logged</span></div>
      {rows.length === 0 ? <p className="i-logs__none c-muted">Nothing here.</p> : (
        <table className="i-table i-log"><caption className="u-sr">{integration(id).name} log</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">About</th><th scope="col">Result</th><th scope="col"><span className="u-sr">Details</span></th></tr></thead>
          <tbody>{rows.map((r) => <LogLine key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? undefined : r.id)}
            onReplay={() => toast({ icon: "refresh", children: `Replaying ${r.event}`, meta: "same idempotency key, so it can’t land twice" })} />)}</tbody>
        </table>)}
    </div>
  );
}
function LogLine({ r, open, onToggle, onReplay }: { r: LogRow; open: boolean; onToggle: () => void; onReplay: () => void }) {
  const id = useId();
  const tone = r.result === "ok" ? "positive" : r.result === "duplicate" ? "neutral" : "negative";
  return (
    <>
      <tr className={cx("i-log__row", open && "is-open", isProblem(r) && "is-bad")}>
        <td className="c-mono i-log__at">{r.at}</td>
        <td><span className="i-log__ev"><Icon name={r.dir === "in" ? "down" : "up"} size={11} /><span className="c-mono">{r.event}</span></span><span className="u-sr">{r.dir === "in" ? " (incoming)" : " (outgoing)"}</span></td>
        <td className="i-log__sub">{r.subject}</td>
        <td><span className="i-log__res"><Pill tone={tone}>{RESULT_WORD[r.result]}</Pill><span className="c-mono c-faint">{r.code}{r.ms !== undefined ? ` · ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}` : ""}</span>{r.attempt && <span className="c-faint">{r.attempt}</span>}</span></td>
        <td className="i-log__more">{r.detail && <button type="button" className="c-iconbtn" aria-expanded={open} aria-controls={id} aria-label={`${open ? "Hide" : "Show"} details: ${r.event}, ${r.at}`} onClick={onToggle}><Icon name={open ? "up" : "down"} size={12} /></button>}</td>
      </tr>
      {open && r.detail && <tr className="i-log__detail" id={id}><td colSpan={5}>
        {r.detail.why && <p className="i-log__why"><Icon name="alert" size={12} />{r.detail.why}</p>}
        <div className="i-log__io"><div><span className="i-log__lbl">Sent</span><pre className="c-mono">{r.detail.request}</pre></div><div><span className="i-log__lbl">Came back</span><pre className="c-mono">{r.detail.response}</pre></div></div>
        {isProblem(r) && r.dir === "out" && <div className="i-log__acts"><Button onClick={onReplay}><Icon name="refresh" />Replay</Button><span className="c-faint">Replays with <span className="c-mono">{r.detail.key}</span>, so Phoenix can’t open it twice.</span></div>}
      </td></tr>}
    </>
  );
}

/* ------------------------------------------------------------ Phoenix field mapping */
function Mapping({ broken }: { broken?: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<MapRow[]>(broken ? MAPPING_BROKEN : MAPPING);
  const issues = mappingIssues(rows, ERP_FIELDS, CORRAL_FIELDS);
  const payload = dealPayload(rows, GRACE_VALUES, ERP_FIELDS);
  const pick = (erp: string, from: string) => setRows((rs) => rs.map((r) => (r.erp === erp ? { erp, from: from === "none" ? undefined : from } : r)));
  const opts = [{ value: "none", label: "Nothing" }, ...CORRAL_FIELDS.map((c) => ({ value: c.id, label: c.label, meta: c.type }))];
  return (
    <div className="i-map">
      <p className="c-muted i-map__lede">What goes into each Phoenix field when Corral opens a deal. The last column is what Phoenix would get for Grace Holloway (Nyota Beverages).</p>
      {issues.length > 0 && <Banner tone="error" title={`${issues.length} ${issues.length === 1 ? "field needs" : "fields need"} you before deals can go.`}>Deals wait until it’s fixed; nothing is dropped. {issues.filter((x) => x.kind === "unmapped").length ? "Phoenix added a required field since you last saved." : ""}</Banner>}
      <table className="i-table i-maptable"><caption className="u-sr">Phoenix field mapping</caption>
        <thead><tr><th scope="col">Phoenix field</th><th scope="col">Filled from</th><th scope="col">For Grace</th></tr></thead>
        <tbody>{ERP_FIELDS.map((f) => {
          const r = rows.find((x) => x.erp === f.id); const iss = issues.filter((x) => x.erp === f.id);
          const v = r?.from ? GRACE_VALUES[r.from] : undefined;
          return (
            <tr key={f.id} className={cx(iss.length > 0 && "is-bad")}>
              <th scope="row"><span className="i-map__f">{f.label}{f.required && <span className="i-req">Required</span>}</span><span className="c-mono c-faint">{f.id} · {f.type}</span></th>
              <td><Select label={`Fill ${f.label} from`} value={r?.from ?? "none"} onChange={(x) => pick(f.id, x)} options={opts} width={260} menuWidth={280} />
                {iss.map((x) => <span key={x.kind} className="i-map__issue"><Icon name="alert" size={12} />{x.text}</span>)}</td>
              <td className="c-mono i-map__v">{v === undefined ? <span className="c-faint">—</span> : String(v)}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <section className="i-sec"><h3>What Phoenix gets</h3>
        <pre className="c-mono i-payload" aria-label="Payload preview">{JSON.stringify(payload.body, null, 2)}</pre>
        {payload.missing.length > 0 && <p className="i-map__issue"><Icon name="alert" size={12} />Missing: <span className="c-mono">{payload.missing.join(", ")}</span>. Phoenix would refuse this deal.</p>}
      </section>
      <div className="i-map__foot"><Button variant="primary" disabled={issues.length > 0} onClick={() => toast({ tone: "success", children: "Mapping saved", meta: "the next deal uses it" })}>Save mapping</Button>
        <Button variant="quiet" onClick={() => toast({ icon: "send", children: "Test deal sent to Phoenix", meta: "marked test: true, Phoenix throws it away" })}>Send a test deal</Button>
        {issues.length > 0 && <span className="c-faint">Fix {issues.length === 1 ? "the field" : `the ${issues.length} fields`} above to save.</span>}</div>
    </div>
  );
}

/* ------------------------------------------------------------ permissions */
function Scopes({ id, compact }: { id: IntegrationId; compact?: boolean }) {
  const s = SCOPES[id];
  return (
    <div className={cx("i-scopes", compact && "is-compact")}>
      <div className="i-scopes__cols">
        <section><h3>Corral can</h3><ul className="i-can">{s.can.map(([a, b]) => <li key={a}><Icon name="check" size={12} /><span><span className="c-strong">{a}</span><span className="c-faint">{b}</span></span></li>)}</ul></section>
        <section><h3>Corral never</h3><ul className="i-never">{s.never.map((a) => <li key={a}><Icon name="x" size={12} /><span>{a}</span></li>)}</ul></section>
      </div>
      {!compact && <><section className="i-sec"><h3>Where the key lives</h3><p className="i-scopes__p">{s.key}</p></section><p className="c-faint i-scopes__p">{s.revoke}</p></>}
    </div>
  );
}

/* ------------------------------------------------------------ dialogs */
function ConnectCal({ open, onClose, onContinue }: { open: boolean; onClose: () => void; onContinue: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={520} title={<BrandLockup brand="cal">Connect Cal.com</BrandLockup>} description="You’ll sign in on cal.com and come back here. Corral asks for the least it needs."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={onContinue}>Continue to Cal.com<Icon name="arrow" size={12} /></Button></>}>
      <Scopes id="cal" compact />
      <p className="i-dnote"><Icon name="check" size={12} />Corral adds one webhook to your Cal.com account, signed with a secret only the two of you know. Bookings on other event types aren’t sent.</p>
    </Dialog>
  );
}
function Connecting({ open, onClose, onBack }: { open: boolean; onClose: () => void; onBack: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={440} title={<BrandLockup brand="cal">Waiting for Cal.com</BrandLockup>}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button onClick={onBack}>I’m back</Button></>}>
      <p className="i-wait" role="status"><Spinner size={16} />Finish signing in on the cal.com tab. This closes on its own when you’re back.</p>
      <p className="c-faint i-dnote">Didn’t open? <a className="c-link" href="https://cal.com" target="_blank" rel="noreferrer">Open cal.com again</a></p>
    </Dialog>
  );
}
function Copy({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  return <TextInput readOnly value={value} aria-label={label} className="i-copy" suffix={<button type="button" className="c-link k-linkbtn" onClick={() => toast({ icon: "check", children: `${label} copied` })}>Copy</button>} />;
}
function ConnectErp({ open, failed, onClose, onConnect }: { open: boolean; failed?: boolean; onClose: () => void; onConnect: () => void }) {
  const [back, setBack] = useState(true);
  return (
    <Dialog open={open} onClose={onClose} width={560} title="Connect Phoenix ERP" description="Corral sends each deal to an address in Phoenix, signed, so Phoenix knows it came from Corral and hasn’t been changed."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button>{failed && <Button><Icon name="refresh" />Send the test again</Button>}<Button variant="primary" disabled={failed} onClick={onConnect}>Connect Phoenix ERP</Button></>}>
      <FormField label="Phoenix address for Corral" help="From Phoenix: Settings → Webhooks → Corral. https only."><TextInput defaultValue={ERP_URL} className="c-mono" /></FormField>
      <FormField label="Signing secret" help="Made by Corral just now. Paste it into Phoenix as PHOENIX_ERP_SECRET. It’s shown this once."><Copy value="whsec_3kP09aLq9f2c" label="Signing secret" /></FormField>
      <Checkbox checked={back} onChange={setBack} label="Let Phoenix tell Corral when a deal is won or lost" description="Corral stops every sequence for that company. Phoenix posts to https://api.corral.app/hooks/phoenix/ws_coldtrace with the same secret." />
      <div className={cx("i-test", failed ? "is-bad" : "is-ok")} role="status">
        <Icon name={failed ? "alert" : "check"} size={13} />
        {failed ? <div><b>The test deal failed: Phoenix answered 401 invalid_signature.</b>
          <ul><li>Is the secret pasted exactly, including <span className="c-mono">whsec_</span>?</li><li>Phoenix reads it at start-up: restart the Phoenix app after pasting.</li><li>Is the Phoenix server’s clock right? Corral’s timestamp has to be within five minutes.</li></ul></div>
          : <div><b>Test deal delivered: 200 in 0.4 s.</b> Phoenix checked the signature and threw the test away (it’s marked <span className="c-mono">test: true</span>).</div>}
      </div>
    </Dialog>
  );
}
function ConnectAutoSend({ open, onClose, onConnect }: { open: boolean; onClose: () => void; onConnect: () => void }) {
  const [project, setProject] = useState("coldtrace");
  const [sender, setSender] = useState(AUTOSEND_SENDER);
  const [before, setBefore] = useState(true);
  const [after, setAfter] = useState(true);
  return (
    <Dialog open={open} onClose={onClose} width={520} title={<BrandLockup brand="autosend">Connect AutoSend</BrandLockup>} description="Signed in to AutoSend as tomas@coldtrace.io. Pick where Corral hands people over."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={onConnect}>Connect AutoSend</Button></>}>
      <FormField label="Project"><Select label="Project" value={project} onChange={setProject} options={[{ value: "coldtrace", label: "ColdTrace", meta: "2 senders" }, { value: "gateway", label: "ColdTrace Gateway", meta: "1 sender" }]} /></FormField>
      <FormField label="Send as" help="A verified sender on AutoSend’s domain, never one of your cold mailboxes."><Select label="Send as" value={sender} onChange={setSender} options={[{ value: AUTOSEND_SENDER, label: AUTOSEND_SENDER, meta: "verified" }, { value: "hello@mail.coldtrace.io", label: "hello@mail.coldtrace.io", meta: "verified" }]} /></FormField>
      <div className="i-journeys" role="group" aria-label="Journeys Corral starts">
        <Checkbox checked={before} onChange={setBefore} label="Before your call" description="When a meeting is booked (event meeting_booked): one email 24 hours before." />
        <Checkbox checked={after} onChange={setAfter} label="After your call" description="When the meeting ends (event meeting_ended): three emails over ten days." />
      </div>
      <p className="i-dnote"><Icon name="check" size={12} />Only people who replied or booked go to AutoSend. Cold email stays in your mailbox pool. <button type="button" className="c-link k-linkbtn">Use an API key instead</button></p>
    </Dialog>
  );
}
const LOSE: Record<IntegrationId, string[]> = {
  phoenix: ["Corral stops opening and updating deals. Anything waiting to go won’t be sent.", "Deals already in Phoenix stay exactly as they are.", "Won and lost stop coming back, so Corral won’t stop a sequence when a deal closes.", "The signing secret is deleted. Reconnecting makes a new one."],
  cal: ["New bookings stop reaching Corral: sequences won’t stop when someone books, so they may get a follow-up.", "Your link stays in drafts but Corral can’t see who used it.", "Meetings already booked stay on your calendar."],
  autosend: ["Nobody new goes to Before your call or After your call.", "People already in a journey finish it in AutoSend.", "Unsubscribes from AutoSend stop reaching Corral."],
};
function Disconnect({ open, id, onClose, onConfirm }: { open: boolean; id: IntegrationId; onClose: () => void; onConfirm: () => void }) {
  const n = integration(id).name;
  return (
    <Dialog open={open} onClose={onClose} tone="danger" width={480} title={id === "phoenix" ? `Disconnect ${n}?` : <BrandLockup brand={id}>{`Disconnect ${n}?`}</BrandLockup>} description="You can connect it again at any time. Nothing in it is deleted."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" className="i-btn-danger" onClick={onConfirm}>Disconnect {n}</Button></>}>
      <ul className="i-lose">{LOSE[id].map((l) => <li key={l}>{l}</li>)}</ul>
    </Dialog>
  );
}

export { Scopes as IntegrationScopes, Logs as IntegrationLogs, Mapping as FieldMapping, Flow as HandoffFlow };
