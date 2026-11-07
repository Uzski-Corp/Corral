import type { ViewId } from "@/components/app/Shell";

const VIEWS: readonly ViewId[] = ["unibox", "companies", "discovery", "contacts", "segments", "sequences", "products", "knowledge", "settings"];

/** Settings pages that are their own route. Integrations is the index, `/app/settings`. */
export const SETTINGS_PAGES = ["profile", "workspace", "team", "integrations", "billing", "sms", "mcp", "keys", "docs"] as const;

export type AppLocation = { view: ViewId; segment?: string; tab?: string };

const VIEW_TITLE: Record<ViewId, string> = {
  unibox: "Unibox",
  companies: "Companies",
  discovery: "Discovery",
  contacts: "Contacts",
  segments: "Segments",
  sequences: "Sequences",
  products: "Products",
  knowledge: "Knowledge base",
  settings: "Settings",
};

export function viewTitle(view: ViewId): string {
  return VIEW_TITLE[view];
}

function isView(value: string): value is ViewId {
  return (VIEWS as readonly string[]).includes(value);
}

function isSettingsPage(value: string): boolean {
  return (SETTINGS_PAGES as readonly string[]).includes(value);
}

/** Where a shell screen lives. Unibox is `/app`. Settings pages and a saved segment are path segments. */
export function appPath(view: ViewId, opts?: { segment?: string; tab?: string; state?: string }): string {
  let path = "/app";
  if (view === "settings") {
    const tab = opts?.tab && opts.tab !== "integrations" && isSettingsPage(opts.tab) ? opts.tab : undefined;
    path = tab ? `/app/settings/${tab}` : "/app/settings";
  } else if (view === "segments") {
    path = opts?.segment ? `/app/segments/${encodeURIComponent(opts.segment)}` : "/app/segments";
  } else if (view !== "unibox") {
    path = `/app/${view}`;
  }
  return opts?.state ? `${path}?state=${encodeURIComponent(opts.state)}` : path;
}

const DROPPED = new Set(["view", "tab", "segment"]);

function keptQuery(search: string): string {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  for (const key of DROPPED) q.delete(key);
  const rest = q.toString();
  return rest ? `?${rest}` : "";
}

/**
 * Old query-shaped app URLs, and the two aliases with a single canonical path.
 * Returns the path to send people to, or null when the URL is already canonical.
 */
export function legacyAppRedirect(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app") return null;
  const slug = parts.slice(1).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });

  if (slug.length === 0 && q.has("view")) {
    const raw = q.get("view") ?? "";
    const view = isView(raw) ? raw : "unibox";
    return `${appPath(view, {
      segment: view === "segments" ? q.get("segment") ?? undefined : undefined,
      tab: view === "settings" ? q.get("tab") ?? undefined : undefined,
    })}${keptQuery(search)}`;
  }
  if (slug.length === 1 && slug[0] === "unibox") return `/app${keptQuery(search)}`;
  if (slug[0] === "settings" && slug[1] === "integrations" && slug.length === 2) return `/app/settings${keptQuery(search)}`;
  if (slug[0] === "settings" && slug.length === 1) {
    const tab = q.get("tab");
    if (tab && tab !== "integrations" && isSettingsPage(tab)) return `/app/settings/${tab}${keptQuery(search)}`;
  }
  return null;
}

export type AppRoute =
  | { type: "redirect"; to: string }
  | { type: "not-found" }
  | { type: "page"; view: ViewId; segment?: string; tab?: string };

function parseSlug(slug: string[] | undefined): AppRoute {
  if (!slug?.length) return { type: "page", view: "unibox" };
  const [head, ...rest] = slug;
  if (!head || !isView(head) || head === "unibox") return { type: "not-found" };
  if (head === "settings") {
    if (rest.length === 0) return { type: "page", view: "settings" };
    if (rest.length === 1 && rest[0] && isSettingsPage(rest[0]) && rest[0] !== "integrations") {
      return { type: "page", view: "settings", tab: rest[0] };
    }
    return { type: "not-found" };
  }
  if (head === "segments") {
    if (rest.length === 0) return { type: "page", view: "segments" };
    if (rest.length === 1 && rest[0]) return { type: "page", view: "segments", segment: rest[0] };
    return { type: "not-found" };
  }
  if (rest.length) return { type: "not-found" };
  return { type: "page", view: head };
}

export type AppSearch = Record<string, string | string[] | undefined>;

function searchOf(q: AppSearch): string {
  const u = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (Array.isArray(value)) for (const item of value) u.append(key, item);
    else if (value !== undefined) u.append(key, value);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** The route an /app request is. Old `?view=` URLs redirect; an unknown segment is a 404. */
export function resolveAppRoute(slug: string[] | undefined, q: AppSearch): AppRoute {
  const pathname = !slug?.length ? "/app" : `/app/${slug.map((part) => encodeURIComponent(part)).join("/")}`;
  const legacy = legacyAppRedirect(pathname, searchOf(q));
  if (legacy) return { type: "redirect", to: legacy };
  return parseSlug(slug);
}

/** The screen a canonical /app path is showing. Anything else is the Unibox. */
export function locationFromPath(pathname: string): AppLocation {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app") return { view: "unibox" };
  const route = parseSlug(parts.slice(1).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  }));
  if (route.type !== "page") return { view: "unibox" };
  return { view: route.view, segment: route.segment, tab: route.tab };
}
