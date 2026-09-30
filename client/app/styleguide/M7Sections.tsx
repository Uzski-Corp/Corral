"use client";
/* /styleguide: M7 Unibox panes and triage, the thread view, Corral's draft states (ENG-57). Every piece live. */
import { useState, type ReactNode } from "react";
import {
  BRIAN_EDIT, DraftArea, FilterChips, FitSummary, History, KeysSheet, MailboxLine, Message, RowTag, SequenceTrail, TriageMenu, UNIBOX_COPILOT, UNIBOX_THREADS, draftText,
  type DraftActions, type Thread,
} from "@/components/app";
import type { Filters } from "@/lib/unibox/triage";
import { UNIBOX_REVIEW_STATES } from "@/lib/unibox/state";
import type { DraftKind, SendKind } from "@/lib/unibox/draft";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};
const A: DraftActions = { onDraft: noop, onStop: noop, onSend: noop, onEdit: noop, onBack: noop, onText: noop, onUndo: noop, onRetry: noop, onReconnect: noop, onKeepDraft: noop,
  onDiscard: noop, onSendAnyway: noop, onKeepNote: noop, onWriteOwn: noop, onDraftSafe: noop, onRedraft: noop, onUnhandle: noop, onTriage: noop };
const th = (id: string) => UNIBOX_THREADS.find((t) => t.id === id)!;

export function UniboxTriageDemo() {
  const [filters, setFilters] = useState<Filters>({ triage: ["interested"], unread: false });
  const [t, setT] = useState<Thread>(th("brian"));
  const [open, setOpen] = useState(true);
  const needs = UNIBOX_THREADS.filter((x) => !x.handled);
  return (
    <div className="sg-m7">
      <div className="sg-card"><Label>filter chips · counts in the tab · Unread · Clear</Label>
        <div className="sg-m7-list"><FilterChips list={needs} filters={filters} onChange={setFilters} /></div>
        <Label>row tags · handled threads say so</Label>
        <div className="sg-m7-tags">{["wanjiru", "brian", "sofia", "daniel", "neema", "bounce"].map((id) => <RowTag key={id} t={th(id)} />)}</div>
        <Label>review states · /app?view=unibox&amp;state=</Label>
        <ul className="sg-anatomy sg-m6-cols">{UNIBOX_REVIEW_STATES.map((s) => <li key={s}><a className="c-link" href={`/app?view=unibox&state=${s}`}><code>{s}</code></a></li>)}</ul>
      </div>
      <div className="sg-card sg-m7-menu"><Label>triage menu · T opens · 1–6 pick · what Corral does next</Label>
        <div className="sg-m7-menuwrap"><TriageMenu t={t} open={open} onOpenChange={setOpen} onPick={(id) => setT((x) => ({ ...x, status: ({ interested: "Interested", objection: "Objection", referral: "Referral", ooo: "OOO", unsubscribe: "Unsubscribed", bounce: "Bounced" } as const)[id], triage: id }))} /></div>
      </div>
      <div className="sg-card sg-m6-wide sg-m7-keys"><Label>keyboard shortcuts · ?</Label><KeysSheet open inline onClose={noop} /></div>
    </div>
  );
}

export function ThreadViewDemo() {
  const w = th("wanjiru");
  return (
    <div className="sg-m7 sg-m7--thread">
      <div className="sg-card"><Label>earlier steps collapsed · the reply as plain text · quoted text and images behind a click</Label>
        <div className="sg-m7-stack"><History msgs={w.history ?? []} /><Message t={w} safe /></div></div>
      <div className="sg-m7-side">
        <div className="sg-card"><Label>fit (M5) · confidence · the checks that carried it</Label><div className="sg-m7-stack"><FitSummary t={w} /></div></div>
        <div className="sg-card"><Label>sequence (M6) · where the reply came from</Label><div className="sg-m7-stack"><SequenceTrail t={w} /><SequenceTrail t={th("daniel")} /></div></div>
        <div className="sg-card"><Label>replies go from the thread&rsquo;s mailbox</Label><MailboxLine t={w} /><MailboxLine t={th("amara")} disconnected /></div>
      </div>
    </div>
  );
}

const CASES: { label: string; id: string; kind: DraftKind; send?: SendKind; text?: string; safe?: boolean }[] = [
  { label: "drafting · reading the thread, checking the knowledge base", id: "wanjiru", kind: "drafting" },
  { label: "ready · each claim cites its knowledge-base line", id: "brian", kind: "ready" },
  { label: "low confidence · the draft asks instead of guessing", id: "amara", kind: "low" },
  { label: "refused · the reply asks for Never-say claims", id: "grace", kind: "refused" },
  { label: "edited · what changed, a price the KB disagrees on", id: "brian", kind: "edited", text: BRIAN_EDIT },
  { label: "send with undo · 10 seconds", id: "brian", kind: "ready", send: "undo" },
  { label: "failed · the provider refused; the reply is kept", id: "brian", kind: "ready", send: "failed" },
  { label: "mailbox disconnected · replies go from the thread's mailbox", id: "amara", kind: "low", send: "disconnected" },
  { label: "conflict · a teammate replied first", id: "brian", kind: "ready", send: "conflict" },
  { label: "handled by Corral · unsubscribe", id: "neema", kind: "none" },
];

export function CopilotStatesDemo() {
  return (
    <div className="sg-m7 sg-m7--drafts">
      {CASES.map((c) => {
        const t = th(c.id); const m = UNIBOX_COPILOT[c.id]?.draft;
        return (
          <div key={c.label} className="sg-card"><Label>{c.label}</Label>
            <div className="sg-m7-stack"><DraftArea t={t} model={m} copilot={UNIBOX_COPILOT[c.id]} kind={c.kind} send={c.send ?? "idle"} text={c.text ?? draftText(m)} original={draftText(m)}
              undoLeft={7} from={t.mailbox ?? "tomas@coldtrace.io"} handledNote={c.id === "neema" ? "Neema asked to be removed. Corral stopped Dairy proof drip for her and won’t write to her again." : undefined} a={A} /></div></div>
        );
      })}
    </div>
  );
}
