import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { SegmentTable } from "../SegmentTable";
import { LEADS } from "../data";
import { LeadsView } from "./Leads";
import { SegmentBuilder, loosenHint, newRule } from "./Builder";
import { ImportDialog } from "./Import";
import { EXISTING, LEAD_ROWS, detailOf, emailOf, tradeShowCsv } from "./data";
import type { LeadsReviewState } from "@/lib/leads/state";
import type { Rule } from "@/lib/leads/segment";

function Host({ state, view = "companies", onEnroll = vi.fn(), segment }: { state?: LeadsReviewState; view?: "companies" | "segments"; onEnroll?: (n: number, r: boolean) => void; segment?: string }) {
  const [imp, setImp] = useState(false);
  const [b, setB] = useState(false);
  return <ToastProvider><LeadsView view={view} state={state} segment={segment} importOpen={imp} onImportOpenChange={setImp} builderOpen={b} onBuilderOpenChange={setB} onEnroll={onEnroll} onFind={vi.fn()} /></ToastProvider>;
}
const table = () => screen.getByRole("table", { name: /^Companies:|^Segment:/ });
const bodyRows = () => within(table()).getAllByRole("row").slice(1);

describe("SegmentTable (M3 props)", () => {
  it("sorts from the header with aria-sort, and opens rows", async () => {
    const onSort = vi.fn(), onOpen = vi.fn();
    render(<SegmentTable leads={LEADS} selected={new Set()} sort={{ key: "fit", dir: "desc" }} onSort={onSort} onOpen={onOpen} active="pwani" limit={3} onToggleAll={vi.fn()} allChecked="mixed" />);
    const fit = screen.getByRole("columnheader", { name: /Fit/ });
    expect(fit).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /Company/ })).toHaveAttribute("aria-sort", "none");
    await userEvent.click(within(fit).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("fit");
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(screen.getByRole("button", { name: "Kilima Dairies" }));
    expect(onOpen).toHaveBeenCalledWith("kilima");
    expect(screen.getAllByRole("row")[2]).toHaveClass("is-active");
  });
  it("shows scoring and duplicate rows and monograms for people without photos", () => {
    render(<SegmentTable leads={LEAD_ROWS.filter((l) => l.id === "kilimaltd")} selected={new Set()} />);
    expect(screen.getByText("Scoring")).toBeInTheDocument();
    expect(screen.getByText("Duplicate?")).toBeInTheDocument();
    expect(screen.getByText("WM")).toBeInTheDocument();
  });
});

describe("lead table", () => {
  it("sorts by company when the header is clicked, then flips", async () => {
    render(<Host />);
    expect(within(bodyRows()[0]).getByRole("button", { name: "Kilima Dairies" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("columnheader", { name: /Company/ })).getByRole("button"));
    expect(bodyRows()[0]).toHaveTextContent("Addis Pharma Distribution");
    await userEvent.click(within(screen.getByRole("columnheader", { name: /Company/ })).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: /Company/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("selects rows into the bulk bar; Esc clears; small enrolls go to the shell dialog", async () => {
    const onEnroll = vi.fn();
    render(<Host onEnroll={onEnroll} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Kilima Dairies" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pwani Fresh" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.click(within(bar).getByRole("button", { name: /Enroll/ }));
    expect(onEnroll).toHaveBeenCalledWith(2, true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
  });

  it("selects the page, then everything, and a large enroll confirms what gets skipped", async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole("tab", { name: /All/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    expect(screen.getByRole("status")).toHaveTextContent("All 41 on this page are selected.");
    await userEvent.click(screen.getByRole("button", { name: "Select all 1,284 in All" }));
    expect(screen.getByRole("region", { name: "Bulk actions" })).toHaveTextContent("All 1,284 selected");
    await userEvent.click(screen.getByRole("button", { name: /Enroll 1,284/ }));
    const d = screen.getByRole("dialog", { name: "Enroll 1,284 companies in a sequence" });
    expect(d).toHaveTextContent("1,072will be enrolled");
    expect(d).toHaveTextContent("124skipped: no verified email yet");
    expect(d).toHaveTextContent("Sends spread over 6 working days.");
    vi.useFakeTimers();
    fireEvent.click(within(d).getByRole("button", { name: "Enroll 1,072" }));
    expect(screen.getByRole("progressbar", { name: "Enrolling" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Enrolled 1,072 companies in Cold-room pilot")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("sets a status from the detail with Undo", async () => {
    render(<Host state="detail" />);
    const detail = screen.getByRole("article", { name: "Kilima Dairies details" });
    expect(detail).toHaveTextContent("Cold-room pilot · step 2 of 4, paused (replied)");
    await userEvent.click(within(detail).getByRole("button", { name: "Status for Kilima Dairies: Interested" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /Meeting booked/ }));
    expect(screen.getByText("Kilima Dairies set to Meeting booked")).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Status for Kilima Dairies: Meeting booked" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(detail).getByRole("button", { name: "Status for Kilima Dairies: Interested" })).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("merges a duplicate into the original, with Undo", async () => {
    render(<Host state="duplicate" />);
    const detail = screen.getByRole("article", { name: "Kilima Dairies Ltd details" });
    expect(detail).toHaveTextContent("Looks like Kilima Dairies");
    expect(within(detail).getByRole("button", { name: "Enroll in sequence" })).toBeDisabled();
    await userEvent.click(within(detail).getByRole("button", { name: "Merge" }));
    expect(screen.getByRole("article", { name: "Kilima Dairies details" })).toBeInTheDocument();
    expect(screen.getByText("Merged into Kilima Dairies")).toBeInTheDocument();
  });

  it("keeps both when it isn't a duplicate", async () => {
    render(<Host state="duplicate" />);
    await userEvent.click(screen.getByRole("button", { name: "Keep both" }));
    expect(screen.queryByText("Looks like Kilima Dairies")).toBeNull();
  });

  it("bulk sets a status from the bar", async () => {
    render(<Host state="status-menu" />);
    await userEvent.click(screen.getByRole("menuitem", { name: /Not interested/ }));
    expect(screen.getByText("3 companies set to Not interested")).toBeInTheDocument();
    expect(screen.getByText("removed from sequences")).toBeInTheDocument();
  });

  it("shows loading, error with retry, empty first run, no results and partial scoring", async () => {
    const { unmount } = render(<Host state="loading" />);
    expect(screen.getByRole("status", { name: "Loading companies" })).toBeInTheDocument(); unmount();
    const e = render(<Host state="error" />);
    expect(screen.getByText("Couldn't load companies")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status", { name: "Loading companies" })).toBeInTheDocument(); e.unmount();
    const f = render(<Host state="empty" />);
    expect(screen.getByRole("heading", { name: "Bring in the companies you already know" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Import a CSV/ }));
    expect(screen.getByRole("dialog", { name: "Import companies from CSV" })).toBeInTheDocument(); f.unmount();
    const g = render(<Host state="no-results" />);
    expect(screen.getByText("No companies match these filters")).toBeInTheDocument();
    expect(screen.getByText("Fit ≥ 90 is the tightest rule. At ≥ 80, 1 company matches.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove the last filter" }));
    expect(screen.queryByText("No companies match these filters")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Fit for ColdTrace Sensors ≥ 90" }));
    expect(screen.queryByRole("button", { name: /Remove filter/ })).toBeNull(); g.unmount();
    render(<Host state="partial" />);
    expect(screen.getByText("Corral is still scoring 212 of 1,284 companies.")).toBeInTheDocument();
    expect(screen.getAllByText("Scoring").length).toBeGreaterThan(5);
  });
});

describe("segment builder", () => {
  function B({ initial, name, onSave = vi.fn() }: { initial: Rule[]; name?: string; onSave?: () => void }) {
    const [rules, setRules] = useState(initial); const [match, setMatch] = useState<"all" | "any">("all"); const [n, setN] = useState(name);
    return <SegmentBuilder rules={rules} onRules={setRules} match={match} onMatch={setMatch} leads={LEAD_ROWS} total={1284} name={n} onName={n === undefined ? undefined : setN} onSave={onSave} onCancel={vi.fn()} />;
  }
  it("counts matches live, flags unfinished rules and says why it can't save", async () => {
    const onSave = vi.fn();
    render(<B initial={[{ ...newRule("fit"), value: "120" }, { ...newRule("reply"), value: [] }]} onSave={onSave} />);
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Fit is scored 0–100", "Pick at least one"]);
    expect(screen.getByText(/2 unfinished rules are ignored/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save segment" })).toBeDisabled();
    expect(screen.getByText("Finish 2 rules to save")).toBeInTheDocument();
    const v = screen.getByRole("textbox", { name: "Rule 1 value" });
    await userEvent.clear(v); await userEvent.type(v, "85");
    await userEvent.click(screen.getByRole("button", { name: /Remove rule: Reply status/ }));
    expect(screen.getByText("of 1,284 companies")).toBeInTheDocument();
    expect(screen.getByLabelText("First matches")).toHaveTextContent("Kilima Dairies");
    await userEvent.click(screen.getByRole("button", { name: "Save segment" }));
    expect(onSave).toHaveBeenCalled();
  });
  it("suggests how to loosen rules that match nothing, and switches all/any", async () => {
    render(<B initial={[{ ...newRule("fit"), value: 95 }, { ...newRule("country"), value: ["Kenya"] }]} />);
    expect(screen.getByText("Fit ≥ 95 is the tightest rule. At ≥ 90, 2 companies match.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "any" }));
    expect(screen.queryByText(/tightest rule/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("button", { name: "Rule 3 values: none picked" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rule 3 values: none picked" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Rwanda" }));
    expect(screen.getByRole("button", { name: "Rule 3 values: Rwanda" })).toBeInTheDocument();
    expect(loosenHint(LEAD_ROWS, [{ ...newRule("country"), value: ["Kenya"] }], "all")).toBeNull();
  });
  it("needs a name for a new segment", () => {
    render(<B initial={[{ ...newRule("fit"), value: 80 }]} name="" />);
    expect(screen.getByText("Name the segment to save")).toBeInTheDocument();
  });
  it("edits a saved segment's rules in the segments view", async () => {
    render(<Host view="segments" segment="F&B · East Africa" state="builder" />);
    expect(screen.getByRole("region", { name: "Segment rules" })).toBeInTheDocument();
    expect(screen.getAllByText("13").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Saved F&B · East Africa")).toBeInTheDocument();
  });
});

describe("CSV import", () => {
  const I = (p: Partial<Parameters<typeof ImportDialog>[0]>) => render(<ToastProvider><ImportDialog open onClose={vi.fn()} existing={EXISTING} {...p} /></ToastProvider>);
  it("explains a file it can't import", async () => {
    I({});
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toContain(".csv");
    await userEvent.upload(input, new File(["x"], "leads.xlsx"), { applyAccept: false });
    expect(await screen.findByText(".xlsx files can't be imported")).toBeInTheDocument();
  });
  it("reads a dropped CSV, maps it, reviews duplicates and imports", async () => {
    const onDone = vi.fn();
    I({ onDone });
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([tradeShowCsv()], "trade-show-leads.csv", { type: "text/csv" }));
    expect(await screen.findByRole("table", { name: "Column mapping" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Map “Email” to: Work email" })).toBeInTheDocument();
    expect(screen.getByText("7 of 8 columns will be imported")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("5 companies are already in Corral")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Rows that can't be imported" })).toHaveTextContent("achieng.at.kitale");
    await userEvent.click(screen.getByRole("radio", { name: /Skip them/ }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Import 53 companies" }));
    act(() => { vi.advanceTimersByTime(2000); });
    vi.useRealTimers();
    expect(screen.getByRole("dialog", { name: "Import finished" })).toHaveTextContent("53 companies added");
    expect(onDone).toHaveBeenCalledWith("Imported 53 companies from trade-show-leads.csv");
  });
  it("blocks the mapping until problems are fixed", async () => {
    render(<Host state="import-map-errors" />);
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("3 problems with the columns")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Continue" })).toBeDisabled();
    await userEvent.click(within(d).getByRole("button", { name: "Map “Associated Company” to: Don't import" }));
    await userEvent.click(screen.getByRole("option", { name: /Company name/ }));
    await userEvent.click(within(d).getByRole("button", { name: "Map “Secondary email” to: Work email" }));
    await userEvent.click(screen.getByRole("option", { name: /Don't import/ }));
    await userEvent.click(within(d).getByRole("button", { name: "Map “Full name” to: Full name" }));
    await userEvent.click(screen.getByRole("option", { name: /Don't import/ }));
    expect(within(d).getByRole("button", { name: "Continue" })).toBeEnabled();
  });
  it("offers a segment from a finished import", async () => {
    render(<Host state="import-done" />);
    await userEvent.click(await screen.findByRole("button", { name: /Make a segment from this import/ }));
    expect(screen.getByRole("textbox", { name: "Segment name" })).toHaveValue("Trade show · Sep");
  });
});

describe("sample data", () => {
  it("has detail for every row and emails for duplicates", () => {
    for (const l of LEAD_ROWS) expect(detailOf(l).people[0].email).toBe(emailOf(l));
    expect(detailOf(LEAD_ROWS[0]).activity.length).toBeGreaterThan(5);
  });
});
