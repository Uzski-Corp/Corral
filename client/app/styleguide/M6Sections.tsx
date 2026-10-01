"use client";
/* /styleguide: M6 sequence builder, step editor and copilot, mailbox pool (ENG-56). Every piece live. */
import { useState, type ReactNode } from "react";
import {
  COPILOT, CopilotPanel, DEMO_TODAY_M4, DRAFT, IssuesBanner, LIVE, Launching, MailboxCard, POOL_ISSUES, PoolLine, Preview, RECIPIENTS, RunNumbers, SeqTag, StepEditor, StepList, stripCites, type Sequence,
} from "@/components/app";
import { issuesOf } from "@/lib/sequences/sequence";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};

const STATES: [string, string][] = [
  ["empty", "no sequences yet: what one is, Draft one with Corral or Start blank"],
  ["loading", "list and step skeletons"], ["error", "the page failed to load; sending carries on"],
  ["draft", "three steps, the waits and conditions between them, what ends it"],
  ["conditions", "the condition menu open: no reply · opened, no reply · not opened"],
  ["editor", "step 1 open: variables, and the email filled in for Lena at Mara Cold Stores"],
  ["copilot", "Corral's draft citing four knowledge-base lines, and what it left out"],
  ["errors", "Launch blocked: cold_storage empty for 23, step 2 without an unsubscribe link"],
  ["launch", "the Launch dialog: 82 companies, Thursday 08:10, from the pool"],
  ["launching", "re-checking and scheduling; nothing sent yet"],
  ["running", "Cold-room pilot live: numbers per step, what sends next"],
  ["paused", "Dairy proof drip paused by Tomás: what's held, Resume"],
  ["mailboxes", "the pool: warm-up, health, caps, a disconnected mailbox, a bounce spike"],
];

export function SequenceDemo() {
  const [seq, setSeq] = useState<Sequence>(DRAFT);
  const issues = issuesOf(seq.steps, seq.missing, seq.audience.count);
  const pilot = LIVE.find((s) => s.id === "pilot")!;
  return (
    <div className="sg-m6">
      <div className="sg-card c-app sg-m6-steps"><Label>a draft · waits and conditions are editable between steps</Label>
        <StepList seq={seq} issues={issues} onOpen={noop} onGate={(i, g) => setSeq((s) => ({ ...s, steps: s.steps.map((x, k) => (k === i ? { ...x, gate: g } : x)) }))} /></div>
      <div className="sg-m6-side">
        <div className="sg-card c-app"><Label>status</Label>
          <div className="sg-m6-tags">{(["draft", "launching", "running", "paused"] as const).map((s) => <SeqTag key={s} status={s} />)}</div>
          <Label>rules</Label>
          <ul className="sg-anatomy">
            <li>Steps are emails; the rule before each one is a wait and a condition: no reply (default), opened but no reply, or not opened.</li>
            <li>Replied is not a branch: a reply ends the sequence for that person, at any step.</li>
            <li>Days count from step 1 and are shown on every step.</li>
            <li>Variables are tokens in the editor and filled-in values in the preview. Never raw braces in a sent email.</li>
          </ul></div>
        <div className="sg-card c-app"><Label>launch blocked · named, with where to fix it</Label><IssuesBanner issues={issues} onFix={noop} /></div>
        <div className="sg-card c-app"><Label>launching</Label><Launching seq={{ ...seq, status: "launching", launch: { stage: 1 } }} /></div>
      </div>
      <div className="sg-card c-app sg-m6-wide"><Label>running · per sequence</Label><RunNumbers seq={pilot} /></div>
      <div className="sg-card c-app sg-m6-wide"><Label>every state · /app/sequences&amp;state=</Label>
        <ul className="sg-anatomy sg-m6-cols">{STATES.map(([s, d]) => <li key={s}><a className="c-link" href={`/app/sequences?state=${s}`}><code>{s}</code></a> · {d}</li>)}</ul></div>
    </div>
  );
}

export function StepEditorDemo() {
  const [seq, setSeq] = useState<Sequence>(DRAFT);
  const [preview, setPreview] = useState("mara");
  const [copilot, setCopilot] = useState(false);
  const issues = issuesOf(seq.steps, seq.missing, seq.audience.count);
  const brenda = RECIPIENTS.find((r) => r.id === "mbarara")!;
  return (
    <div className="sg-m6">
      <div className="sg-card c-app sg-m6-wide sg-m6-editor"><Label>the step editor · write on the left, the real email on the right</Label>
        <div className="q-edwrap"><StepEditor seq={seq} i={0} onClose={noop} onChange={(st) => setSeq((s) => ({ ...s, steps: s.steps.map((x, k) => (k === 0 ? st : x)) }))}
          preview={preview} onPreview={setPreview} copilot={copilot} onCopilot={setCopilot} tried={false} issues={issues.filter((x) => x.step === 1)} /></div></div>
      <div className="sg-card c-app"><Label>Corral&rsquo;s draft · every claim cites its line</Label><CopilotPanel c={COPILOT} onUse={noop} onKeep={noop} /></div>
      <div className="sg-card c-app"><Label>a missing variable · Brenda would get [cold_storage]</Label>
        <Preview subject={DRAFT.steps[0].subject} body={stripCites(DRAFT.steps[0].body)} r={brenda} audience={DRAFT.audience.count} tried /></div>
    </div>
  );
}

export function PoolDemo() {
  const pick = ["hello", "ops", "amara", "tomas"].map((id) => POOL_ISSUES.find((m) => m.id === id)!);
  return (
    <div className="sg-m6">
      <div className="sg-card c-app sg-m6-wide"><Label>the pool, in one line · same numbers as the sidebar</Label><PoolLine pool={POOL_ISSUES} /></div>
      <div className="sg-m6-pool sg-m6-wide">
        {pick.map((m) => <div key={m.id}><Label>{({ hello: "disconnected", ops: "bounce spike · resting", amara: "warming up · day 9 of 14", tomas: "warm" } as Record<string, string>)[m.id]}</Label>
          <div className="c-app"><MailboxCard m={m} today={DEMO_TODAY_M4} onCap={noop} onReconnect={noop} onResume={noop} onBounces={noop} /></div></div>)}
      </div>
    </div>
  );
}
