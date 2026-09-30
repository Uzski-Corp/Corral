"use client";
/* /styleguide: M9 Settings → Developers (ENG-59): MCP connections, API keys and the docs. Every piece live. */
import type { ReactNode } from "react";
import { AccessPicker, CopyBlock, McpConsent, SettingsView, ToastProvider } from "@/components/app";
import { PRESETS } from "@/lib/mcp/keys";
import { MCP_REVIEW_STATES } from "@/lib/mcp/state";
import { configFor } from "@/lib/mcp/tools";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;

export function DevelopersDemo() {
  return (
    <ToastProvider>
      <div className="sg-m8 sg-m8--settings">
        <div className="sg-card sg-m6-wide"><Label>Settings → Developers → MCP · live</Label>
          <div className="c-win c-win--flat c-app sg-m8-win"><SettingsView developer="mcp" /></div>
          <Label>review states · /app?view=settings&amp;state=</Label>
          <ul className="sg-anatomy sg-m6-cols">{MCP_REVIEW_STATES.map((s) => <li key={s}><a className="c-link" href={`/app?view=settings&state=${s}`}><code>{s}</code></a></li>)}</ul></div>
        <div className="sg-card"><Label>what it may do · per area, Send only on the Unibox</Label>
          <AccessPicker value={{ ...PRESETS[1].access, unibox: "send" }} /></div>
        <div className="sg-card"><Label>copy blocks · the secret once · a config</Label>
          <div className="sg-m8-stack"><CopyBlock secret label="Secret key" where="Live" text="crl_live_4fKq9TzW2mRb7XcN1pLs8VdJ3hYe6uGa" what="the key" />
            <CopyBlock label="Config" where="~/.cursor/mcp.json" text={configFor("cursor", "oauth")} what="the config" /></div></div>
        <div className="sg-card sg-m6-wide"><Label>the consent page a client opens · /oauth/authorize</Label>
          <div className="c-win c-win--flat c-app sg-m8-win sg-m9-consent"><McpConsent /></div></div>
      </div>
    </ToastProvider>
  );
}
