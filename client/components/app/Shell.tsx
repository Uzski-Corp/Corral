"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { Avatar, Kbd, cx } from "./primitives";
import { DropdownMenu, Tooltip } from "./Overlays";

export type ViewId = "unibox" | "companies" | "contacts" | "segments" | "sequences" | "products" | "knowledge" | "settings";
export const APP_NAV: { id: ViewId; label: string; icon: IconName; count?: string; keys: string }[] = [
  { id: "unibox", label: "Unibox", icon: "inbox", count: "7", keys: "G I" },
  { id: "companies", label: "Companies", icon: "building", keys: "G C" },
  { id: "contacts", label: "Contacts", icon: "users", keys: "G P" },
  { id: "segments", label: "Segments", icon: "layers", keys: "G S" },
  { id: "sequences", label: "Sequences", icon: "seq", keys: "G Q" },
  { id: "products", label: "Products", icon: "box", keys: "G R" },
  { id: "knowledge", label: "Knowledge base", icon: "book", keys: "G K" },
  { id: "settings", label: "Settings", icon: "gear", keys: "G ," },
];
export const SAVED_SEGMENTS: [string, number][] = [["F&B · East Africa", 48], ["Logistics · Fit > 70", 31], ["Replied, no meeting", 7]];

/* ------------------------------------------------------------ Workspace switcher */
export const WorkspaceTile = ({ letter = "C", size = 20, tone = "ink" }: { letter?: string; size?: number; tone?: "ink" | "blue" | "sand" }) =>
  <span className={cx("c-wstile", `c-wstile--${tone}`)} style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">{letter}</span>;

export function WorkspaceSwitcher({ collapsed, defaultOpen }: { collapsed?: boolean; defaultOpen?: boolean }) {
  const router = useRouter();
  return (
    <DropdownMenu label="Workspaces" width={248} defaultOpen={defaultOpen} items={[
      { heading: "tomas@coldtrace.io" },
      { label: "ColdTrace", lead: <WorkspaceTile />, meta: "3 members", checked: true },
      { label: "Pwani Fresh pilot", lead: <WorkspaceTile letter="P" tone="sand" />, meta: "Guest" },
      "separator",
      { label: "Workspace settings", icon: "gear", kbd: "G ," },
      { label: "Invite teammates", icon: "users", onSelect: () => router.push("/onboarding?step=5") },
      { label: "Create a workspace", icon: "plus", onSelect: () => router.push("/onboarding") },
      "separator",
      { label: "Sign out", icon: "logout", onSelect: () => router.push("/sign-in") },
    ]} trigger={(p) => (
      <button type="button" className={cx("c-ws", collapsed && "is-collapsed")} aria-label="Switch workspace" {...p}>
        <WorkspaceTile /><span className="c-ws__name">ColdTrace</span><Icon name="down" size={12} />
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

export function SideNav({ active, onNavigate, collapsed, onSearch, segment, onSegment }: {
  active: ViewId; onNavigate?: (v: ViewId) => void; collapsed?: boolean; onSearch?: () => void; segment?: string; onSegment?: (s: string) => void;
}) {
  const router = useRouter();
  const top = APP_NAV.filter((n) => n.id !== "settings");
  const settings = APP_NAV.find((n) => n.id === "settings")!;
  return (
    <nav className={cx("c-side c-side--app", collapsed && "is-collapsed")} aria-label="Primary">
      <div className="c-side__head"><WorkspaceSwitcher collapsed={collapsed} /></div>
      <NavRow icon="search" label="Search" kbd="⌘K" collapsed={collapsed} onClick={onSearch} />
      <div className="c-side__gap" />
      {top.map((n) => <NavRow key={n.id} icon={n.icon} label={n.label} count={n.count} dot={collapsed && !!n.count} active={active === n.id && !(n.id === "segments" && segment)} collapsed={collapsed} onClick={() => onNavigate?.(n.id)} />)}
      {!collapsed && <>
        <div className="c-side__label">Saved segments</div>
        {SAVED_SEGMENTS.map(([s, n]) => (
          <button type="button" key={s} className={cx("c-nav c-nav--seg", segment === s && active === "segments" && "is-active")} onClick={() => onSegment?.(s)}>
            <span className="c-nav__ic"><span className="c-nav__hash" />{s}</span><span className="c-count">{n}</span></button>
        ))}
      </>}
      <div style={{ flex: 1 }} />
      {!collapsed && (
        <div className="c-pool" title="Mailbox pool">
          <div className="c-pool__top"><span className="c-strong">Mailbox pool</span><span className="c-faint">184 / 210 today</span></div>
          <span className="c-pool__bar" aria-hidden="true">{Array.from({ length: 21 }, (_, i) => <i key={i} className={i < 18 ? "on" : undefined} />)}</span>
          <span className="c-faint">6 mailboxes · all warm</span>
        </div>
      )}
      <NavRow icon={settings.icon} label={settings.label} active={active === "settings"} collapsed={collapsed} onClick={() => onNavigate?.("settings")} />
      <DropdownMenu side="top" width={232} label="Account" items={[
        { heading: "Tomás Ibarra · Owner" },
        { label: "Profile", icon: "user" },
        { label: "Keyboard shortcuts", icon: "bolt", kbd: "?" },
        { label: "Help and docs", icon: "help" },
        "separator",
        { label: "Sign out", icon: "logout", onSelect: () => router.push("/sign-in") },
      ]} trigger={(p) => (
        <button type="button" className={cx("c-me", collapsed && "is-collapsed")} aria-label="Account" {...p}>
          <Avatar id="tomas" size={24} /><span className="c-me__txt"><span className="c-strong">Tomás Ibarra</span><span>tomas@coldtrace.io</span></span>
        </button>
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
export function AppShell({ active, onNavigate, crumbs, actions, children, collapsed: ctl, onCollapsedChange, defaultCollapsed = false, defaultDrawer = false, onSearch, frame = "viewport", segment, onSegment, hotkeys = true, className }: {
  active: ViewId; onNavigate?: (v: ViewId) => void; crumbs: ReactNode[]; actions?: ReactNode; children: ReactNode;
  collapsed?: boolean; onCollapsedChange?: (v: boolean) => void; defaultCollapsed?: boolean; defaultDrawer?: boolean; onSearch?: () => void;
  frame?: "viewport" | "contained"; segment?: string; onSegment?: (s: string) => void; hotkeys?: boolean; className?: string;
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
          <SideNav active={active} onNavigate={go} collapsed={collapsed && !drawer} onSearch={() => { setDrawer(false); onSearch?.(); }} segment={segment} onSegment={(s) => { onSegment?.(s); setDrawer(false); }} />
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
