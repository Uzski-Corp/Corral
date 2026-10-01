import type { ViewId } from "@/components/app/Shell";

const VIEWS: readonly ViewId[] = ["unibox", "companies", "discovery", "contacts", "segments", "sequences", "products", "knowledge", "settings"];

export type AppLocation = { view: ViewId; segment?: string; tab?: string };

/** Where a shell screen lives. Unibox is /app; every other screen names itself in the query. */
export function appPath(view: ViewId, opts?: { segment?: string; tab?: string }): string {
  const q = new URLSearchParams();
  if (view !== "unibox") q.set("view", view);
  if (view === "segments" && opts?.segment) q.set("segment", opts.segment);
  if (view === "settings" && opts?.tab && opts.tab !== "integrations") q.set("tab", opts.tab);
  const s = q.toString();
  return s ? `/app?${s}` : "/app";
}

/** The screen a /app URL is showing. An unknown or missing view is the Unibox. */
export function viewFromSearch(search: string): AppLocation {
  const q = new URLSearchParams(search);
  const raw = q.get("view");
  const view = (VIEWS as readonly string[]).includes(raw ?? "") ? (raw as ViewId) : "unibox";
  return {
    view,
    segment: view === "segments" ? q.get("segment") ?? undefined : undefined,
    tab: view === "settings" ? q.get("tab") ?? undefined : undefined,
  };
}
