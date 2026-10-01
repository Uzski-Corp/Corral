/**
 * Every state, indexed (M10 states audit, ENG-60). One list of every design-review state in the app,
 * by surface and by kind, so a missing empty, loading or error state shows up as a failing test instead of a
 * blank screen at launch. Shown at /styleguide#every-state; Krak's visual-regression and axe sweeps (ENG-87)
 * can walk `allStates()` instead of keeping their own list.
 *
 * Kinds:
 *   empty     nothing here yet, and the one thing to do about it
 *   loading   the shared skeleton (Skeleton / SkeletonTable / SkeletonThreads / AppSkeleton), at real sizes
 *   error     what failed, that nothing was lost, Try again, and the request in mono
 *   partial   some of it worked: say which part, keep the rest usable
 *   progress  work under way (reading, drafting, sending): what's happening and what's next
 *   view      a normal screen, dialog or step
 */
import { APP_REVIEW_STATES } from "@/lib/auth/appState";
import { KB_REVIEW_STATES } from "@/lib/kb/state";
import { LEADS_REVIEW_STATES, SEGMENT_REVIEW_STATES } from "@/lib/leads/state";
import { DISCOVERY_REVIEW_STATES } from "@/lib/discovery/state";
import { CONTACTS_REVIEW_STATES } from "@/lib/contacts/state";
import { SEQUENCE_REVIEW_STATES } from "@/lib/sequences/state";
import { UNIBOX_REVIEW_STATES } from "@/lib/unibox/state";
import { HANDOFF_REVIEW_STATES } from "@/lib/handoff/state";
import { SETTINGS_REVIEW_STATES } from "@/lib/integrations/state";
import { MCP_REVIEW_STATES } from "@/lib/mcp/state";
import { MARKETING_REVIEW_STATES } from "@/lib/marketing/visitor";
import { appPath } from "@/lib/appPath";
import type { ViewId } from "@/components/app/Shell";

export type StateKind = "empty" | "loading" | "error" | "partial" | "progress" | "view";
export const KINDS: StateKind[] = ["empty", "loading", "error", "partial", "progress", "view"];
/** The three every surface needs, or a reason it doesn't. */
export const REQUIRED: StateKind[] = ["empty", "loading", "error"];

export type Surface = {
  id: string; label: string; milestone: string;
  /** The /app screen this surface's states load on; undefined for the shell (any view). */
  view?: string;
  /** A surface outside /app: its states load on this route instead (?state=…). */
  route?: string;
  states: readonly string[];
  /** Why a required kind is missing on purpose. */
  na?: Partial<Record<StateKind, string>>;
  /** Overrides for states the name rules below get wrong. */
  kinds?: Record<string, StateKind>;
};

export const SURFACES: Surface[] = [
  { id: "marketing", label: "Marketing nav (signed in or out)", milestone: "M10c", route: "/", states: MARKETING_REVIEW_STATES,
    kinds: { "signed-in-initials": "partial" },
    na: { empty: "Marketing pages are static copy; there is nothing to be empty.",
      loading: "Static HTML: the nav renders signed out and swaps after hydration in the same footprint, so there is no skeleton.",
      error: "The hint can only be present or not; a page that throws is app/error.tsx (route-level states)." } },
  { id: "shell", label: "Shell and session", milestone: "M1", states: APP_REVIEW_STATES,
    kinds: { "no-avatar": "partial", "signout-failed": "error" },
    na: { empty: "The shell always has its navigation; each view owns its own empty state." } },
  { id: "knowledge", label: "Knowledge base", milestone: "M2", view: "knowledge", states: KB_REVIEW_STATES,
    kinds: { failed: "partial", unreadable: "partial", interrupted: "partial", conflict: "error",
      "not-drafted": "empty", "first-product": "empty", "search-none": "empty", "search-loading": "loading", "search-error": "error" } },
  { id: "companies", label: "Companies and fit", milestone: "M3–M5", view: "companies", states: LEADS_REVIEW_STATES,
    kinds: { "no-results": "empty", "fit-none": "partial", "fit-low": "view", "fit-changed": "view" } },
  { id: "segments", label: "Segments", milestone: "M3", view: "segments", states: SEGMENT_REVIEW_STATES },
  { id: "discovery", label: "Discovery", milestone: "M4", view: "discovery", states: DISCOVERY_REVIEW_STATES,
    kinds: { zero: "empty", "rate-limited": "error", failed: "error" } },
  { id: "contacts", label: "Contacts", milestone: "M10", view: "contacts", states: CONTACTS_REVIEW_STATES },
  { id: "sequences", label: "Sequences and pool", milestone: "M6", view: "sequences", states: SEQUENCE_REVIEW_STATES,
    kinds: { errors: "error", paused: "view" } },
  { id: "unibox", label: "Unibox", milestone: "M7", view: "unibox", states: UNIBOX_REVIEW_STATES,
    kinds: { refused: "partial", low: "partial", disconnected: "error", bounce: "view", undo: "progress" } },
  { id: "handoffs", label: "Handoffs", milestone: "M8", view: "unibox", states: HANDOFF_REVIEW_STATES,
    kinds: { "deal-duplicate": "partial", "meeting-cancelled": "view", "meeting-no-show": "view", "nurture-off": "view" },
    na: { empty: "A handoff lives in a thread or on a lead; no handoff is a thread without the card.",
      loading: "The card renders with its thread, under the thread’s skeleton." } },
  { id: "integrations", label: "Settings → Integrations", milestone: "M8", view: "settings", states: SETTINGS_REVIEW_STATES,
    kinds: { none: "empty", "load-error": "error", reauth: "error", "connect-erp-failed": "error" } },
  { id: "developers", label: "Settings → Developers (MCP, keys, docs)", milestone: "M9–M10", view: "settings", states: MCP_REVIEW_STATES,
    kinds: { "key-expired": "partial", "keys-member": "view", "keys-member-key": "view", "keys-owner": "view" } },
  { id: "products", label: "Products", milestone: "—", view: "products", states: [],
    na: { empty: "Not designed yet: an M1 placeholder. Launch blocker, see HANDOFF §18.",
      loading: "Not designed yet (M1 placeholder).", error: "Not designed yet (M1 placeholder)." } },
];

/** Route-level states: Next's loading.tsx / error.tsx / not-found.tsx / global-error.tsx (M10). */
export const ROUTE_STATES: { file: string; kind: StateKind; what: string }[] = [
  { file: "app/app/loading.tsx", kind: "loading", what: "The app shell outline (AppSkeleton) while /app streams in." },
  { file: "app/app/error.tsx", kind: "error", what: "A view threw: the shell’s ErrorState, Try again and Go to the Unibox, with the digest." },
  { file: "app/error.tsx", kind: "error", what: "A marketing page threw: the site nav and footer stay, Try again." },
  { file: "app/global-error.tsx", kind: "error", what: "The root layout threw: plain HTML, no tokens, one Try again." },
  { file: "app/not-found.tsx", kind: "empty", what: "404: the page Corral couldn’t find, told as a read with no fit." },
];

/** Name rules first, then the surface's overrides. */
export function kindOf(state: string, surface?: Surface): StateKind {
  const o = surface?.kinds?.[state];
  if (o) return o;
  if (/(^|-)empty$|^none$/.test(state)) return "empty";
  if (/loading$/.test(state)) return "loading";
  if (/(^|-)errors?$|failed|^api-down$|^conflict/.test(state)) return "error";
  if (/partial|stale/.test(state)) return "partial";
  if (/drafting|running|launching|sending|connecting|waiting|queued|scoring|dragging|^tray$/.test(state)) return "progress";
  return "view";
}

export function hrefOf(surface: Surface, state: string) {
  if (surface.route) return `${surface.route}?state=${state}`;
  if (!surface.view) return `/app?state=${state}`;
  return appPath(surface.view as ViewId, { state });
}

export type IndexedState = { surface: string; state: string; kind: StateKind; href: string };
export function allStates(): IndexedState[] {
  return SURFACES.flatMap((s) => s.states.map((st) => ({ surface: s.id, state: st, kind: kindOf(st, s), href: hrefOf(s, st) })));
}

/** Required kinds a surface has neither a state nor a reason for. Empty everywhere is the launch bar. */
export function gaps(surface: Surface): StateKind[] {
  const have = new Set(surface.states.map((st) => kindOf(st, surface)));
  return REQUIRED.filter((k) => !have.has(k) && !surface.na?.[k]);
}

export function countsOf(surface: Surface): Record<StateKind, number> {
  const c = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<StateKind, number>;
  for (const st of surface.states) c[kindOf(st, surface)]++;
  return c;
}
