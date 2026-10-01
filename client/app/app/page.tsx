import type { Metadata } from "next";
import type { ViewId } from "@/components/app";
import { AppScreen } from "@/components/session/AppScreen";
import { appReviewState } from "@/lib/auth/appState";
import { getConfig } from "@/lib/config";
import { kbReviewState } from "@/lib/kb/state";
import { leadsReviewState } from "@/lib/leads/state";
import { discoveryReviewState } from "@/lib/discovery/state";
import { sequenceReviewState } from "@/lib/sequences/state";
import { uniboxReviewState } from "@/lib/unibox/state";
import { settingsReviewState } from "@/lib/integrations/state";
import { mcpReviewState } from "@/lib/mcp/state";
import { contactsReviewState } from "@/lib/contacts/state";

export const metadata: Metadata = { title: "Unibox" };
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
 * Unibox (M7): ?view=unibox&state=panes | filtered | triage-menu | referral | ooo | unsubscribe | bounce | thread | keys |
 *   drafting | draft | low | refused | edited | undo | sending | sent | failed | disconnected | conflict | empty | loading | error
 *   (see lib/unibox/state.ts; ?view can be left out, the Unibox is home) · M8 adds meeting-booked | meeting-rescheduled |
 *   meeting-cancelled | meeting-no-show | deal-error | deal-duplicate | nurture-off (also on ?view=companies, Grace's lead)
 *   · M9 adds conflict-lead (the lead wrote again while you drafted)
 * Settings → Integrations (M8): ?view=settings&state=integrations | none | connect-cal | connecting | connect-erp |
 *   connect-erp-failed | connect-autosend | connected | reauth | error | disconnect | logs | mapping | mapping-errors | scopes |
 *   autosend | loading | load-error  (see lib/integrations/state.ts)
 * Settings → Developers (M9): ?view=settings&state=mcp | mcp-empty | mcp-connect | mcp-connect-claude | mcp-connect-key |
 *   mcp-consent | mcp-waiting | mcp-connected | mcp-activity | mcp-error | mcp-revoke | mcp-loading | keys | keys-empty |
 *   key-create | key-create-errors | key-reveal | key-rotate | key-rotated | key-revoke | key-expired | keys-error | docs |
 *   docs-tool | docs-search-empty  (see lib/mcp/state.ts) · M10 adds keys-loading | keys-owner | keys-member |
 *   keys-member-key (who manages which key)
 * Contacts (M10): ?view=contacts&state=loading | empty | error  (see lib/contacts/state.ts)
 * Settings page (not a review state, works in production): ?view=settings&tab=mcp | keys | docs | integrations | workspace | team | billing
 * Every review state, by view and kind: lib/states/index.ts, shown at /styleguide#every-state (M10)
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
  const unibox = uniboxReviewState(view, one("state"), reviewStates);
  const settings = settingsReviewState(view, one("state"), reviewStates);
  const developer = mcpReviewState(view, one("state"), reviewStates);
  const contacts = contactsReviewState(view, one("state"), reviewStates);
  return <AppScreen key={`${preview ?? "live"}-${kb ?? ""}-${leads ?? ""}-${discovery ?? ""}-${sequences ?? ""}-${unibox ?? ""}-${settings ?? ""}-${developer ?? ""}-${contacts ?? ""}-${view === "settings" ? one("tab") ?? "" : ""}`} preview={preview} kb={kb} leads={leads} discovery={discovery} sequences={sequences} unibox={unibox} settings={settings} developer={developer} contacts={contacts} settingsTab={view === "settings" ? one("tab") : undefined} initialView={view} initialSegment={view === "segments" ? one("segment") : undefined} cmdk={one("cmdk") === "1"} collapsed={one("collapsed") === "1"} drawer={one("nav") === "1"} dialog={one("dialog") === "enroll"} />;
}
