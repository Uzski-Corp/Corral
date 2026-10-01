import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../Toaster";
import type { Thread } from "../data";
import { UniboxView } from "../unibox/UniboxView";
import { UNIBOX_THREADS, seedFor, type UniboxTab } from "../unibox/data";
import { LeadsView } from "../leads";
import { HandoffProblems, HandoffSection, HandoffSteps, MeetingCard } from "./Handoff";
import { HANDOFFS, handoffFor } from "./data";
import { HANDOFF_REVIEW_STATES, type HandoffReviewState } from "@/lib/handoff/state";
import type { UniboxReviewState } from "@/lib/unibox/state";

const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

function Host({ state }: { state?: UniboxReviewState }) {
  const seed = seedFor(state);
  const [threads, setThreads] = useState<Thread[]>(UNIBOX_THREADS.map((t) => (seed.patch?.[t.id] ? { ...t, ...seed.patch[t.id] } : t)));
  const [active, setActive] = useState(seed.active);
  const [tab, setTab] = useState<UniboxTab>(seed.tab);
  const [pane, setPane] = useState(seed.pane);
  return <ToastProvider><UniboxView state={state} threads={threads} setThreads={setThreads} active={active} setActive={setActive} tab={tab} setTab={setTab} pane={pane} setPane={setPane} onArchive={() => {}} /></ToastProvider>;
}

describe("handoff data", () => {
  it("has a scenario for every handoff review state, all on Grace’s meeting", () => {
    expect(Object.keys(HANDOFFS).sort()).toEqual([...HANDOFF_REVIEW_STATES].sort());
    for (const s of HANDOFF_REVIEW_STATES) expect(handoffFor(s).meeting.uid).toBe("bk_7Hq2Lw");
    expect(handoffFor().key).toBe("meeting-booked");
  });
  it("applies the rules: a cancellation stops the follow-up and reopens the thread", () => {
    expect(handoffFor("meeting-cancelled").after).toMatchObject({ tab: "needs", nurture: "stopped", draft: true });
    expect(handoffFor("meeting-booked").after).toMatchObject({ tab: "meetings", sequence: "stop" });
    expect(handoffFor("nurture-off").nurture.state).toBe("waiting");
  });
});

describe("<MeetingCard>", () => {
  it("shows a booking with its time, guests and receipts", () => {
    wrap(<MeetingCard h={handoffFor("meeting-booked")} />);
    const card = screen.getByRole("region", { name: "Meeting: booked" });
    expect(within(card).getByText("Grace booked a meeting")).toBeInTheDocument();
    expect(within(card).getByText("Thu 1 Oct, 10:30–10:50 EAT")).toBeInTheDocument();
    expect(within(card).getByText("Mercy Mushi")).toBeInTheDocument();
    expect(within(card).getByText(/BOOKING_CREATED, signature checked/)).toBeInTheDocument();
  });
  it("shows the old time struck through when a meeting moves, and the reason", () => {
    wrap(<MeetingCard h={handoffFor("meeting-rescheduled")} />);
    expect(screen.getByText("Grace moved the meeting")).toBeInTheDocument();
    expect(screen.getByText("Thu 1 Oct, 10:30").tagName).toBe("S");
    expect(screen.getByText(/Mercy is at the Arusha plant/)).toBeInTheDocument();
  });
  it("marks a no-show and says who marked it; compact leaves out guests and receipts", () => {
    wrap(<MeetingCard h={handoffFor("meeting-no-show")} compact />);
    expect(screen.getByText("Nobody from Nyota joined")).toBeInTheDocument();
    expect(screen.getByText(/marked Grace and Mercy as no-shows/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Guests" })).toBeNull();
  });
});

describe("<HandoffSteps> and <HandoffProblems>", () => {
  it("lists the three handoffs with their state", () => {
    wrap(<HandoffSteps h={handoffFor("meeting-booked")} />);
    const steps = screen.getByRole("list", { name: "Handoffs" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Cal.com"), expect.stringContaining("PX-2288"), expect.stringContaining("Before your call")]);
  });
  it("says why Phoenix refused the deal and links to the fix", async () => {
    wrap(<HandoffProblems h={handoffFor("deal-error")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("401 invalid_signature");
    expect(screen.getByRole("link", { name: "Update the secret" })).toHaveAttribute("href", "/app/settings?state=error");
    await userEvent.click(screen.getByRole("button", { name: "Try again now" }));
    expect(await screen.findByText(/Phoenix still says 401/)).toBeInTheDocument();
  });
  it("asks what to do with a duplicate and never picks on its own", async () => {
    wrap(<HandoffProblems h={handoffFor("deal-duplicate")} />);
    const g = screen.getByRole("group", { name: "Phoenix already has this company" });
    expect(within(g).getByRole("radio", { name: /Add this meeting to PX-2210/ })).toBeChecked();
    await userEvent.click(within(g).getByRole("radio", { name: /Don’t send it to Phoenix/ }));
    await userEvent.click(within(g).getByRole("button", { name: "Keep it out of Phoenix" }));
    expect(screen.getByRole("status")).toHaveTextContent("Not sent to Phoenix");
  });
  it("sends a waiting follow-up to connect AutoSend", () => {
    wrap(<HandoffProblems h={handoffFor("nurture-off")} lead />);
    expect(screen.getByRole("status")).toHaveTextContent("AutoSend isn’t connected");
    expect(screen.getByRole("link", { name: "Connect AutoSend" })).toHaveAttribute("href", "/app/settings?state=connect-autosend");
  });
  it("renders nothing when nothing needs a person", () => {
    const { container } = wrap(<HandoffProblems h={handoffFor("meeting-booked")} />);
    expect(container.querySelector(".h-problem")).toBeNull();
  });
  it("makes a section for the lead", () => {
    wrap(<HandoffSection h={handoffFor("meeting-rescheduled")} />);
    expect(screen.getByRole("region", { name: "Meeting and handoffs" })).toHaveTextContent("Moved with the meeting");
  });
});

describe("handoffs in the Unibox", () => {
  it("shows Grace’s booking in the live thread and the handoffs in the rail", () => {
    render(<Host state="meeting-booked" />);
    expect(screen.getByRole("listbox", { name: "Meetings" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Meeting: booked" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Handoffs" })).toBeInTheDocument();
  });
  it.each<[HandoffReviewState, string]>([["meeting-cancelled", "Grace cancelled the meeting"], ["meeting-no-show", "Nobody from Nyota joined"]])(
    "puts %s back in Needs you with a draft for a person to send", (state, headline) => {
      render(<Host state={state} />);
      expect(screen.getByRole("listbox", { name: "Needs you" })).toBeInTheDocument();
      expect(screen.getByText(headline)).toBeInTheDocument();
      const row = within(screen.getByRole("listbox", { name: "Needs you" })).getByRole("option", { selected: true });
      expect(row).toHaveTextContent(/Meeting (cancelled|no-show)/);
      expect(screen.getByText(/cal.com\/tomas\/20min/)).toBeInTheDocument();
    });
  it("shows the Phoenix duplicate under the meeting", () => {
    render(<Host state="deal-duplicate" />);
    expect(screen.getByRole("group", { name: "Phoenix already has this company" })).toBeInTheDocument();
  });
});

describe("handoffs on the lead", () => {
  it("opens Nyota with the meeting and handoffs for a handoff state", () => {
    wrap(<LeadsView view="companies" state="deal-error" importOpen={false} onImportOpenChange={() => {}} builderOpen={false} onBuilderOpenChange={() => {}} onEnroll={() => {}} onFind={() => {}} />);
    const sec = screen.getByRole("region", { name: "Meeting and handoffs" });
    expect(within(sec).getByRole("alert")).toHaveTextContent("401");
  });
});
