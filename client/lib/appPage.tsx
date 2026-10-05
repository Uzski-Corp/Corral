import { AppScreen } from "@/components/session/AppScreen";
import type { ViewId } from "@/components/app/Shell";
import type { AppSearch } from "@/lib/appPath";
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

/** One signed-in screen. The path is a real page; review fixtures stay on ?state=. */
export async function renderAppPage(view: ViewId, searchParams: Promise<AppSearch>, extra?: { tab?: string; segment?: string }) {
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
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
  return (
    <AppScreen
      key={`${preview ?? "live"}-${kb ?? ""}-${leads ?? ""}-${discovery ?? ""}-${sequences ?? ""}-${unibox ?? ""}-${settings ?? ""}-${developer ?? ""}-${contacts ?? ""}-${extra?.tab ?? ""}-${extra?.segment ?? ""}`}
      preview={preview}
      kb={kb}
      leads={leads}
      discovery={discovery}
      sequences={sequences}
      unibox={unibox}
      settings={settings}
      developer={developer}
      contacts={contacts}
      settingsTab={extra?.tab}
      initialView={view}
      initialSegment={extra?.segment}
      cmdk={one("cmdk") === "1"}
      collapsed={one("collapsed") === "1"}
      drawer={one("nav") === "1"}
      dialog={one("dialog") === "enroll"}
    />
  );
}
