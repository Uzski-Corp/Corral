"use client";
/* Real Corral components, placed on the marketing site at their own size (M10). Same props the app passes;
   the actions are no-ops because nothing here is a real workspace. */
import { useState, type ReactNode } from "react";
// Deep imports on purpose (M10 perf): the barrel would ship the whole app with every marketing page.
import { CopyBlock, AccessPicker } from "@/components/app/mcp/Shared";
import { DEMO_TODAY_M4, provOf } from "@/components/app/discovery/data";
import { ProvenanceList } from "@/components/app/discovery/Provenance";
import { FitReasoning } from "@/components/app/fit/Reasoning";
import { KILIMA_FIT } from "@/components/app/fit/data";
import { MeetingCard as HandoffMeeting, HandoffSteps } from "@/components/app/handoff/Handoff";
import { handoffFor } from "@/components/app/handoff/data";
import { LEAD_ROWS } from "@/components/app/leads/data";
import { ToastProvider } from "@/components/app/Toaster";
import { Tabs } from "@/components/app/Tabs";
import { CLIENTS, configFor, stepsFor, type ClientId } from "@/lib/mcp/tools";
import { PRESETS } from "@/lib/mcp/keys";

export { Screen } from "./Screen";

const noop = () => {};
const kilima = LEAD_ROWS.find((l) => l.id === "kilima")!;
const Card = ({ children, className }: { children: ReactNode; className?: string }) => <div className={`c-app pp-card${className ? ` ${className}` : ""}`}>{children}</div>;

/** M5: why Kilima Dairies scored 94, every check with its evidence. */
export function FitPiece() {
  return <Card className="pp-fit"><FitReasoning status={{ kind: "scored", score: KILIMA_FIT }} company="Kilima Dairies" domain="kilima.co.ke" today={DEMO_TODAY_M4}
    onRescore={noop} onOverride={noop} onClearOverride={noop} onDisagree={noop} onOpenField={noop} onAddField={noop} /></Card>;
}

/** M4: where Wanjiru's email came from, the evidence chain open. */
export function ProvenancePiece() {
  return <Card className="pp-prov"><ProvenanceList list={provOf(kilima)} today={DEMO_TODAY_M4} initialOpen="email" /></Card>;
}

/** M8: Grace booked; the deal opened in Phoenix; nurture handed to AutoSend. */
export function HandoffPiece() {
  const h = handoffFor("meeting-booked");
  return <Card className="pp-hand"><HandoffMeeting h={h} /><HandoffSteps h={h} /></Card>;
}

/** M9: the Cursor config, exactly as Settings → MCP writes it. */
export function McpConfigPiece() {
  return <ToastProvider><Card className="pp-mcp"><CopyBlock label="Config" where="~/.cursor/mcp.json" text={configFor("cursor", "oauth")} what="the config" /></Card></ToastProvider>;
}

/** M9/M10: the key's access picker, Read and draft picked; the Unibox stops at Write and says why. */
export function KeyAccessPiece() {
  return <Card className="pp-access"><AccessPicker holder="key" value={PRESETS[1].access} /></Card>;
}

/** Client logos from svgl.app (public/corral/logos). "Other clients" has none. */
const CLIENT_LOGO: Partial<Record<ClientId, string>> = { cursor: "/corral/logos/cursor.svg", "claude-code": "/corral/logos/claude.svg", claude: "/corral/logos/claude.svg", vscode: "/corral/logos/vscode.svg" };
function ClientTab({ id, name }: { id: ClientId; name: string }) {
  const logo = CLIENT_LOGO[id];
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="pp-tab">{logo && <img src={logo} alt="" width={14} height={14} />}{name}</span>;
}

/** M9: connect a client, the same steps and config Settings → MCP gives you. */
export function McpClientsPiece() {
  const [cl, setCl] = useState<ClientId>("cursor");
  const c = CLIENTS.find((x) => x.id === cl)!;
  const auth = c.oauth ? "oauth" : "key";
  return (
    <ToastProvider>
      <div className="c-app pp-clients">
        <Tabs variant="pill" label="Client" value={cl} onChange={(v) => setCl(v as ClientId)} tabs={CLIENTS.map((x) => ({ id: x.id, label: <ClientTab id={x.id} name={x.name} /> }))} />
        <div className="pp-clients__body">
          <ol className="pp-steps">{stepsFor(cl, auth).map((s, i) => <li key={i}><span className="pp-steps__n">{i + 1}</span><span>{s}</span></li>)}</ol>
          <CopyBlock label={c.lang === "shell" ? "Command" : c.lang === "steps" ? "Connector" : "Config"} where={c.where} text={configFor(cl, auth)} what={c.lang === "shell" ? "the command" : "the config"} />
        </div>
      </div>
    </ToastProvider>
  );
}
