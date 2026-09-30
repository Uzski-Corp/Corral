import type { Metadata } from "next";
import type { ViewId } from "@/components/app";
import { AppScreen } from "@/components/session/AppScreen";
import { appReviewState } from "@/lib/auth/appState";
import { getConfig } from "@/lib/config";
import { kbReviewState } from "@/lib/kb/state";
import { leadsReviewState } from "@/lib/leads/state";
import { discoveryReviewState } from "@/lib/discovery/state";
import { sequenceReviewState } from "@/lib/sequences/state";

export const metadata: Metadata = { title: "Corral · Unibox" };
const VIEWS: ViewId[] = ["unibox", "companies", "discovery", "contacts", "segments", "sequences", "products", "knowledge", "settings"];

/**
 * /app — the M1 shell with the Unibox as home.
 * Deep links (for review and screenshots): ?cmdk=1 opens ⌘K · ?view=companies · ?collapsed=1 · ?nav=1 (mobile drawer) · ?dialog=enroll
 * Review states (outside production): ?state=api-down | account-loading | no-avatar | signout-failed
 * Knowledge base (M2): ?view=knowledge&state=empty | drafting | loading | error | sources | source | partial | failed |
 *   upload | upload-errors | dragging | tray | editing | save-error | conflict  (see lib/kb/state.ts)
 * Lead table (M3): ?view=companies&state=loading | error | empty | no-results | partial | selected | select-all | bulk-confirm |
 *   bulk-running | status-menu | detail | duplicate | import | import-file-error | import-map | import-map-errors | import-review |
 *   import-running | import-done · ?view=segments&state=builder | builder-empty | builder-error | loading | error | selected | detail
 *   (see lib/leads/state.ts) · M4 adds ?view=companies&state=stale | provenance
 * Discovery (M4): ?view=discovery&state=empty | loading | error | new | new-error | queued | running | done | partial | failed |
 *   rate-limited | zero | detail  (see lib/discovery/state.ts)
 * Sequences (M6): ?view=sequences&state=empty | loading | error | draft | conditions | editor | copilot | errors | launch |
 *   launching | running | paused | mailboxes  (see lib/sequences/state.ts)
 */
export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const view = VIEWS.find((v) => v === one("view")) ?? "unibox";
  const { reviewStates } = getConfig();
  const preview = appReviewState(one("state"), reviewStates);
  const kb = kbReviewState(view, one("state"), reviewStates);
  const leads = leadsReviewState(view, one("state"), reviewStates);
  const discovery = discoveryReviewState(view, one("state"), reviewStates);
  const sequences = sequenceReviewState(view, one("state"), reviewStates);
  return <AppScreen key={`${preview ?? "live"}-${kb ?? ""}-${leads ?? ""}-${discovery ?? ""}-${sequences ?? ""}`} preview={preview} kb={kb} leads={leads} discovery={discovery} sequences={sequences} initialView={view} cmdk={one("cmdk") === "1"} collapsed={one("collapsed") === "1"} drawer={one("nav") === "1"} dialog={one("dialog") === "enroll"} />;
}
