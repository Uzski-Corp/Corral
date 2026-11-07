import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { SegmentTable } from "../SegmentTable";
import { LEAD_ROWS } from "../leads/data";
import { LeadsView } from "../leads/Leads";
import { DiscoveryView } from "./Discovery";
import { RunSetup } from "./Setup";
import { DEMO_TODAY_M4, RUNS, provOf, resultsFor, runsFor } from "./data";
import { ProvenanceList } from "./Provenance";
import type { DiscoveryReviewState } from "@/lib/discovery/state";

function Host({ state, onOpenCompanies = vi.fn() }: { state?: DiscoveryReviewState; onOpenCompanies?: () => void }) {
  const [open, setOpen] = useState(false);
  return <ToastProvider><DiscoveryView state={state} setupOpen={open} onSetupOpenChange={setOpen} onOpenCompanies={onOpenCompanies} onSegment={vi.fn()} /></ToastProvider>;
}
const results = () => screen.getByRole("table", { name: /^Results:/ });
afterEach(() => vi.useRealTimers());

describe("DiscoveryView", () => {
  it("shows a running run: stages, results with their enrichment state, pause", async () => {
    render(<Host state="running" />);
    const run = screen.getByRole("region", { name: "Dairy & cold rooms · East Africa" });
    expect(within(run).getByText("164")).toBeInTheDocument();
    expect(within(run).getByRole("progressbar", { name: "Read sites: 164 of 212 sites" })).toHaveAttribute("aria-valuenow", "77");
    expect(within(run).getByText(/75%/)).toBeInTheDocument();
    const t = results();
    expect(within(t).getAllByText("Finding people").length).toBeGreaterThan(0);
    expect(within(t).getByText("Reading site")).toBeInTheDocument();
    expect(within(t).getByText("Couldn’t read site")).toBeInTheDocument();
    expect(within(t).getAllByText("Not looked up").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: /Needs you/ }));
    expect(within(results()).getAllByRole("row")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Paused Dairy & cold rooms · East Africa")).toBeInTheDocument();
  });

  it("opens a result with provenance per field", async () => {
    render(<Host state="detail" />);
    const d = screen.getByRole("article", { name: "Kilima Dairies details" });
    expect(within(d).getByText(/dairy processor/)).toBeInTheDocument();
    // the email row is expanded in this state
    expect(within(d).getByText("Found on the website, confirmed by Hunter and ZeroBounce.")).toBeInTheDocument();
    expect(within(d).getByText("Mailbox exists (SMTP check)")).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: /^Industry/ }));
    expect(within(d).getByText("Read from the About page")).toBeInTheDocument();
    expect(within(d).queryByText("Mailbox exists (SMTP check)")).not.toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Back to results" }));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("explains a provider limit with the countdown and keeps going", () => {
    render(<Host state="rate-limited" />);
    expect(screen.getByText("Paused: Hunter's hourly limit")).toBeInTheDocument();
    expect(screen.getByText("4:22")).toBeInTheDocument();
    expect(screen.getByText(/reading and scoring continue/)).toBeInTheDocument();
  });

  it("stops at a failed stage, keeps what it found, and resumes", async () => {
    render(<Host state="failed" />);
    expect(screen.getByText("Web search stopped answering")).toBeInTheDocument();
    expect(screen.getByText("41 found before search stopped, not read yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume from search" }));
    expect(await screen.findByText("Resumed Beverages · Tanzania")).toBeInTheDocument();
  });

  it("lists sites that couldn’t be read, by reason, and retries timeouts", async () => {
    const open = vi.fn();
    render(<Host state="partial" onOpenCompanies={open} />);
    expect(screen.getByText("15 of 96 sites couldn’t be read")).toBeInTheDocument();
    expect(screen.getByText("the site blocks automated visits")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry the 5 that timed out" }));
    expect(await screen.findByText("Retrying 5 sites that timed out")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open in Companies" }));
    expect(open).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Make a segment from this run/ }));
    expect(await screen.findByText("Segment “Fisheries · Lake Victoria” created")).toBeInTheDocument();
  });

  it("explains zero results and reruns wider", async () => {
    render(<Host state="zero" />);
    expect(screen.getByText("No companies matched")).toBeInTheDocument();
    expect(screen.getByText("All of 8 searches came back empty.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add 201–1,000 and run again" }));
    const dlg = screen.getByRole("dialog", { name: "New discovery run" });
    expect(within(dlg).getByRole("button", { name: "Company sizes: 1,000+, 201–1,000" })).toBeInTheDocument();
  });

  it("queues a run behind the running one, and removes it", async () => {
    render(<Host state="queued" />);
    expect(screen.getByText("Queued behind Dairy & cold rooms · East Africa")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove from queue" }));
    expect(await screen.findByText("Removed Bakeries & bottlers · Uganda from the queue")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bakeries & bottlers/ })).not.toBeInTheDocument();
  });

  it("switches runs from the list, and shows a finished run's summary", async () => {
    render(<Host state="done" />);
    expect(screen.getByText("added to Companies")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Fisheries · Lake Victoria/ }));
    expect(screen.getByRole("region", { name: "Fisheries · Lake Victoria" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Run again/ }));
    expect(screen.getByRole("dialog", { name: "New discovery run" })).toBeInTheDocument();
  });

  it("starts from nothing, and recovers from loading errors", async () => {
    const { unmount } = render(<Host state="empty" />);
    await userEvent.click(screen.getByRole("button", { name: "Start a run" }));
    const dlg = screen.getByRole("dialog", { name: "New discovery run" });
    await userEvent.click(within(dlg).getByRole("button", { name: "Start run" }));
    // M13: a new run is Queued until the server picks it up, never "Started" on the client's say-so
    expect(await screen.findByText("Queued Dairy & Cold storage · East Africa")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dairy & Cold storage · East Africa" })).toBeInTheDocument();
    unmount();
    const r2 = render(<Host state="error" />);
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByRole("navigation", { name: "Discovery runs" })).toBeInTheDocument();
    r2.unmount();
    render(<Host state="loading" />);
    expect(screen.getByRole("status", { name: "Loading runs" })).toBeInTheDocument();
  });

  it("blocks a setup with problems and names them", async () => {
    render(<Host state="new-error" />);
    const dlg = screen.getByRole("dialog", { name: "New discovery run" });
    expect(within(dlg).getByText("2 things to fix")).toBeInTheDocument();
    expect(within(dlg).getByText("Fix 2 things above to start")).toBeInTheDocument();
    expect(within(dlg).getByRole("button", { name: "Queue run" })).toBeDisabled();
    await userEvent.click(within(dlg).getByRole("button", { name: "Countries: none picked" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Kenya" }));
    await userEvent.click(within(dlg).getByRole("radio", { name: "250" }));
    expect(within(dlg).queryByText(/things? to fix/)).not.toBeInTheDocument();
    expect(within(dlg).getByText("Starts after Dairy & cold rooms · East Africa")).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole("button", { name: "Queue run" }));
    expect(await screen.findByText(/^Queued Dairy & Cold storage/)).toBeInTheDocument();
  });

  it("ticks the live run to done", () => {
    vi.useFakeTimers();
    render(<Host />);
    expect(screen.getByRole("region", { name: "Dairy & cold rooms · East Africa" })).toBeInTheDocument();
    for (let i = 0; i < 80 && !screen.queryByText("Dairy & cold rooms · East Africa finished"); i++) act(() => { vi.advanceTimersByTime(1400); });
    expect(screen.getByText("Dairy & cold rooms · East Africa finished")).toBeInTheDocument();
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
  });
});

describe("RunSetup", () => {
  it("estimates credits as the limit and fit bar change", async () => {
    const onStart = vi.fn();
    render(<RunSetup open onClose={vi.fn()} onStart={onStart} inline held={0} />);
    expect(screen.getByText("221")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "80" }));
    expect(screen.getByText("~45")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ limit: 250, enrichAt: 80, queued: false, product: "ColdTrace Sensors" }));
  });

  it("lists the workspace's products and does not offer the sample catalog", async () => {
    const onStart = vi.fn();
    render(<RunSetup open onClose={vi.fn()} onStart={onStart} inline held={0} productsPhase="ready" creditsLeft={2000}
      products={[{ id: "p1", name: "Fresh milk", sourceCount: 2 }, { id: "p2", name: "Yoghurt line", sourceCount: 0 }]} />);
    expect(screen.getByRole("button", { name: "Product: Fresh milk" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("ColdTrace Sensors")).not.toBeInTheDocument();
    expect(screen.queryByText(/cold room/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hunter/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Industries: none picked" }));
    const industry = screen.getByRole("menu", { name: "Industries" });
    expect(within(industry).getByRole("menuitemcheckbox", { name: "Software" })).toBeInTheDocument();
    expect(within(industry).queryByRole("menuitemcheckbox", { name: "Cold storage" })).not.toBeInTheDocument();
    await userEvent.type(within(industry).getByLabelText("Search Industries"), "soft");
    expect(within(industry).getByRole("menuitemcheckbox", { name: "Software" })).toBeInTheDocument();
    expect(within(industry).queryByRole("menuitemcheckbox", { name: "Agriculture" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Product: Fresh milk" }));
    expect(screen.getByRole("option", { name: /Yoghurt line/ })).toBeInTheDocument();
    expect(screen.getByText("No sources yet")).toBeInTheDocument();
  });
});

describe("enrichment in the table, provenance, stale", () => {
  it("shows each enrichment state in place of the value it waits for", () => {
    const rows = resultsFor(RUNS[0]);
    render(<SegmentTable label="Results" leads={rows} selected={new Set()} />);
    expect(screen.getAllByText("Verifying").length).toBeGreaterThan(0);
    expect(screen.getByText("Scoring")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getAllByText("Waits for fit").length).toBeGreaterThan(0);
    expect(resultsFor({ ...RUNS[0], found: 0 })).toEqual([]);
    expect(runsFor("empty").runs).toEqual([]);
  });

  it("marks stale contact details and re-checks them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><LeadsView view="companies" state="stale" importOpen={false} onImportOpenChange={vi.fn()} builderOpen={false} onBuilderOpenChange={vi.fn()} onEnroll={vi.fn()} onFind={vi.fn()} /></ToastProvider>);
    expect(screen.getByText("Contact details for 86 companies were last checked over 90 days ago.")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /^Checked \d months ago$/ })).toHaveLength(6);
    const d = screen.getByRole("article", { name: "Kilima Dairies details" });
    expect(within(d).getByText("Contact details checked 4 months ago")).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Re-check · 2 credits" }));
    expect(within(d).getByRole("button", { name: "Re-checking…" })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(1300); });
    expect(await screen.findByText("Kilima Dairies re-checked")).toBeInTheDocument();
    expect(screen.getByText("Contact details for 85 companies were last checked over 90 days ago.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-check 85 · 170 credits" }));
    expect(screen.queryByText(/were last checked over 90 days ago/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("img", { name: /^Checked/ })).toHaveLength(0);
  });

  it("opens the email's evidence in the provenance state, and says when your edit wins", async () => {
    render(<ToastProvider><LeadsView view="companies" state="provenance" importOpen={false} onImportOpenChange={vi.fn()} builderOpen={false} onBuilderOpenChange={vi.fn()} onEnroll={vi.fn()} onFind={vi.fn()} /></ToastProvider>);
    expect(screen.getByText("Listed on the Contact page")).toBeInTheDocument();
    expect(screen.getByText(/96% high confidence/)).toBeInTheDocument();
    expect(screen.getByText(/Fresh for 89 more days/)).toBeInTheDocument();
    const kilima = LEAD_ROWS.find((l) => l.id === "kilima")!;
    const list = provOf(kilima).map((p) => (p.field === "title" ? { ...p, chain: [...p.chain, { kind: "you" as const, what: "Edited", at: "2026-09-29" }] } : p));
    render(<ProvenanceList list={list} today={DEMO_TODAY_M4} initialOpen="title" />);
    expect(screen.getByText("Entered by you, so Corral won’t overwrite it.")).toBeInTheDocument();
    const csv = provOf({ ...LEAD_ROWS.find((l) => l.source === "CSV import")!, email: "Catch-all" });
    expect(csv.find((p) => p.field === "email")!.chain[0].kind).toBe("csv");
    for (const email of ["Catch-all", "Unverified", "Bounced"] as const) expect(provOf({ ...kilima, id: "x", email }).find((p) => p.field === "email")!.chain.length).toBeGreaterThan(0);
  });
});
