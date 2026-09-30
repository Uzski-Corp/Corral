"use client";
import { useCallback, useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { Avatar, Kbd, Monogram, cx } from "./primitives";
import { DropdownMenu, Tooltip, type MenuEntry } from "./Overlays";
import { Skeleton } from "./States";

export type ViewId = "unibox" | "companies" | "discovery" | "contacts" | "segments" | "sequences" | "products" | "knowledge" | "settings";
export const APP_NAV: { id: ViewId; label: string; icon: IconName; count?: string; keys: string }[] = [
  { id: "unibox", label: "Unibox", icon: "inbox", count: "7", keys: "G I" },
  { id: "companies", label: "Companies", icon: "building", keys: "G C" },
  { id: "discovery", label: "Discovery", icon: "globe", keys: "G D" },
  { id: "contacts", label: "Contacts", icon: "users", keys: "G P" },
  { id: "segments", label: "Segments", icon: "layers", keys: "G S" },
  { id: "sequences", label: "Sequences", icon: "seq", keys: "G Q" },
  { id: "products", label: "Products", icon: "box", keys: "G R" },
  { id: "knowledge", label: "Knowledge base", icon: "book", keys: "G K" },
  { id: "settings", label: "Settings", icon: "gear", keys: "G ," },
];
export const SAVED_SEGMENTS: [string, number][] = [["F&B · East Africa", 13], ["Logistics · Fit > 70", 12], ["Replied, no meeting", 5]];

/**
 * The signed-in person and workspace. `undefined` renders Bau's sample person (styleguide and
 * design review); "loading" renders skeletons while the session is confirmed; "unavailable" is the
 * static row shown when the session check failed (API down), next to <SessionUnavailable>.
 */
export type ShellAccountProp = { name: string; email: string; role: string; avatarUrl: string | null; workspace: string } | "loading" | "unavailable" | undefined;

/* ------------------------------------------------------------ Workspace switcher */
export const WorkspaceTile = ({ letter = "C", size = 20, tone = "ink" }: { letter?: string; size?: number; tone?: "ink" | "blue" | "sand" | "muted" }) =>
  <span className={cx("c-wstile", `c-wstile--${tone}`)} style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">{letter}</span>;

const initial = (s: string) => (s.trim()[0] ?? "C").toUpperCase();

export function WorkspaceSwitcher({ collapsed, defaultOpen, account, onSignOut }: { collapsed?: boolean; defaultOpen?: boolean; account?: ShellAccountProp; onSignOut?: () => void }) {
  const router = useRouter();
  const signOut = onSignOut ?? (() => router.push("/sign-in"));
  const live = typeof account === "object";
  const name = live ? account.workspace : account === "loading" ? "" : account === "unavailable" ? "Workspace" : "ColdTrace";
  const tile = <WorkspaceTile letter={live ? initial(account.workspace) : account === "unavailable" ? "" : undefined} tone={account === "unavailable" ? "muted" : "ink"} />;
  // Other workspaces and member counts are sample data; the API has no workspace list yet.
  const workspaces: MenuEntry[] = live
    ? [{ label: account.workspace, lead: tile, checked: true }]
    : [{ label: "ColdTrace", lead: <WorkspaceTile />, meta: "3 members", checked: true }, { label: "Pwani Fresh pilot", lead: <WorkspaceTile letter="P" tone="sand" />, meta: "Guest" }];
  return (
    <DropdownMenu label="Workspaces" width={248} defaultOpen={defaultOpen} items={[
      ...(account === "loading" || account === "unavailable" ? [] : [{ heading: live ? account.email : "tomas@coldtrace.io" }]),
      ...workspaces,
      "separator",
      { label: "Workspace settings", icon: "gear", kbd: "G ," },
      { label: "Invite teammates", icon: "users", onSelect: () => router.push("/onboarding?step=5") },
      { label: "Create a workspace", icon: "plus", onSelect: () => router.push("/onboarding") },
      "separator",
      { label: "Sign out", icon: "logout", onSelect: signOut },
    ]} trigger={(p) => (
      <button type="button" className={cx("c-ws", collapsed && "is-collapsed")} aria-label="Switch workspace" aria-busy={account === "loading" || undefined} {...p}>
        {account === "loading" ? <Skeleton w={20} h={20} r={5} /> : tile}<span className="c-ws__name">{account === "loading" ? <Skeleton w={72} /> : name}</span><Icon name="down" size={12} />
      </button>
    )} />
  );
}

/* ------------------------------------------------------------ Side nav */
function NavRow({ icon, label, count, active, collapsed, onClick, kbd, dot }: { icon?: IconName; label: string; count?: string; active?: boolean; collapsed?: boolean; onClick?: () => void; kbd?: string; dot?: boolean }) {
  const b = (
    <button type="button" className={cx("c-nav", active && "is-active")} aria-current={active ? "page" : undefined} onClick={onClick} aria-label={collapsed ? label : undefined}>
      <span className="c-nav__ic">{icon && <Icon name={icon} />}<span className="c-nav__t">{label}</span></span>
      {kbd ? <Kbd>{kbd}</Kbd> : count && <span className="c-count">{count}</span>}
      {dot && <span className="c-nav__dot" />}
    </button>
  );
  return collapsed ? <Tooltip label={label} kbd={kbd} side="right">{b}</Tooltip> : b;
}

function AccountAvatar({ account }: { account: ShellAccountProp }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (account === undefined) return <Avatar id="tomas" size={24} />;
  if (account === "loading") return <Skeleton w={24} h={24} r={12} />;
  if (account === "unavailable") return <span className="c-av c-av--24 c-mono-av c-mono-av--off" aria-hidden="true"><Icon name="alert" size={12} /></span>;
  // No picture, or it failed to load: initials on the neutral tint (M1 follow-up 5a).
  if (!account.avatarUrl || broken === account.avatarUrl) return <Monogram name={account.name} email={account.email} size={24} />;
  const url = account.avatarUrl;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="c-av c-av--24" src={url} alt="" width={24} height={24} referrerPolicy="no-referrer" onError={() => setBroken(url)} />;
}

/** The account row at the foot of the sidebar: sample person, signed-in person (picture or
 *  monogram), loading skeleton, or the static "not connected" row. Extra props go on the button. */
export function AccountRow({ account, collapsed, ...rest }: { account?: ShellAccountProp; collapsed?: boolean } & ComponentPropsWithoutRef<"button">) {
  const live = typeof account === "object";
  return (
    <button type="button" className={cx("c-me", collapsed && "is-collapsed")} aria-label="Account" aria-busy={account === "loading" || undefined} {...rest}>
      <AccountAvatar account={account} />
      <span className="c-me__txt">
        {account === "loading" ? <><Skeleton w={96} h={10} /><Skeleton w={120} h={8} /></>
          : account === "unavailable" ? <><span className="c-strong">Not connected</span><span>Account details unavailable</span></>
          : <><span className="c-strong">{live ? account.name : "Tomás Ibarra"}</span><span>{live ? account.email : "tomas@coldtrace.io"}</span></>}
      </span>
    </button>
  );
}

/** The sidebar's mailbox-pool summary (M6). Omit for the sample numbers. */
export type ShellPool = { sent: number; cap: number; mailboxes: number; attention: number };
const SAMPLE_POOL: ShellPool = { sent: 184, cap: 210, mailboxes: 6, attention: 0 };
function PoolWidget({ pool = SAMPLE_POOL, onPool }: { pool?: ShellPool; onPool?: () => void }) {
  const on = pool.cap ? Math.round((pool.sent / pool.cap) * 21) : 0;
  const body = <>
    <div className="c-pool__top"><span className="c-strong">Mailbox pool</span><span className="c-faint">{pool.sent} / {pool.cap} today</span></div>
    <span className="c-pool__bar" aria-hidden="true">{Array.from({ length: 21 }, (_, i) => <i key={i} className={i < on ? "on" : undefined} />)}</span>
    {pool.attention > 0 ? <span className="c-pool__warn">{pool.mailboxes} mailboxes · {pool.attention} need you</span> : <span className="c-faint">{pool.mailboxes} mailboxes · all warm</span>}
  </>;
  return onPool ? <button type="button" className="c-pool c-pool--btn" title="Mailbox pool" onClick={onPool}>{body}</button> : <div className="c-pool" title="Mailbox pool">{body}</div>;
}

export function SideNav({ active, onNavigate, collapsed, onSearch, segment, onSegment, account, onSignOut, pool, onPool }: {
  active: ViewId; onNavigate?: (v: ViewId) => void; collapsed?: boolean; onSearch?: () => void; segment?: string; onSegment?: (s: string) => void;
  account?: ShellAccountProp; onSignOut?: () => void; pool?: ShellPool; onPool?: () => void;
}) {
  const router = useRouter();
  const signOut = onSignOut ?? (() => router.push("/sign-in"));
  const top = APP_NAV.filter((n) => n.id !== "settings");
  const settings = APP_NAV.find((n) => n.id === "settings")!;
  const live = typeof account === "object";
  // Session check failed: don't show counts or pool numbers we couldn't have fetched.
  const offline = account === "unavailable";
  const heading = live ? `${account.name} · ${account.role}` : account === "loading" || account === "unavailable" ? null : "Tomás Ibarra · Owner";
  return (
    <nav className={cx("c-side c-side--app", collapsed && "is-collapsed")} aria-label="Primary">
      <div className="c-side__head"><WorkspaceSwitcher collapsed={collapsed} account={account} onSignOut={signOut} /></div>
      <NavRow icon="search" label="Search" kbd="⌘K" collapsed={collapsed} onClick={onSearch} />
      <div className="c-side__gap" />
      {top.map((n) => <NavRow key={n.id} icon={n.icon} label={n.label} count={offline ? undefined : n.count} dot={collapsed && !offline && !!n.count} active={active === n.id && !(n.id === "segments" && segment)} collapsed={collapsed} onClick={() => onNavigate?.(n.id)} />)}
      {!collapsed && <>
        <div className="c-side__label">Saved segments</div>
        {SAVED_SEGMENTS.map(([s, n]) => (
          <button type="button" key={s} className={cx("c-nav c-nav--seg", segment === s && active === "segments" && "is-active")} onClick={() => onSegment?.(s)}>
            <span className="c-nav__ic"><span className="c-nav__hash" />{s}</span>{!offline && <span className="c-count">{n}</span>}</button>
        ))}
      </>}
      <div style={{ flex: 1 }} />
      {!collapsed && !offline && <PoolWidget pool={pool} onPool={onPool} />}
      <NavRow icon={settings.icon} label={settings.label} active={active === "settings"} collapsed={collapsed} onClick={() => onNavigate?.("settings")} />
      <DropdownMenu side="top" width={232} label="Account" items={[
        ...(heading ? [{ heading }] : []),
        { label: "Profile", icon: "user" },
        { label: "Keyboard shortcuts", icon: "bolt", kbd: "?" },
        { label: "Help and docs", icon: "help" },
        "separator",
        { label: "Sign out", icon: "logout", onSelect: signOut },
      ]} trigger={(p) => (
        <AccountRow account={account} collapsed={collapsed} {...p} />
      )} />
    </nav>
  );
}


/* ------------------------------------------------------------ Top bar */
export function TopBar({ crumbs, actions, onToggleSide, onMenu, onSearch, collapsed }: {
  crumbs: ReactNode[]; actions?: ReactNode; onToggleSide?: () => void; onMenu?: () => void; onSearch?: () => void; collapsed?: boolean;
}) {
  return (
    <header className="c-topbar">
      <button type="button" className="c-iconbtn c-topbar__menu" aria-label="Open navigation" onClick={onMenu}><Icon name="menu" /></button>
      <span className="c-topbar__toggle"><Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} kbd="[" side="bottom">
        <button type="button" className="c-iconbtn" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={!!collapsed} onClick={onToggleSide}><Icon name="panel" /></button></Tooltip></span>
      <nav className="c-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => <span key={i} className={cx("c-crumb", i === crumbs.length - 1 && "is-last", i < crumbs.length - 2 && "is-far")}>{i > 0 && <span className="c-sep">/</span>}{i === crumbs.length - 1 ? <b>{c}</b> : c}</span>)}
      </nav>
      <span style={{ flex: 1 }} />
      <div className="c-actions c-topbar__actions">{actions}</div>
      <button type="button" className="c-iconbtn c-topbar__search" aria-label="Search" onClick={onSearch}><Icon name="search" /></button>
      <Tooltip label="Notifications" side="bottom"><button type="button" className="c-iconbtn c-topbar__bell" aria-label="Notifications, 2 new"><Icon name="bell" /><span className="c-iconbtn__dot" /></button></Tooltip>
    </header>
  );
}

/* ------------------------------------------------------------ Shell
   Full app frame. Collapses to a 56px icon rail ([), and below 768px of its own width
   (container query) becomes a top bar + drawer. frame="viewport" fills the window. */
export function AppShell({ active, onNavigate, crumbs, actions, children, collapsed: ctl, onCollapsedChange, defaultCollapsed = false, defaultDrawer = false, onSearch, frame = "viewport", segment, onSegment, hotkeys = true, className, account, onSignOut, pool, onPool }: {
  active: ViewId; onNavigate?: (v: ViewId) => void; crumbs: ReactNode[]; actions?: ReactNode; children: ReactNode;
  collapsed?: boolean; onCollapsedChange?: (v: boolean) => void; defaultCollapsed?: boolean; defaultDrawer?: boolean; onSearch?: () => void;
  frame?: "viewport" | "contained"; segment?: string; onSegment?: (s: string) => void; hotkeys?: boolean; className?: string;
  /** Signed-in person; omit for the sample person. */ account?: ShellAccountProp; /** Replaces the default "go to /sign-in". */ onSignOut?: () => void;
  /** Sidebar pool summary (M6); omit for the sample. */ pool?: ShellPool; /** Makes the pool summary a button (opens the pool). */ onPool?: () => void;
}) {
  const [own, setOwn] = useState(defaultCollapsed);
  const collapsed = ctl ?? own;
  const setCollapsed = useCallback((v: boolean) => { setOwn(v); onCollapsedChange?.(v); }, [onCollapsedChange]);
  const [drawer, setDrawer] = useState(defaultDrawer);
  useEffect(() => {
    if (!hotkeys) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=dialog]")) return;
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) setCollapsed(!collapsed);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hotkeys, collapsed, setCollapsed]);
  const go = (v: ViewId) => { onNavigate?.(v); setDrawer(false); };
  return (
    <div className={cx("c-shellbox", frame === "viewport" && "c-shellbox--viewport", className)}>
      <div className={cx("c-shell c-app", collapsed && "is-collapsed", drawer && "is-drawer")}>
        <div className="c-shell__side">
          <SideNav active={active} onNavigate={go} collapsed={collapsed && !drawer} onSearch={() => { setDrawer(false); onSearch?.(); }} segment={segment} onSegment={(s) => { onSegment?.(s); setDrawer(false); }} account={account} onSignOut={onSignOut} pool={pool} onPool={onPool ? () => { onPool(); setDrawer(false); } : undefined} />
        </div>
        {drawer && <div className="c-shell__scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
        <div className="c-shell__main">
          <TopBar crumbs={crumbs} actions={actions} collapsed={collapsed} onToggleSide={() => setCollapsed(!collapsed)} onMenu={() => setDrawer(true)} onSearch={onSearch} />
          <div className="c-shell__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
