"use client";
/* /styleguide: M8 handoffs (Cal.com → Phoenix ERP → AutoSend) in the thread and on the lead, and Settings →
   Integrations (ENG-58). Every piece live. */
import type { ReactNode } from "react";
import {
  FieldMapping, HandoffFlow, HandoffMeeting, HandoffProblems, HandoffSteps, IntegrationLogs, IntegrationScopes, RowTag, SettingsView, ToastProvider, UNIBOX_THREADS, handoffFor,
} from "@/components/app";
import { HANDOFF_REVIEW_STATES } from "@/lib/handoff/state";
import { SETTINGS_REVIEW_STATES } from "@/lib/integrations/state";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const grace = UNIBOX_THREADS.find((t) => t.id === "grace")!;

export function HandoffDemo() {
  return (
    <ToastProvider>
      <div className="sg-m8">
        <div className="sg-card"><Label>the meeting in the thread · booked · moved</Label>
          <div className="sg-m8-stack"><HandoffMeeting h={handoffFor("meeting-booked")} /><HandoffMeeting h={handoffFor("meeting-rescheduled")} /></div></div>
        <div className="sg-card"><Label>cancelled · no-show (back in Needs you, a person writes)</Label>
          <div className="sg-m8-stack"><HandoffMeeting h={handoffFor("meeting-cancelled")} /><HandoffMeeting h={handoffFor("meeting-no-show")} compact /></div>
          <Label>row tags</Label>
          <div className="sg-m7-tags">{(["rescheduled", "cancelled", "no-show"] as const).map((m) => <RowTag key={m} t={{ ...grace, status: m === "rescheduled" ? "Meeting booked" : "Interested", meeting: m }} />)}</div></div>
        <div className="sg-card"><Label>the three handoffs · rail and lead</Label>
          <div className="sg-m8-stack"><HandoffSteps h={handoffFor("meeting-booked")} /><HandoffSteps h={handoffFor("deal-error")} /></div>
          <Label>review states · /app?view=unibox&amp;state= (and view=companies)</Label>
          <ul className="sg-anatomy sg-m6-cols">{HANDOFF_REVIEW_STATES.map((s) => <li key={s}><a className="c-link" href={`/app?view=unibox&state=${s}`}><code>{s}</code></a></li>)}</ul></div>
        <div className="sg-card"><Label>what needs a person · refused · duplicate · follow-up waiting</Label>
          <div className="sg-m8-stack"><HandoffProblems h={handoffFor("deal-error")} /><HandoffProblems h={handoffFor("deal-duplicate")} /><HandoffProblems h={handoffFor("nurture-off")} /></div></div>
      </div>
    </ToastProvider>
  );
}

export function IntegrationsDemo() {
  return (
    <ToastProvider>
      <div className="sg-m8 sg-m8--settings">
        <div className="sg-card sg-m6-wide"><Label>Settings → Integrations · live</Label>
          <div className="c-win c-win--flat c-app sg-m8-win"><SettingsView /></div>
          <Label>review states · /app?view=settings&amp;state=</Label>
          <ul className="sg-anatomy sg-m6-cols">{SETTINGS_REVIEW_STATES.map((s) => <li key={s}><a className="c-link" href={`/app?view=settings&state=${s}`}><code>{s}</code></a></li>)}</ul></div>
        <div className="sg-card"><Label>handoff flow · each step with its connection</Label>
          <HandoffFlow conn={{ cal: "connected", phoenix: "error", autosend: "off" }} />
          <Label>permissions · can, never, where the key lives</Label>
          <IntegrationScopes id="phoenix" /></div>
        <div className="sg-card sg-m6-wide"><Label>log · Problems · open a row for what went and came back</Label>
          <IntegrationLogs id="phoenix" initialOpen="p1" /></div>
        <div className="sg-card sg-m6-wide"><Label>Phoenix field mapping · a required field empty, a type that doesn’t fit</Label>
          <FieldMapping broken /></div>
      </div>
    </ToastProvider>
  );
}
