"use client";
/* The Unibox view in the app (M7, ENG-57): tabs, filters and triage over the list, the thread with Corral's
   draft, the lead rail. Moved from AppDemo and extended; the list / pane / rail are the M1 components. */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Thread } from "../data";
import { Button, Kbd } from "../primitives";
import { Icon } from "../icons";
import { Tabs } from "../Tabs";
import { EmptyState, ErrorState, Skeleton, SkeletonThreads } from "../States";
import { useToast } from "../Toaster";
import { ContextRail, ReadingPane, ThreadList } from "../Unibox";
import { UNDO_SECONDS, canSend, type DraftKind, type SendKind } from "@/lib/unibox/draft";
import { filterThreads, isFiltered, step, triageByKey, triageDef, type Filters, type Triage } from "@/lib/unibox/triage";
import type { UniboxReviewState } from "@/lib/unibox/state";
import { isHandoffState } from "@/lib/handoff/state";
import { HandoffProblems, HandoffRail, MeetingCard } from "../handoff/Handoff";
import { handoffFor } from "../handoff/data";
import { BRIAN_REDRAFT, COPILOT, HANDLED_NOTE, LEAD_FOLLOWUP, POOL_MAILBOX, TEAMMATE_REPLY, draftKindFor, seedFor, type UniboxTab } from "./data";
import { DraftArea, draftText, type DraftActions } from "./Copilot";
import { FilterChips, KeysSheet, RowTag, TriageMenu } from "./Triage";
import { FitSummary, FollowUpMessage, History, MailboxLine, Message, SentMessage, SequenceTrail, TeammateMessage } from "./Thread";

export const UNIBOX_TABS: { id: UniboxTab; label: string }[] = [{ id: "needs", label: "Needs you" }, { id: "meetings", label: "Meetings" }, { id: "snoozed", label: "Snoozed" }, { id: "all", label: "All" }];

/** Threads in a tab, before filters. Needs you leaves out what Corral handled and what's snoozed. */
export function inTab(threads: Thread[], tab: UniboxTab): Thread[] {
  if (tab === "snoozed") return threads.filter((t) => t.snoozed);
  if (tab === "all") return threads;
  const live = threads.filter((t) => !t.handled && !t.snoozed);
  return tab === "meetings" ? live.filter((t) => t.status === "Meeting booked") : live;
}
export const needsYou = (threads: Thread[]) => inTab(threads, "needs").length;
/** Where the selection goes when a thread leaves the list: the next one, or the previous at the end. */
export function neighbour(list: { id: string }[], id: string): string | undefined {
  const i = list.findIndex((t) => t.id === id);
  return (list[i + 1] ?? list[i - 1])?.id;
}

export type UniboxViewProps = {
  threads: Thread[]; setThreads: Dispatch<SetStateAction<Thread[]>>; active: string; setActive: (id: string) => void;
  tab: UniboxTab; setTab: (t: UniboxTab) => void; pane: "list" | "read"; setPane: (p: "list" | "read") => void;
  /** Review state (outside production): /app?state=… */
  state?: UniboxReviewState;
  onArchive: (id: string) => void;
  /** Persist a sent reply. The undo window still runs locally; the message is stored when it sends. */
  onSend?: (id: string, text: string) => void;
  /** Unibox keys (J K ↵ Esc E H 1–6 T R ⌘↵ ⌘Z ?). Off while another dialog or the palette is open. */
  hotkeys?: boolean;
};

export function UniboxView({ threads, setThreads, active, setActive, tab, setTab, pane, setPane, state, onArchive, onSend, hotkeys = true }: UniboxViewProps) {
  const toast = useToast();
  const seed = useMemo(() => seedFor(state), [state]);
  // M8: Grace's meeting, as the live app has it (booked) or as a handoff review state has it.
  const handoff = useMemo(() => handoffFor(isHandoffState(state) ? state : undefined), [state]);
  const copilotOf = useCallback((id: string) => (id === "grace" && handoff.copilot ? handoff.copilot : COPILOT[id]), [handoff]);
  const [load, setLoad] = useState(seed.load);
  const [filters, setFilters] = useState<Filters>(seed.filters);
  const [kinds, setKinds] = useState<Record<string, DraftKind>>(seed.draft);
  const [sends, setSends] = useState<Record<string, SendKind>>(seed.send);
  const [texts, setTexts] = useState<Record<string, string>>(seed.text);
  const [safe, setSafe] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState<Record<string, boolean>>({});
  const [own, setOwn] = useState<Record<string, boolean>>({});
  const [resolved, setResolved] = useState<Record<string, "discarded" | "note">>({});
  const [sent, setSent] = useState<Record<string, { text: string; at: string }>>(seed.send.brian === "sent" ? { brian: { text: draftText(COPILOT.brian.draft), at: seed.sentAt ?? "Just now" } } : {});
  const [undoLeft, setUndoLeft] = useState(seed.undoLeft ?? UNDO_SECONDS);
  const [ticking, setTicking] = useState(false);
  const [menu, setMenu] = useState(!!seed.menu);
  const [keys, setKeys] = useState(!!seed.keys);
  const [followed] = useState<Record<string, boolean>>(seed.followUp ? { brian: true } : {});
  const [redrafted, setRedrafted] = useState<Record<string, boolean>>({});
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const tabList = inTab(threads, tab);
  const shown = filterThreads(tabList, filters);
  const t = shown.find((x) => x.id === active) ?? shown[0];
  const kindOf = (id: string): DraftKind => kinds[id] ?? draftKindFor(id, copilotOf(id));
  const sendOf = (id: string): SendKind => sends[id] ?? "idle";
  const modelOf = (id: string) => (redrafted[id] && id === "brian" ? BRIAN_REDRAFT : safe[id] ? copilotOf(id)?.safe : copilotOf(id)?.draft);
  const textOf = (id: string) => (kindOf(id) === "edited" ? texts[id] ?? draftText(modelOf(id)) : draftText(modelOf(id)));
  const fromOf = (x: Thread) => x.mailbox ?? POOL_MAILBOX;

  const setKind = useCallback((id: string, k: DraftKind) => setKinds((m) => ({ ...m, [id]: k })), []);
  const setSend = useCallback((id: string, k: SendKind) => setSends((m) => ({ ...m, [id]: k })), []);

  // Undo countdown, then sending, then sent. Only after a real press (review states hold still).
  useEffect(() => {
    if (!ticking) return;
    const id = Object.keys(sends).find((k) => sends[k] === "undo");
    if (!id) return;
    if (undoLeft <= 0) return;
    const h = setTimeout(() => { if (undoLeft <= 1) setSend(id, "sending"); setUndoLeft((n) => n - 1); }, 1000);
    return () => clearTimeout(h);
  }, [ticking, sends, undoLeft, setSend]);
  useEffect(() => {
    if (!ticking) return;
    const id = Object.keys(sends).find((k) => sends[k] === "sending");
    if (!id) return;
    const h = setTimeout(() => {
      const text = textOf(id);
      setSent((m) => ({ ...m, [id]: { text, at: "Just now" } })); setSend(id, "sent");
      onSend?.(id, text);
      toast({ tone: "success", icon: "send", children: `Sent to ${threads.find((x) => x.id === id)?.name.split(" ")[0]}`, meta: "sequence stays stopped" });
    }, 900);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticking, sends]);
  useEffect(() => () => clearTimeout(draftTimer.current), []);

  const draft = useCallback((id: string, then: DraftKind = "ready") => {
    setKind(id, "drafting"); clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => setKind(id, then), 1600);
  }, [setKind]);

  const stopDraft = useCallback((id: string) => { clearTimeout(draftTimer.current); setKind(id, "none"); }, [setKind]);

  const send = (x: Thread, force = false) => {
    const s = force ? "idle" : sendOf(x.id); const k = kindOf(x.id);
    if (x.handled || s === "undo" || s === "sending" || s === "sent" || k === "drafting" || k === "none") return;
    if (k === "refused") { toast({ tone: "error", children: "Nothing to send yet. Write it yourself, or let Corral draft without those claims." }); return; }
    if (s === "disconnected" || s === "conflict" || s === "conflict-lead") return;
    const text = textOf(x.id);
    if (!canSend(text)) { setTried((m) => ({ ...m, [x.id]: true })); toast({ tone: "error", children: "Not sent: your reply says something on the Never-say list." }); return; }
    setSent((m) => ({ ...m, [x.id]: { text, at: "Just now" } }));
    setUndoLeft(UNDO_SECONDS); setTicking(true); setSend(x.id, "undo");
  };
  const undo = (x: Thread) => { if (sendOf(x.id) !== "undo") return; setSend(x.id, "idle"); setTicking(false); toast({ children: "Not sent. Your reply is back as a draft." }); };

  const retriage = (x: Thread, id: Triage) => {
    const d = triageDef(id); const prev = { status: x.status, triage: x.triage, handled: x.handled };
    if (x.status === d.status && !!x.handled === d.handled) return;
    setThreads((l) => l.map((y) => (y.id === x.id ? { ...y, status: d.status, triage: d.id, handled: d.handled } : y)));
    if (d.handled && tab !== "all") { const next = neighbour(shown, x.id); if (next) setActive(next); }
    toast({ tone: "success", children: `Marked ${d.label}`, meta: d.then.toLowerCase(),
      action: { label: "Undo", onClick: () => { setThreads((l) => l.map((y) => (y.id === x.id ? { ...y, ...prev } : y))); setActive(x.id); } } });
  };
  const snooze = (x: Thread) => {
    setThreads((l) => l.map((y) => (y.id === x.id ? { ...y, snoozed: "Mon 08:00" } : y)));
    const next = neighbour(shown, x.id); if (next) setActive(next);
    toast({ icon: "clock", children: `Snoozed ${x.name.split(" ")[0]} until Monday 08:00`, action: { label: "Undo", onClick: () => { setThreads((l) => l.map((y) => (y.id === x.id ? { ...y, snoozed: undefined } : y))); setActive(x.id); } } });
  };
  const reply = (x: Thread) => {
    const k = kindOf(x.id);
    if (x.handled) return;
    if (k === "none") draft(x.id, copilotOf(x.id) ? draftKindFor(x.id, copilotOf(x.id)) : "edited");
    else if (k === "ready" || k === "low") setKind(x.id, "edited");
    else if (k === "refused") { setOwn((m) => ({ ...m, [x.id]: true })); setTexts((m) => ({ ...m, [x.id]: "" })); setKind(x.id, "edited"); }
    else if (k === "edited") document.querySelector<HTMLTextAreaElement>(".c-ux__pane textarea")?.focus();
  };

  // Unibox keys. The shell's own keys (⌘K, G then a letter) stay in AppDemo.
  const keyState = useRef({ shown, t, pane, menu, keys });
  const handlers = useRef({ send, undo, retriage, snooze, reply });
  useEffect(() => { keyState.current = { shown, t, pane, menu, keys }; handlers.current = { send, undo, retriage, snooze, reply }; });
  useEffect(() => {
    if (!hotkeys) return;
    const k = (e: KeyboardEvent) => {
      const { shown: list, t: cur, menu: m, keys: ks } = keyState.current;
      const h = handlers.current;
      const target = e.target as HTMLElement;
      const typing = !!target.closest?.("input, textarea, [contenteditable]");
      const mod = e.metaKey || e.ctrlKey;
      if (ks || m || !cur) return;
      if (mod && e.key === "Enter") { if (!typing || target.closest(".c-ux__pane")) { e.preventDefault(); h.send(cur); } return; }
      if (mod && e.key.toLowerCase() === "z" && !typing) { if (sends[cur.id] === "undo") { e.preventDefault(); h.undo(cur); } return; }
      if (typing || mod || e.altKey || target.closest("[role=dialog], [role=menu], [role=listbox]:not(.c-threads)")) return;
      const key = e.key;
      if (key === "j" || key === "k") { e.preventDefault(); const n = step(list, cur.id, key === "j" ? 1 : -1); if (n) setActive(n); return; }
      if (key === "Enter" && target === document.body) { setPane("read"); return; }
      if (key === "Escape") { setPane("list"); return; }
      if (key === "e") { onArchive(cur.id); return; }
      if (key === "h") { h.snooze(cur); return; }
      if (key === "t") { e.preventDefault(); setMenu(true); return; }
      if (key === "r") { e.preventDefault(); h.reply(cur); return; }
      if (key === "?") { e.preventDefault(); setKeys(true); return; }
      const d = triageByKey(key); if (d) { e.preventDefault(); h.retriage(cur, d.id); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hotkeys, sends, setActive, setPane, onArchive]);

  const label = UNIBOX_TABS.find((x) => x.id === tab)!.label;
  const counts = { needs: inTab(threads, "needs").length, meetings: inTab(threads, "meetings").length, snoozed: inTab(threads, "snoozed").length, all: threads.length };
  const subbar = (
    <div className="c-subbar"><Tabs label="Unibox" tabs={UNIBOX_TABS.map((x) => ({ ...x, count: x.id === "snoozed" && !counts.snoozed ? undefined : counts[x.id] }))} value={tab} onChange={(v) => setTab(v as UniboxTab)} />
      <span className="c-subbar__keys"><Kbd>J</Kbd><Kbd>K</Kbd> move<Kbd>1–6</Kbd> triage<Kbd>R</Kbd> reply<Kbd>E</Kbd> archive
        <button type="button" className="u-keysbtn" onClick={() => setKeys(true)} aria-label="Keyboard shortcuts"><Kbd>?</Kbd></button></span></div>
  );

  if (load === "loading") return (
    <div className="c-view">{subbar}
      <div className="c-ux" data-pane="list">
        <div className="c-ux__list"><div className="c-threads"><div className="c-threads__head"><span className="c-strong" style={{ fontSize: 14 }}>{label}</span></div><SkeletonThreads rows={6} /></div></div>
        <div className="c-ux__pane" aria-hidden="true"><div className="c-pane u-paneskel"><div className="u-paneskel__head"><Skeleton w={36} h={36} r={18} /><div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}><Skeleton w={160} /><Skeleton w={260} h={8} /></div></div>
          <div className="u-paneskel__body"><Skeleton w="70%" h={12} /><Skeleton w="96%" /><Skeleton w="88%" /><Skeleton w="100%" h={140} r={10} /></div></div></div>
        <div className="c-ux__rail" aria-hidden="true"><aside className="c-rail"><div className="c-rail__sec"><Skeleton w={140} /><Skeleton w={100} h={8} /></div><div className="c-rail__sec"><Skeleton w="100%" h={8} /><Skeleton w="80%" /></div></aside></div>
      </div>
    </div>
  );
  if (load === "error") return (
    <div className="c-view">{subbar}<div className="c-view c-view--center"><ErrorState title="Couldn’t load the Unibox" detail="GET /api/v1/threads?tab=needs · 503"
      actions={<Button variant="primary" onClick={() => setLoad(undefined)}><Icon name="refresh" />Try again</Button>}>
      Your mailboxes are fine and replies are still arriving; this is only the page failing to load them. Nothing was sent or archived.</ErrorState></div></div>
  );

  const handledN = threads.filter((x) => x.handled).length;
  const empty = !tabList.length ? (
    tab === "snoozed" ? <EmptyState art="range" title="Nothing snoozed">Press <span className="c-kbd">H</span> on a thread to hide it until a date. It comes back to the top of Needs you on that morning.</EmptyState>
    : tab === "meetings" ? <EmptyState art="range" title="No meetings booked yet">When someone books through your Cal.com link, the thread moves here and the sequence stops.</EmptyState>
    : <EmptyState art="range" title="Nothing needs you" actions={handledN ? <Button onClick={() => setTab("all")}>See what Corral handled</Button> : undefined}>
        Every reply is answered or waiting on the other side. {handledN ? `Corral handled ${handledN} on its own (out of office, unsubscribes, bounces); they’re in All.` : ""} New replies land here first.</EmptyState>
  ) : null;

  const a: DraftActions | undefined = !t ? undefined : {
    onDraft: () => draft(t.id, draftKindFor(t.id, copilotOf(t.id)) === "none" ? "edited" : draftKindFor(t.id, copilotOf(t.id))),
    onStop: () => stopDraft(t.id),
    onSend: () => send(t), onEdit: () => { setSend(t.id, "idle"); setKind(t.id, "edited"); },
    onBack: () => { setOwn((m) => ({ ...m, [t.id]: false })); setTexts((m) => { const n = { ...m }; delete n[t.id]; return n; }); setKind(t.id, draftKindFor(t.id, copilotOf(t.id)) === "refused" ? "ready" : draftKindFor(t.id, copilotOf(t.id))); setTried((m) => ({ ...m, [t.id]: false })); },
    onText: (s: string) => setTexts((m) => ({ ...m, [t.id]: s })),
    onUndo: () => undo(t),
    onRetry: () => { setSend(t.id, "sending"); setTicking(true); },
    onReconnect: () => { setSend(t.id, "idle"); toast({ tone: "success", children: "hello@coldtrace-mail.com reconnected", meta: "your reply is ready to send" }); },
    onKeepDraft: () => { setSend(t.id, "idle"); toast({ children: "Kept as a draft. It sends once the mailbox is back." }); },
    onDiscard: () => { setSend(t.id, "idle"); setResolved((m) => ({ ...m, [t.id]: "discarded" })); toast({ children: "Your reply is discarded. Amara’s stands." }); },
    onSendAnyway: () => send(t, true),
    onRedraftBoth: () => { setSend(t.id, "idle"); setRedrafted((m) => ({ ...m, [t.id]: true })); draft(t.id, "ready"); toast({ icon: "refresh", children: `Redrafting to answer both of ${t.name.split(" ")[0]}’s emails` }); },
    onKeepNote: () => { setSend(t.id, "idle"); setResolved((m) => ({ ...m, [t.id]: "note" })); toast({ icon: "users", children: "Saved as a note for Amara on this thread" }); },
    onWriteOwn: () => { setOwn((m) => ({ ...m, [t.id]: true })); setTexts((m) => ({ ...m, [t.id]: "" })); setKind(t.id, "edited"); },
    onDraftSafe: () => { setSafe((m) => ({ ...m, [t.id]: true })); draft(t.id, "ready"); },
    onRedraft: (how: string) => { draft(t.id, kindOf(t.id) === "low" ? "low" : "ready"); toast({ icon: "refresh", children: `Redrafting: ${how.toLowerCase()}` }); },
    onUnhandle: () => { setThreads((l) => l.map((y) => (y.id === t.id ? { ...y, handled: false } : y))); toast({ children: `${t.name.split(" ")[0]} is back in Needs you` }); },
    onTriage: () => setMenu(true),
  };
  const s = t ? sendOf(t.id) : "idle";
  const mine = t && sent[t.id] && (s === "undo" || s === "sending" || s === "sent") ? sent[t.id] : undefined;
  const card = t && <DraftArea key={`d-${t.id}`} t={t} model={modelOf(t.id)} copilot={copilotOf(t.id)} kind={kindOf(t.id)} send={s}
    text={textOf(t.id)} original={own[t.id] ? "" : draftText(modelOf(t.id))} undoLeft={undoLeft} from={fromOf(t)} tried={tried[t.id]} handledNote={HANDLED_NOTE[t.id]} a={a!} />;
  // The meeting as an event in the thread: a booking sits where it happened (before Grace's note about it); a move, a
  // cancellation or a no-show happened after the last message, so it sits under it.
  const meet = !t?.meeting ? undefined : t.meeting === "booked" && handoff.meeting.status === "booked" ? "early" : "late";
  const meetBlock = t?.meeting && <><MeetingCard key={`mc-${handoff.key}`} h={handoff} /><HandoffProblems key={`hp-${handoff.key}`} h={handoff} /></>;
  const again = t && followed[t.id] ? <FollowUpMessage {...LEAD_FOLLOWUP} /> : null;
  const rest = !t ? null
    : resolved[t.id] ? <><TeammateMessage {...TEAMMATE_REPLY} /><p className="u-resolved"><Icon name="check" size={12} />{resolved[t.id] === "note" ? "Your reply is saved as a note on this thread; only your team sees it." : "Your reply was discarded. Amara’s answer stands."}</p></>
    : s === "sent" && mine ? <><SentMessage text={mine.text} at={mine.at} from={fromOf(t)} />
        <p className="u-resolved"><Icon name="check" size={12} />Sent from {fromOf(t)} in this thread. {t.seq ? `${t.seq.name} stays stopped for ${t.name.split(" ")[0]}.` : ""}</p></>
    : mine ? <><SentMessage text={mine.text} at={mine.at} from={fromOf(t)} pending />{card}</>
    : card;
  const slot = again ? <>{again}{rest}</> : rest;

  return (
    <div className="c-view">
      {subbar}
      {empty ?? (
        <div className="c-ux" data-pane={pane}>
          <div className="c-ux__list u-list"><FilterChips list={tabList} filters={filters} onChange={setFilters} />
            <ThreadList threads={shown} active={t?.id ?? ""} title={label} count={shown.length} tag={(x) => <RowTag t={x} />}
            onPick={(id) => { setActive(id); setPane("read"); }} />
            {!shown.length && <div className="u-nomatch"><span>No threads match these filters.</span><Button onClick={() => setFilters({ triage: [], unread: false })}>Clear filters</Button></div>}</div>
          {t && <>
            <div className="c-ux__pane">
              <button type="button" className="c-ux__back" onClick={() => setPane("list")}><Icon name="back" />{label}</button>
              <ReadingPane t={t} tag={<TriageMenu t={t} open={menu} onOpenChange={setMenu} onPick={(id) => retriage(t, id)} />}
                history={<>{meet === "early" && meetBlock}<History key={`h-${t.id}`} msgs={t.history ?? []} /></>}
                message={<Message key={`m-${t.id}`} t={t} safe={state === "thread"} />}
                draft={<>{meet === "late" && meetBlock}{slot}</>} />
            </div>
            <div className="c-ux__rail"><ContextRail t={t} fit={<FitSummary t={t} />} sequence={<SequenceTrail t={t} />} extra={<><MailboxLine t={t} disconnected={s === "disconnected"} />{t.meeting && <HandoffRail h={handoff} />}</>} /></div>
          </>}
        </div>
      )}
      <KeysSheet open={keys} onClose={() => setKeys(false)} />
      {isFiltered(filters) && <span className="u-sr" role="status">{shown.length} threads match</span>}
    </div>
  );
}
