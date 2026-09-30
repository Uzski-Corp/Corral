import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { SequencesView, type SeqTab } from "./Sequences";
import { MailboxCard, PoolLine } from "./Pool";
import { CopilotPanel, Preview, stripCites } from "./Editor";
import { COPILOT, DRAFT, POOL_HEALTHY, POOL_ISSUES, RECIPIENTS, seedFor } from "./data";
import { DEMO_TODAY_M4 } from "../discovery/data";
import type { SequenceReviewState } from "@/lib/sequences/state";

function Host({ state, signal = 0 }: { state?: SequenceReviewState; signal?: number }) {
  const [tab, setTab] = useState<SeqTab>(seedFor(state).tab);
  const [pool, setPool] = useState(seedFor(state).pool);
  return <ToastProvider><SequencesView state={state} tab={tab} onTabChange={setTab} pool={pool} onPoolChange={setPool} newSignal={signal} /></ToastProvider>;
}
const steps = () => screen.getByRole("region", { name: "Steps" });
const body = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
afterEach(() => vi.useRealTimers());

describe("SequencesView · builder", () => {
  it("starts from nothing: what a sequence is, then a blank step or Corral's draft", async () => {
    render(<Host state="empty" />);
    expect(screen.getByText("Write your first sequence")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start blank" }));
    expect(screen.getByRole("heading", { name: "Untitled sequence" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Step 1" })).toBeInTheDocument();
    expect(screen.getByText("1 thing to fix before launch")).toBeInTheDocument();
  });

  it("drafts with Corral from the empty state", async () => {
    render(<Host state="empty" />);
    await userEvent.click(screen.getByRole("button", { name: /Draft one with Corral/ }));
    expect(screen.getByRole("region", { name: "Corral's draft" })).toBeInTheDocument();
  });

  it("shows a draft's steps, waits, conditions and exits; gates are editable", async () => {
    render(<Host state="draft" />);
    const s = steps();
    expect(within(s).getAllByRole("button", { name: /^Step \d/ })).toHaveLength(3);
    expect(within(s).getByText("Replied")).toBeInTheDocument();
    expect(screen.getByText("2 things to fix before launch")).toBeInTheDocument();
    await userEvent.click(within(s).getByRole("button", { name: "Send step 3: Opened, no reply" }));
    await userEvent.click(screen.getByRole("option", { name: /^Not opened/ }));
    expect(within(s).getByRole("button", { name: "Send step 3: Not opened" })).toBeInTheDocument();
    await userEvent.click(within(s).getByRole("button", { name: "Send step 2: No reply" }));
    await userEvent.click(screen.getByRole("option", { name: /Opened, no reply/ }));
    expect(within(s).getByRole("button", { name: "Everyone else at step 2: Stop" })).toBeInTheDocument();
    await userEvent.click(within(s).getByRole("button", { name: "Wait before step 2: 3 days" }));
    await userEvent.click(screen.getByRole("option", { name: "7 days" }));
    expect(screen.getAllByText(/3 steps · 12 days/).length).toBeGreaterThan(0);
    await userEvent.click(within(s).getByRole("button", { name: "Everyone else at step 2: Stop" }));
    await userEvent.click(screen.getByRole("option", { name: "Skip this step" }));
    expect(within(s).getByRole("button", { name: "Everyone else at step 2: Skip this step" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Can’t launch yet: 2 things to fix");
  });

  it("opens the condition menu for review", () => {
    render(<Host state="conditions" />);
    expect(screen.getByRole("listbox", { name: "Send step 3" })).toBeInTheDocument();
  });

  it("adds a step and opens it", async () => {
    render(<Host state="draft" />);
    await userEvent.click(screen.getByRole("button", { name: "Add a step" }));
    expect(screen.getByRole("region", { name: "Step 4" })).toBeInTheDocument();
    expect(screen.getByText(/same thread as step 1/)).toBeInTheDocument();
  });

  it("creates a new sequence from the top bar", () => {
    const { rerender } = render(<Host state="draft" />);
    rerender(<Host state="draft" signal={1} />);
    expect(screen.getByRole("heading", { name: "Untitled sequence" })).toBeInTheDocument();
  });

  it("goes back to the list and switches sequences", async () => {
    render(<Host state="draft" />);
    await userEvent.click(screen.getByRole("button", { name: /Cold-room pilot/ }));
    expect(screen.getByRole("heading", { name: "Cold-room pilot" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All sequences" }));
    await userEvent.click(screen.getByRole("button", { name: "New sequence" }));
    expect(screen.getByRole("heading", { name: "Untitled sequence" })).toBeInTheDocument();
  });
});

describe("SequencesView · step editor", () => {
  it("writes with variables and previews a real company", async () => {
    render(<Host state="editor" />);
    const ed = screen.getByRole("region", { name: "Step 1" });
    const mail = within(ed).getByRole("article", { name: "Email to Lena Fischer" });
    expect(mail).toHaveTextContent("your 14 cold rooms in Athi River");
    expect(within(ed).getByText("Empty for 23 of 86")).toBeInTheDocument();
    await userEvent.click(within(ed).getByRole("button", { name: /Insert variable/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Job title/ }));
    expect(body().value).toContain("{{title}}");
    await userEvent.click(within(ed).getByRole("button", { name: "Add a fallback" }));
    expect(body().value).toContain("{{cold_storage | your cold rooms}}");
    fireEvent.change(within(ed).getByRole("textbox", { name: "Subject" }), { target: { value: "New subject" } });
    expect(within(ed).getByRole("textbox", { name: "Subject" })).toHaveValue("New subject");
    fireEvent.change(body(), { target: { value: "Just text" } });
    expect(within(ed).getByText("Missing: every email needs one")).toBeInTheDocument();
    await userEvent.click(within(ed).getByRole("button", { name: "Add it" }));
    expect(body().value).toContain("{{unsubscribe_link}}");
    await userEvent.click(within(ed).getByRole("button", { name: /Preview as/ }));
    await userEvent.click(screen.getByRole("option", { name: /Brenda/ }));
    expect(within(ed).getByRole("article", { name: "Email to Brenda Ainembabazi" })).toBeInTheDocument();
    await userEvent.click(within(ed).getByRole("tab", { name: /Preview as Brenda/ }));
    await userEvent.click(within(ed).getByRole("button", { name: "Close step" }));
    expect(screen.queryByRole("region", { name: "Step 1" })).not.toBeInTheDocument();
  });

  it("shows Corral's draft with its citations, and uses it", async () => {
    render(<Host state="copilot" />);
    const cop = screen.getByRole("region", { name: "Corral's draft" });
    expect(within(cop).getAllByRole("link", { name: /Knowledge line/ })).toHaveLength(4);
    expect(within(cop).getByText(/Checked against Never say/)).toBeInTheDocument();
    expect(within(cop).getByRole("link", { name: "Resolve it in Pricing and terms" })).toHaveAttribute("href", "/app?view=knowledge&state=conflict");
    await userEvent.click(within(cop).getByRole("button", { name: "Use this draft" }));
    expect(body().value).toContain("Most spoilage is found in the morning");
    expect(body().value).not.toContain("[1]");
    await userEvent.click(screen.getByRole("button", { name: /Draft with Corral/ }));
    await userEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(screen.queryByRole("region", { name: "Corral's draft" })).not.toBeInTheDocument();
  });

  it("blocks launch and says what to fix, in which step", async () => {
    render(<Host state="errors" />);
    const alert = screen.getAllByRole("alert").find((a) => a.textContent?.includes("Can’t launch yet"))!;
    expect(alert).toHaveTextContent("{{cold_storage}} is empty for 23 of 86 companies");
    expect(alert).toHaveTextContent("Step 2 has no unsubscribe link");
    expect(screen.getByRole("article", { name: "Email to Brenda Ainembabazi" })).toHaveTextContent("[cold_storage]");
    await userEvent.click(within(alert).getByRole("button", { name: "Fix in step 2" }));
    expect(screen.getByRole("region", { name: "Step 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add it" }));
    expect(screen.getAllByRole("alert").find((a) => a.textContent?.includes("Can’t launch yet"))).toHaveTextContent("1 thing to fix");
  });
});

describe("SequencesView · launch, run, pause", () => {
  it("confirms who gets it and when", async () => {
    render(<Host state="launch" />);
    const d = screen.getByRole("dialog", { name: "Launch Dairy cold rooms · first touch" });
    expect(d).toHaveTextContent("82 companies get step 1");
    expect(d).toHaveTextContent("82 of 86 in Dairy & cold rooms · East Africa");
    expect(d).toHaveTextContent("4 already in Cold-room pilot");
    expect(d).toHaveTextContent("9 emails older than 90 days are re-checked first");
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("launches live: fix, confirm, check, schedule, run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Host />);
    await user.click(screen.getByRole("button", { name: /Dairy cold rooms/ }));
    await user.click(screen.getByRole("button", { name: "Launch" }));
    await user.click(screen.getByRole("button", { name: "Fix in step 1" }));
    await user.click(screen.getByRole("button", { name: "Add a fallback" }));
    await user.click(screen.getByRole("button", { name: "Fix in step 2" }));
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await user.click(screen.getByRole("button", { name: "Launch" }));
    await user.click(screen.getByRole("button", { name: /Launch to 82/ }));
    expect(screen.getByRole("region", { name: "Launching" })).toHaveTextContent("Nothing has been sent yet");
    for (let i = 0; i < 3; i++) await act(async () => { vi.advanceTimersByTime(1200); });
    expect(screen.getByText("Dairy cold rooms · first touch is running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("cancels a launch", async () => {
    render(<Host state="launching" />);
    expect(screen.getByText("Re-checking 9 emails older than 90 days")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel launch" }));
    expect(screen.getByRole("button", { name: "Launch" })).toBeInTheDocument();
  });

  it("pauses a running sequence, with undo", async () => {
    render(<Host state="running" />);
    expect(screen.getByText("Enrolled")).toBeInTheDocument();
    expect(screen.getByText(/Next: Tomorrow/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /^Step 2/ })[0]);
    expect(screen.getByText(/Pause the sequence to change its steps/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Paused Cold-room pilot")).toBeInTheDocument();
    expect(screen.getByText(/Paused by Tomás Ibarra · just now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("resumes a paused sequence", async () => {
    render(<Host state="paused" />);
    expect(screen.getByText(/Paused by Tomás Ibarra/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText("Resumed Dairy proof drip")).toBeInTheDocument();
  });

  it("loads, fails and retries", async () => {
    const { unmount } = render(<Host state="loading" />);
    expect(screen.getByRole("status", { name: "Loading sequences" })).toBeInTheDocument();
    unmount();
    render(<Host state="error" />);
    expect(screen.getByText("Couldn’t load sequences")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByRole("heading", { name: "Cold-room pilot" })).toBeInTheDocument();
  });
});

describe("SequencesView · mailbox pool", () => {
  it("shows problems first and acts on them", async () => {
    render(<Host state="mailboxes" />);
    const cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveAccessibleName("hello@coldtrace-mail.com");
    expect(cards[1]).toHaveAccessibleName("ops@coldtrace-mail.com");
    expect(screen.getByText(/need you/)).toBeInTheDocument();
    const amara = screen.getByRole("article", { name: "amara@coldtrace.io" });
    expect(within(amara).getByRole("img", { name: "Warm-up day 9 of 14" })).toBeInTheDocument();
    expect(amara).toHaveTextContent("20 a day now, 35 from Oct 4");
    await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(await screen.findByText("Reconnected hello@coldtrace-mail.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See the 4 bounces" }));
    expect(await screen.findByText("4 bounces today")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send again now" }));
    expect(await screen.findByText("ops@coldtrace-mail.com is sending again")).toBeInTheDocument();
    const tomas = screen.getByRole("article", { name: "tomas@coldtrace.io" });
    await userEvent.click(within(tomas).getByRole("radio", { name: "20" }));
    expect(await screen.findByText("Daily cap set to 20")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Sequences/ }));
    expect(screen.getByRole("heading", { name: "Cold-room pilot" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See the pool" }));
    expect(screen.getByRole("heading", { name: "Mailbox pool" })).toBeInTheDocument();
  });
});

describe("pieces", () => {
  it("renders a pool line and a read-only card", () => {
    render(<><PoolLine pool={POOL_HEALTHY} /><MailboxCard m={POOL_ISSUES.find((m) => m.id === "sales")!} today={DEMO_TODAY_M4} /></>);
    expect(screen.getByText(/mailboxes sending/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("once warm")).toBeInTheDocument();
  });
  it("previews without a picker, and a copilot panel alone", () => {
    const onUse = vi.fn();
    render(<><Preview subject="Hi {{frist}}" body={stripCites(DRAFT.steps[0].body)} r={RECIPIENTS.find((r) => r.id === "mbarara")!} audience={86} /><CopilotPanel c={COPILOT} onUse={onUse} onKeep={vi.fn()} /></>);
    expect(screen.getByText(/Preview as Brenda/)).toBeInTheDocument();
    expect(screen.getByText("[frist?]")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this draft" }));
    expect(onUse).toHaveBeenCalled();
  });
});
