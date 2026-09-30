import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import type { Thread } from "../data";
import { ReadingPane, ThreadList, ContextRail, Unibox } from "../Unibox";
import { ReplyCard } from "../ReplyCard";
import { UniboxView, inTab, needsYou, neighbour } from "./UniboxView";
import { KeysSheet } from "./Triage";
import { COPILOT, UNIBOX_THREADS, draftKindFor, seedFor, type UniboxTab } from "./data";
import { draftText } from "./Copilot";
import type { UniboxReviewState } from "@/lib/unibox/state";

const archived: string[] = [];
function Host({ state }: { state?: UniboxReviewState }) {
  const seed = seedFor(state);
  const [threads, setThreads] = useState<Thread[]>(seed.empty ? UNIBOX_THREADS.filter((t) => t.handled) : UNIBOX_THREADS);
  const [active, setActive] = useState(seed.active);
  const [tab, setTab] = useState<UniboxTab>(seed.tab);
  const [pane, setPane] = useState(seed.pane);
  return <ToastProvider><UniboxView state={state} threads={threads} setThreads={setThreads} active={active} setActive={setActive} tab={tab} setTab={setTab} pane={pane} setPane={setPane}
    onArchive={(id) => { archived.push(id); setThreads((l) => l.filter((t) => t.id !== id)); }} /></ToastProvider>;
}
const list = () => screen.getByRole("listbox", { name: /Needs you|All|Meetings/ });
const selected = () => within(list()).getByRole("option", { selected: true });
afterEach(() => { vi.useRealTimers(); archived.length = 0; });

describe("Unibox data", () => {
  it("keeps Needs you to what needs you; handled threads live in All", () => {
    expect(needsYou(UNIBOX_THREADS)).toBe(6);
    expect(inTab(UNIBOX_THREADS, "all")).toHaveLength(9);
    expect(inTab(UNIBOX_THREADS, "meetings").map((t) => t.id)).toEqual(["grace"]);
    expect(inTab([{ ...UNIBOX_THREADS[0], snoozed: "Mon" }], "snoozed")).toHaveLength(1);
    expect(draftKindFor("grace")).toBe("refused");
    expect(draftKindFor("amara")).toBe("low");
    expect(draftKindFor("daniel")).toBe("none");
    expect(draftText(COPILOT.brian.draft)).not.toMatch(/\[\d\]/);
    expect(neighbour([{ id: "a" }, { id: "b" }, { id: "c" }], "b")).toBe("c");
    expect(neighbour([{ id: "a" }, { id: "b" }], "b")).toBe("a");
  });
  it("seeds every review state", () => {
    for (const s of ["panes", "filtered", "ooo", "empty", "loading", "error", "undo", undefined] as const) expect(seedFor(s).active).toBeTruthy();
  });
});

describe("UniboxView · panes and triage", () => {
  it("shows the list with filters, the thread and the rail with fit and sequence", () => {
    render(<Host state="panes" />);
    expect(within(list()).getAllByRole("option")).toHaveLength(6);
    expect(screen.getByRole("group", { name: "Filter threads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Triage: Objection. Change" })).toBeInTheDocument();
    expect(screen.getByText("Why it scored 91")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cold-room pilot" })).toHaveAttribute("href", "/app?view=sequences&state=running");
    expect(screen.getByText("Stopped: replied")).toBeInTheDocument();
  });

  it("filters by triage and unread, then clears", async () => {
    render(<Host state="filtered" />);
    expect(within(list()).getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Brian"), expect.stringContaining("Wanjiru")]);
    await userEvent.click(screen.getByRole("button", { name: /^Unread/ }));
    expect(within(list()).getAllByRole("option")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(within(list()).getAllByRole("option")).toHaveLength(6);
    await userEvent.click(screen.getByRole("button", { name: /^Referral/ }));
    expect(within(list()).getAllByRole("option")).toHaveLength(1);
  });

  it("says when filters match nothing", async () => {
    render(<Host state="panes" />);
    await userEvent.click(screen.getByRole("button", { name: /^Referral/ }));
    await userEvent.click(within(list()).getByRole("option"));
    await userEvent.keyboard("5");
    expect(screen.getByText("No threads match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(list()).getAllByRole("option")).toHaveLength(5);
  });

  it("triages from the menu: six kinds, what Corral does, with Undo", async () => {
    render(<Host state="triage-menu" />);
    const menu = screen.getByRole("menu", { name: "Triage Brian’s reply" });
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(6);
    expect(within(menu).getByRole("menuitemradio", { name: /Objection/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /Interested/ }));
    expect(screen.getByText("Marked Interested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Triage: Interested. Change" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Triage: Objection. Change" })).toBeInTheDocument();
  });

  it("works the menu from the keyboard: T opens, arrows and Escape, digits pick", async () => {
    render(<Host state="panes" />);
    await userEvent.keyboard("t");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Triage: Objection. Change" }));
    await userEvent.keyboard("3");
    expect(screen.getByRole("button", { name: "Triage: Referral. Change" })).toBeInTheDocument();
  });

  it("moves with J / K, triages with 1–6 (handled ones leave Needs you), archives with E, snoozes with H", async () => {
    render(<Host state="panes" />);
    expect(selected()).toHaveTextContent("Brian");
    await userEvent.keyboard("j");
    expect(selected()).toHaveTextContent("Wanjiru");
    await userEvent.keyboard("k");
    expect(selected()).toHaveTextContent("Brian");
    await userEvent.keyboard("4");
    expect(within(list()).getAllByRole("option")).toHaveLength(5);
    expect(screen.getByText("Marked Out of office")).toBeInTheDocument();
    expect(selected()).toHaveTextContent("Wanjiru");
    await userEvent.keyboard("j4");
    expect(selected()).toHaveTextContent("Reza");
    expect(within(list()).getAllByRole("option")).toHaveLength(4);
    await userEvent.keyboard("e");
    expect(archived).toEqual(["reza"]);
    await userEvent.keyboard("h");
    expect(screen.getByText(/Snoozed .* until Monday 08:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Snoozed/ }));
    expect(screen.getByRole("listbox", { name: "Snoozed" })).toBeInTheDocument();
  });

  it("opens the keys sheet with ?", async () => {
    render(<Host state="panes" />);
    await userEvent.keyboard("?");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("shows what Corral handled, and hands it back", async () => {
    render(<Host state="unsubscribe" />);
    expect(screen.getByText("Corral handled this")).toBeInTheDocument();
    expect(screen.getByText(/won’t write to neema@dodomadairy.co.tz again/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Change triage/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "It needs me" }));
    expect(screen.getByText("Neema is back in Needs you")).toBeInTheDocument();
    expect(screen.getByText(/No draft for Neema yet/)).toBeInTheDocument();
  });

  it("covers OOO and bounce with the sequence state", () => {
    const { unmount } = render(<Host state="ooo" />);
    expect(screen.getByText("Paused until 15 Oct, 09:00")).toBeInTheDocument();
    unmount();
    render(<Host state="bounce" />);
    expect(screen.getByText(/mwanzafish.co.tz is refusing mail/)).toBeInTheDocument();
    expect(screen.getAllByText(/Handled by Corral/).length).toBeGreaterThan(0);
  });

  it("renders the thread safely: history collapsed, quoted text and images behind a click", async () => {
    render(<Host state="thread" />);
    const hist = screen.getByRole("list", { name: "Earlier in this thread" });
    const first = within(hist).getAllByRole("button")[0];
    expect(first).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: /Quoted text hidden/ }));
    expect(screen.getByText(/Tomás Ibarra wrote/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /2 remote images blocked/ }));
    expect(screen.getByRole("button", { name: /Images from kilima.co.ke shown/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Why it scored 94" })).toHaveAttribute("href", "/app?view=companies&state=fit");
  });

  it("shows the referral intro to Aline", () => {
    render(<Host state="referral" />);
    expect(screen.getByText("Intro to Aline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send intro/ })).toBeInTheDocument();
  });

  it("has empty, loading and error states", async () => {
    const a = render(<Host state="empty" />);
    expect(screen.getByText("Nothing needs you")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See what Corral handled" }));
    expect(screen.getByRole("listbox", { name: "All" })).toBeInTheDocument();
    a.unmount();
    const b = render(<Host state="loading" />);
    expect(screen.getByRole("status", { name: "Loading conversations" })).toBeInTheDocument();
    b.unmount();
    render(<Host state="error" />);
    expect(screen.getByText("Couldn’t load the Unibox")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(list()).toBeInTheDocument();
  });

  it("empties the other tabs honestly", async () => {
    render(<Host state="panes" />);
    await userEvent.click(screen.getByRole("tab", { name: /Snoozed/ }));
    expect(screen.getByText("Nothing snoozed")).toBeInTheDocument();
  });
});

describe("UniboxView · Corral's draft", () => {
  it("shows a ready draft with its knowledge-base lines and what it left out", async () => {
    render(<Host state="draft" />);
    const card = screen.getByRole("region", { name: "Corral’s draft" });
    expect(within(card).getAllByRole("link", { name: /Source \d/ })).toHaveLength(3);
    expect(within(card).getByText(/No price: the knowledge base has \$35 and \$39/)).toBeInTheDocument();
    const toggle = within(card).getByRole("button", { name: /3 claims/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(within(card).getByRole("button", { name: /Redraft/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Shorter" }));
    expect(screen.getByRole("region", { name: "Corral is drafting a reply" })).toBeInTheDocument();
  });

  it("drafts, then shows the draft; Stop cancels", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Host state="drafting" />);
    expect(screen.getByRole("region", { name: "Corral is drafting a reply" })).toHaveAttribute("aria-busy", "true");
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByText(/No draft for Wanjiru yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Draft with Corral/ }));
    await act(async () => { vi.advanceTimersByTime(1700); });
    expect(screen.getByRole("region", { name: "Corral’s draft" })).toBeInTheDocument();
  });

  it("marks low confidence and points at the knowledge base", () => {
    render(<Host state="low" />);
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText(/The knowledge base doesn’t answer one question/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add it to the knowledge base" })).toHaveAttribute("href", "/app?view=knowledge");
  });

  it("refuses Never-say claims, then drafts without them or lets you write", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Host state="refused" />);
    expect(screen.getByText("Corral won’t draft this one")).toBeInTheDocument();
    expect(screen.getByText("Is ColdTrace FDA approved?")).toBeInTheDocument();
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(screen.getByText(/Nothing to send yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Draft without those claims/ }));
    await act(async () => { vi.advanceTimersByTime(1700); });
    const card = screen.getByRole("region", { name: "Corral’s draft" });
    expect(within(card).getByText(/The FDA doesn’t approve temperature sensors/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: /^Edit/ }));
    expect(screen.getByText(/Edited by you · 0 sentences changed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to Corral’s draft" }));
    expect(screen.getByRole("region", { name: "Corral’s draft" })).toBeInTheDocument();
  });

  it("writes your own from a refusal with R", async () => {
    render(<Host state="refused" />);
    await userEvent.keyboard("r");
    const box = screen.getByRole("textbox", { name: "Reply to Grace" });
    expect(box).toHaveValue("");
    expect(screen.getByText("Written by you")).toBeInTheDocument();
    expect(screen.getByText(/The reply is empty\./)).toBeInTheDocument();
  });

  it("checks your edit: price caution, Never-say blocks sending", async () => {
    render(<Host state="edited" />);
    const box = screen.getByRole("textbox", { name: "Reply to Brian" });
    expect(screen.getByText(/\$35 a month: the knowledge base has two prices/)).toBeInTheDocument();
    expect(screen.getByText(/Edited by you · 1 sentence changed/)).toBeInTheDocument();
    await userEvent.type(box, " It is FDA approved.");
    await userEvent.click(screen.getByRole("button", { name: /Send reply/ }));
    expect(screen.getByText(/Not sent: your reply says something on the Never-say list/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Before this sends" }).querySelector(".is-tried")).not.toBeNull();
  });

  it("sends with a 10-second undo, then sends and stays in the thread", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Host state="draft" />);
    await userEvent.click(screen.getByRole("button", { name: /Send reply/ }));
    expect(screen.getByText("Sending to Brian in 10s")).toBeInTheDocument();
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(screen.getByText("Not sent. Your reply is back as a draft.")).toBeInTheDocument();
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(screen.getByText("Sending to Brian in 10s")).toBeInTheDocument();
    for (let i = 0; i < 10; i++) await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Sending")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/Cold-room pilot stays stopped for Brian/)).toBeInTheDocument();
  });

  it("holds still in the review states for undo, sending and sent", () => {
    const a = render(<Host state="undo" />);
    expect(screen.getByText("Sending to Brian in 7s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
    a.unmount();
    const b = render(<Host state="sending" />);
    expect(screen.getByText("Sending")).toBeInTheDocument();
    b.unmount();
    render(<Host state="sent" />);
    expect(screen.getByText("09:44")).toBeInTheDocument();
  });

  it("keeps a failed reply and retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Host state="failed" />);
    expect(screen.getByText(/421 4.7.0/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/stays stopped for Brian/)).toBeInTheDocument();
  });

  it("waits for a disconnected mailbox; Reconnect or keep the draft", async () => {
    const a = render(<Host state="disconnected" />);
    expect(screen.getByText("Can’t send yet")).toBeInTheDocument();
    expect(screen.getByText(/Disconnected since 06:12/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reconnect hello@" }));
    expect(screen.getByText("hello@coldtrace-mail.com reconnected")).toBeInTheDocument();
    a.unmount();
    render(<Host state="disconnected" />);
    await userEvent.click(screen.getByRole("button", { name: "Keep as draft" }));
    expect(screen.getByText(/It sends once the mailbox is back/)).toBeInTheDocument();
  });

  it("holds a reply when a teammate answered first: discard, note, or send too", async () => {
    const a = render(<Host state="conflict" />);
    expect(screen.getByText("Teammate")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard mine" }));
    expect(screen.getByText("Your reply was discarded. Amara’s answer stands.")).toBeInTheDocument();
    a.unmount();
    const b = render(<Host state="conflict" />);
    await userEvent.click(screen.getByRole("button", { name: "Keep as a note for Amara" }));
    expect(screen.getByText(/saved as a note on this thread/)).toBeInTheDocument();
    b.unmount();
    render(<Host state="conflict" />);
    await userEvent.click(screen.getByRole("button", { name: "Send mine too" }));
    expect(screen.getByText("Sending to Brian in 10s")).toBeInTheDocument();
  });

  it("holds a reply when the lead wrote again: redraft, edit mine, or send mine anyway", async () => {
    const a = render(<Host state="conflict-lead" />);
    expect(screen.getByText("Wrote again")).toBeInTheDocument();
    expect(screen.getByText("On hold: Brian wrote again")).toBeInTheDocument();
    expect(screen.getByText(/so it answers what he said/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Redraft" }));
    expect(screen.getByText(/Redrafting to answer both of Brian’s emails/)).toBeInTheDocument();
    expect(await screen.findByText(/Fair point on numbers first/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Wrote again")).toBeInTheDocument();
    a.unmount();
    const b = render(<Host state="conflict-lead" />);
    await userEvent.click(screen.getByRole("button", { name: "Edit mine" }));
    expect(screen.getByRole("textbox", { name: "Reply to Brian" })).toBeInTheDocument();
    b.unmount();
    render(<Host state="conflict-lead" />);
    await userEvent.click(screen.getByRole("button", { name: "Send mine anyway" }));
    expect(screen.getByText("Sending to Brian in 10s")).toBeInTheDocument();
    expect(screen.getByText("Wrote again")).toBeInTheDocument();
  });

  it("ignores keys while typing and in dialogs", async () => {
    render(<Host state="edited" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Reply to Brian" }), "j");
    expect(selected()).toHaveTextContent("Brian");
  });
});

describe("M1 Unibox pieces stay as they were", () => {
  it("renders the marketing Unibox and the pieces without M7 props", async () => {
    render(<Unibox />);
    expect(screen.getByRole("listbox", { name: "Needs you" })).toBeInTheDocument();
    expect(screen.getByText(/paid the sensors back/)).toBeInTheDocument();
    expect(screen.getByText("Cold-room pilot · step 2 of 4 · paused on reply")).toBeInTheDocument();
  });
  it("falls back to a monogram and the sender's domain for companies outside the sample", () => {
    const t = UNIBOX_THREADS.find((x) => x.id === "bounce")!;
    render(<><ThreadList threads={[t]} active="bounce" /><ReadingPane t={t} /><ContextRail t={t} /><ReplyCard paragraphs={["Hi"]} /></>);
    expect(screen.getAllByText("mwanzafish.co.tz").length).toBeGreaterThan(0);
  });
  it("lists the shortcut groups", () => {
    render(<KeysSheet open onClose={() => {}} inline />);
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["Move", "Triage", "Reply"]);
  });
});
