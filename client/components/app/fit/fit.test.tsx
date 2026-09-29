import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FitBar } from "../primitives";
import { ToastProvider } from "../Toaster";
import { LeadsView } from "../leads/Leads";
import { LEAD_ROWS } from "../leads/data";
import { DEMO_TODAY_M4 } from "../discovery/data";
import { FitReasoning } from "./Reasoning";
import { KILIMA_FIT, fitStatusFor, scoreFor } from "./data";
import type { FitScore } from "@/lib/fit/score";
import type { LeadsReviewState } from "@/lib/leads/state";

const today = DEMO_TODAY_M4;
const lead = (id: string) => LEAD_ROWS.find((l) => l.id === id)!;
const panel = (p: Partial<Parameters<typeof FitReasoning>[0]> & { status: Parameters<typeof FitReasoning>[0]["status"] }) =>
  render(<FitReasoning company="Kilima Dairies" domain="kilima.co.ke" today={today} {...p} />);
const leads = (state: LeadsReviewState) => render(<ToastProvider><LeadsView view="companies" state={state} importOpen={false} onImportOpenChange={vi.fn()} builderOpen={false} onBuilderOpenChange={vi.fn()} onEnroll={vi.fn()} onFind={vi.fn()} /></ToastProvider>);
afterEach(() => vi.useRealTimers());

describe("FitBar", () => {
  it("renders exactly as before with just a value", () => {
    const { container } = render(<FitBar value={94} />);
    const bar = screen.getByRole("img", { name: "Fit 94 of 100" });
    expect(bar).toHaveClass("c-fit"); expect(bar).not.toHaveAttribute("title");
    expect(bar.className).toBe("c-fit");
    expect(container.querySelectorAll("i.on")).toHaveLength(9);
    render(<FitBar value={64} size="md" />);
    expect(screen.getByRole("img", { name: "Fit 64 of 100" }).className).toBe("c-fit c-fit--low c-fit--md");
  });
  it("marks scoring, not scored, error, low confidence, change and your own number", () => {
    render(<><FitBar value={0} state="scoring" text="Rescoring" /><FitBar value={0} state="none" /><FitBar value={0} state="error" text="Failed" /><FitBar value={85} state="error" />
      <FitBar value={53} confidence="low" /><FitBar value={84} delta={26} /><FitBar value={83} by="you" /><FitBar value={81} delta={-9} /></>);
    expect(screen.getByRole("img", { name: "Fit: rescoring" })).toHaveTextContent("Rescoring");
    expect(screen.getByRole("img", { name: "Fit: not scored yet" })).toHaveTextContent("Not scored yet");
    expect(screen.getByRole("img", { name: "Fit: couldn't score" })).toHaveTextContent("Failed");
    expect(screen.getByRole("img", { name: "Fit 85 of 100, the last score; couldn't rescore" })).toHaveTextContent("85");
    expect(screen.getByRole("img", { name: "Fit 53 of 100, low confidence" })).toHaveClass("is-unsure");
    expect(screen.getByRole("img", { name: "Fit 84 of 100, up 26 since the last score" })).toHaveTextContent("84↑26");
    expect(screen.getByRole("img", { name: "Fit 81 of 100, down 9 since the last score" })).toHaveTextContent("81↓9");
    expect(screen.getByRole("img", { name: "Fit 83 of 100, set by you" })).toHaveClass("is-yours");
    render(<FitBar value={0} state="error" />);
    expect(screen.getAllByRole("img", { name: "Fit: couldn't score" })[1]).toHaveTextContent("Couldn't score");
  });
});

describe("FitReasoning", () => {
  it("explains a score as checks with evidence, and links each to its provenance", async () => {
    const onOpenField = vi.fn();
    panel({ status: { kind: "scored", score: KILIMA_FIT }, onOpenField, onRescore: vi.fn(), onOverride: vi.fn(), onDisagree: vi.fn() });
    expect(screen.getByRole("heading", { name: "Why it scored 94" })).toBeInTheDocument();
    expect(screen.getByText(/read 38 pages of/)).toHaveTextContent("measured against 5 lines of the ColdTrace Sensors knowledge base · high confidence");
    const checks = screen.getByRole("list", { name: "Checks" });
    expect(within(checks).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText(/Our Nakuru plant runs three cold rooms/)).toBeInTheDocument();
    const pts = [...checks.querySelectorAll(".f-check__pts")].map((e) => e.textContent);
    expect(pts.filter((t) => /^Holds, \d+ of \d+$/.test(t ?? ""))).toHaveLength(4);
    expect(pts).toContain("Partly, 7 of 10");
        await userEvent.click(within(checks).getAllByRole("button", { name: "Where this came from" })[0]);
    expect(onOpenField).toHaveBeenCalledWith("industry");
  });

  it("shows your override next to Corral's score, and clears it", async () => {
    const onClearOverride = vi.fn();
    const s: FitScore = { ...scoreFor(lead("bahari"), 61), override: { value: 83, by: "Tomás Ibarra", at: "2026-09-28", note: "Met the CFO" } };
    panel({ status: { kind: "scored", score: s }, company: "Bahari Foods", domain: "baharifoods.co.ke", onClearOverride, onOverride: vi.fn() });
    expect(screen.getByRole("heading", { name: "Why Corral scored 61" })).toBeInTheDocument();
    expect(screen.getByText("You set this to 83")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use Corral’s 61" }));
    expect(onClearOverride).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Change your fit/ })).toBeInTheDocument();
  });

  it("calls a thin score a floor and says what's missing", async () => {
    const onAddField = vi.fn();
    const s = (fitStatusFor(lead("zanzibar"), "fit-low") as { score: FitScore }).score;
    panel({ status: { kind: "scored", score: s }, onAddField });
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText(/53 is a floor: it could reach 88 if they hold/)).toBeInTheDocument();
    expect([...document.querySelectorAll(".f-check__pts")].filter((e) => /^No evidence, 0 of \d+$/.test(e.textContent ?? ""))).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Tell Corral how they monitor today" }));
    expect(onAddField).toHaveBeenCalledWith("industry");
  });

  it("explains a change, a disagreement, scoring, and an error", async () => {
    const onRescore = vi.fn();
    const { unmount } = panel({ status: fitStatusFor(lead("nyota"), "fit-changed") });
    expect(screen.getByText(/Up 26/)).toBeInTheDocument();
    expect(screen.getByText(/Cold chain lead/)).toBeInTheDocument();
    unmount();
    const r2 = panel({ status: fitStatusFor(lead("rift"), "fit-disagree"), onRescore });
    expect(screen.getByText("You said this score is wrong")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rescore now" }));
    expect(onRescore).toHaveBeenCalled();
    r2.unmount();
    const r3 = panel({ status: fitStatusFor(lead("tamu"), "fit-scoring") });
    expect(screen.getByRole("heading", { name: "Rescoring" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("12 of about 38 pages");
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.getByText(/The last score, 86 from Sep 12, stays in use/)).toBeInTheDocument();
    r3.unmount();
    const r4 = panel({ status: fitStatusFor(lead("kigali"), "fit-error"), company: "Kigali Cold Chain", onRescore });
    expect(screen.getByRole("heading", { name: "Last score: 85" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("didn’t answer, twice. Nothing changed: the last score, 85 from Sep 12, still stands.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRescore).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("list", { name: "The last score's checks, from Sep 12" })).toBeInTheDocument();
    r4.unmount();
    panel({ status: { kind: "error", code: "POST /fit/score · 504", at: "now", tries: 3 }, company: "Dodoma Dairy Co-op" });
    expect(screen.getByRole("heading", { name: "Not scored yet" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("3 times. Nothing changed: there’s no score yet, so Dodoma Dairy Co-op stays out of fit filters.");
  });

  it("offers to score now or set the fit yourself when there's no score, and checks the number", async () => {
    const onOverride = vi.fn(); const onRescore = vi.fn();
    const { unmount } = panel({ status: { kind: "none", why: "queued", since: "2 min ago" }, company: "Savanna Juice Co.", onOverride, onRescore });
    expect(screen.getByText(/was added 2 min ago and is in line/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Score it now" }));
    expect(onRescore).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Set the fit myself" }));
    const input = screen.getByRole("textbox", { name: "Your fit, 0–100" });
    await userEvent.type(input, "120");
    await userEvent.click(screen.getByRole("button", { name: "Use my fit" }));
    expect(screen.getByText("Use a whole number from 0 to 100.")).toBeInTheDocument();
    await userEvent.clear(input); await userEvent.type(input, "70");
    await userEvent.type(screen.getByRole("textbox", { name: /Why/ }), "Known account");
    await userEvent.click(screen.getByRole("button", { name: "Use my fit" }));
    expect(onOverride).toHaveBeenCalledWith(70, "Known account");
    unmount();
    panel({ status: { kind: "none", why: "no-site" }, company: "Mara Cold Stores", onOverride });
    expect(screen.getByText(/no website to read for Mara Cold Stores/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Score it now" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set the fit myself" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("takes a note when you disagree", async () => {
    const onDisagree = vi.fn();
    panel({ status: { kind: "scored", score: KILIMA_FIT }, onDisagree, onOverride: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Tell Corral what’s wrong" }));
    await userEvent.click(screen.getByRole("button", { name: "Send and rescore" }));
    expect(screen.getByText("Say what's wrong, in a sentence.")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "What did Corral get wrong?" }), "They closed the Nakuru plant");
    await userEvent.click(screen.getByRole("button", { name: "Send and rescore" }));
    expect(onDisagree).toHaveBeenCalledWith("They closed the Nakuru plant");
  });
});

describe("fit in the Companies table and detail", () => {
  it("marks rows in each state with short labels", () => {
    const { unmount } = leads("fit-none");
    expect(screen.getAllByRole("img", { name: "Fit: queued" }).length).toBe(3);
    expect(screen.getByRole("img", { name: "Fit: no website" })).toBeInTheDocument();
    const d = screen.getByRole("article", { name: "Savanna Juice Co. details" });
    expect(within(d).getByRole("img", { name: "Fit: in line to be scored" })).toBeInTheDocument();
    unmount();
    const r = leads("fit-error");
    expect(screen.getByRole("img", { name: "Fit: couldn't score" })).toHaveTextContent("Failed");
    r.unmount();
    leads("fit-changed");
    expect(screen.getAllByRole("img", { name: "Fit 84 of 100, up 26 since the last score" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Fit 81 of 100, down 9 since the last score" })).toBeInTheDocument();
  });

  it("opens a field's provenance from the reasoning", async () => {
    leads("fit");
    const d = screen.getByRole("article", { name: "Kilima Dairies details" });
    await userEvent.click(within(d).getAllByRole("button", { name: "Where this came from" })[2]); // size, Dropcontact
    expect(within(d).getByRole("button", { name: /^Size/ })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(d).getByRole("button", { name: "Why?" }));
  });

  it("goes back to Corral's number, and rescoring after a disagreement moves the score", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = leads("fit-override");
    const d = screen.getByRole("article", { name: "Bahari Foods details" });
    expect(within(d).getByRole("img", { name: "Fit 83 of 100, set by you" })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Use Corral’s 61" }));
    expect(await screen.findByText("Using Corral's fit for Bahari Foods")).toBeInTheDocument();
    expect(within(d).getByRole("heading", { name: "Why it scored 61" })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: /Set the fit myself/ }));
    await userEvent.type(within(d).getByRole("textbox", { name: "Your fit, 0–100" }), "90");
    await userEvent.click(within(d).getByRole("button", { name: "Use my fit" }));
    expect(await screen.findByText("Fit for Bahari Foods set to 90")).toBeInTheDocument();
    unmount();
    leads("fit-disagree");
    const r = screen.getByRole("article", { name: "Rift Valley Grain details" });
    await userEvent.click(within(r).getByRole("button", { name: "Rescore now" }));
    expect(within(r).getByRole("heading", { name: "Rescoring" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1700); });
    expect(await screen.findByText("Rift Valley Grain rescored")).toBeInTheDocument();
    expect(within(r).getByText(/Down 18/)).toBeInTheDocument();
    expect(within(r).getByText(/Re-read rvgrain.co.ke with your note/)).toBeInTheDocument();
    await userEvent.click(within(r).getByRole("button", { name: "Tell Corral what’s wrong" }));
    await userEvent.type(within(r).getByRole("textbox", { name: "What did Corral get wrong?" }), "Still wrong");
    await userEvent.click(within(r).getByRole("button", { name: "Send and rescore" }));
    expect(await screen.findByText("Thanks. Corral is re-reading with your note")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1700); });
    expect(await screen.findAllByText("Rift Valley Grain rescored")).not.toHaveLength(0);
  });

  it("asks for missing data from a low-confidence score", async () => {
    leads("fit-low");
    const d = screen.getByRole("article", { name: "Zanzibar Spice Cold Rooms details" });
    await userEvent.click(within(d).getByRole("button", { name: "Tell Corral what they struggle with" }));
    expect(await screen.findByText("Add industry for Zanzibar Spice Cold Rooms")).toBeInTheDocument();
  });
});
