import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadsApiFor, type LeadsApi } from "@/lib/api";
import { API, server, testConfig } from "@/test/msw";
import { companyRow, leads, leadsHandlers, personRow, resetLeads } from "@/test/leadsMock";
import type { LeadsReviewState } from "@/lib/leads/state";
import { ToastProvider } from "../Toaster";
import { LeadsView } from "./Leads";
import { useLiveSegments } from "./live";
import { LEAD_STATUSES, LIVE_STATUSES } from "./parts";

let api: LeadsApi;
beforeEach(() => { resetLeads(); server.use(...leadsHandlers); api = leadsApiFor(testConfig()); });
const bodies = (op: string) => leads.calls.filter((c) => c.op === op).map((c) => c.body as Record<string, unknown>);

function Host({ view = "companies", segment, state, builder = false, productId = "p1", onEnroll = vi.fn(), signal = 0 }: {
  view?: "companies" | "segments"; segment?: string; state?: LeadsReviewState; builder?: boolean; productId?: string | null; onEnroll?: (n: number, r: boolean) => void; signal?: number;
}) {
  const [imp, setImp] = useState(false);
  const [b, setB] = useState(builder);
  const segments = useLiveSegments(api)!;
  return <ToastProvider><button type="button" onClick={() => setImp(true)}>Open import</button>
    <LeadsView view={view} segment={segment} state={state} importOpen={imp} onImportOpenChange={setImp} builderOpen={b} onBuilderOpenChange={setB} onEnroll={onEnroll} onFind={vi.fn()} enrollAllSignal={signal}
      live={{ api, product: { productId, ready: true }, segments }} /></ToastProvider>;
}
const table = () => screen.getByRole("table", { name: /^Companies:|^Segment:/ });
const rowNames = () => within(table()).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("button")[0].textContent);

describe("LeadsView on the API", () => {
  it("shows the API's companies, fit first, with the tab counts", async () => {
    render(<Host />);
    expect(await screen.findByRole("button", { name: "Kilima Dairies" })).toBeInTheDocument();
    // Default tab is Fit 80+ (Bau's): the API answers with the two scored companies.
    expect(rowNames()).toEqual(["Kilima Dairies", "Pwani Fresh"]);
    const tabs = screen.getByRole("tablist", { name: "Companies" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /All/ })).toHaveTextContent("3"));
    expect(within(tabs).getByRole("tab", { name: /Fit 80\+/ })).toHaveTextContent("2");
    expect(bodies("POST /companies/query")[0]).toMatchObject({ rules: [{ field: "fit", op: "gte", value: 80, product_id: "p1" }], sort: { key: "fit", dir: "desc" } });
    await userEvent.click(within(tabs).getByRole("tab", { name: /All/ }));
    await waitFor(() => expect(rowNames()).toEqual(["Kilima Dairies", "Pwani Fresh", "Savanna Juice Co."]));
    expect(screen.getByText("3 companies")).toBeInTheDocument();
    expect(within(table()).getAllByRole("row")[3]).toHaveTextContent("Not scored");
  });

  it("sorts on the server when a header is clicked", async () => {
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    await userEvent.click(within(screen.getByRole("columnheader", { name: /Company/ })).getByRole("button"));
    await waitFor(() => expect(bodies("POST /companies/query").at(-1)).toMatchObject({ sort: { key: "company", dir: "asc" } }));
  });

  it("opens a company with its people from the API", async () => {
    leads.people.push(personRow({ id: "l7", company_id: "c1", is_primary: false, first_name: "Joseph", last_name: "Kariuki", title: "Plant Manager", email: "joseph@kilima.co.ke" }));
    render(<Host />);
    await userEvent.click(await screen.findByRole("button", { name: "Kilima Dairies" }));
    const d = screen.getByRole("article", { name: "Kilima Dairies details" });
    await waitFor(() => expect(within(d).getByText("Joseph Kariuki")).toBeInTheDocument());
    expect(within(d).getByText("wanjiru@kilima.co.ke")).toBeInTheDocument();
    expect(within(d).getByText("Added from Corral search")).toBeInTheDocument();
    // Nothing from the sample's story (no Nakuru pilot reply, no Cold-room pilot sequence).
    expect(within(d).queryByText(/Nakuru/)).toBeNull();
    expect(within(d).getByText("Not in a sequence.")).toBeInTheDocument();
  });

  it("sets a status from the detail and unsubscribes a person for good", async () => {
    render(<Host />);
    await userEvent.click(await screen.findByRole("button", { name: "Kilima Dairies" }));
    await userEvent.click(screen.getByRole("button", { name: "Status for Kilima Dairies: Interested" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /Unsubscribed/ }));
    await waitFor(() => expect(leads.calls.map((c) => c.op)).toContain("POST /leads/l1/unsubscribe"));
    expect(await screen.findByText("Kilima Dairies set to Unsubscribed")).toBeInTheDocument();
  });

  it("doesn't offer Disqualified, which the API can't store, in the detail or the bulk bar", async () => {
    render(<Host />);
    await userEvent.click(await screen.findByRole("button", { name: "Kilima Dairies" }));
    await userEvent.click(screen.getByRole("button", { name: "Status for Kilima Dairies: Interested" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Not interested/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox", { name: /Disqualified/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pwani Fresh" }));
    await userEvent.click(screen.getByRole("button", { name: /Set status/ }));
    expect(screen.getByRole("menuitem", { name: /Meeting booked/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Disqualified/ })).toBeNull();
  });

  it("an empty Fit 80+ tab with no filter set offers no filter actions", async () => {
    resetLeads({ fits: {} });
    render(<Host />);
    expect(await screen.findByText("No companies match these filters")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove the last filter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("sets status for a selection through the bulk bar", async () => {
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pwani Fresh" }));
    await userEvent.click(screen.getByRole("button", { name: /Set status/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Meeting booked/ }));
    await waitFor(() => expect(bodies("POST /companies/bulk")[0]).toMatchObject({ reply_status: "meeting_booked", selection: { ids: ["c2"] } }));
    expect(await screen.findByText("Pwani Fresh set to Meeting booked")).toBeInTheDocument();
  });

  it("adds a selection to a saved segment", async () => {
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pwani Fresh" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to segment" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Kenya dairy/ }));
    expect(await screen.findByText("Added 1 to Kenya dairy")).toBeInTheDocument();
    expect(leads.segments[0].pins).toEqual(["c2"]);
  });

  it("saves a new segment from the selection, pinned", async () => {
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pwani Fresh" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to segment" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /New segment from selection/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Segment name" }), "Pwani only");
    // Matches now: the API's preview for the rules (fit ≥ 80 for the product).
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Segment rules" })).getByText("2")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Save segment" }));
    await waitFor(() => expect(bodies("POST /segments")[0]).toMatchObject({ name: "Pwani only", company_ids: ["c2"], rules: [{ field: "fit", product_id: "p1" }] }));
    expect(await screen.findByText("Saved segment “Pwani only”")).toBeInTheDocument();
  });

  it("shows a saved segment's rules and members, and saves edits", async () => {
    render(<Host view="segments" segment="Kenya dairy" />);
    expect(await screen.findByRole("button", { name: "Kilima Dairies" })).toBeInTheDocument();
    expect(rowNames()).toEqual(["Kilima Dairies"]);
    expect(screen.getByRole("button", { name: "Industry is Dairy" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Segment: Kenya dairy" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Edit rules/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(bodies("PATCH /segments/s1")[0]).toEqual({ rules: [{ field: "industry", op: "is", value: ["Dairy"] }], match: "all" }));
    expect(await screen.findByText("Saved Kenya dairy")).toBeInTheDocument();
  });

  it("opens the first saved segment when none is named", async () => {
    render(<Host view="segments" />);
    expect(await screen.findByRole("table", { name: "Segment: Kenya dairy" })).toBeInTheDocument();
  });

  it("merges a probable duplicate from the detail banner", async () => {
    resetLeads({
      companies: [companyRow({ id: "c1", name: "Kilima Dairies", created_at: "2026-09-01T00:00:00Z" }), companyRow({ id: "c9", name: "Kilima Dairies Ltd", domain: null, created_at: "2026-09-29T00:00:00Z" })],
      people: [personRow({ id: "l1", company_id: "c1" }), personRow({ id: "l9", company_id: "c9", first_name: "Joseph" })], fits: { c1: 90, c9: 85 },
    });
    render(<Host />);
    await userEvent.click(await screen.findByRole("button", { name: "Kilima Dairies Ltd" }));
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(await screen.findByText("Merged into Kilima Dairies")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Kilima Dairies details" })).toBeInTheDocument();
    await waitFor(() => expect(rowNames()).toEqual(["Kilima Dairies"]));
  });

  it("confirms a large enrollment with the API's dry run", async () => {
    resetLeads({ companies: Array.from({ length: 120 }, (_, i) => companyRow({ id: `k${i}`, name: `Co ${i}` })), people: Array.from({ length: 100 }, (_, i) => personRow({ id: `p${i}`, company_id: `k${i}` })), fits: Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`k${i}`, 90])) });
    const { rerender } = render(<Host />);
    await screen.findByRole("button", { name: "Co 0" });
    rerender(<Host signal={1} />);
    const dialog = await screen.findByRole("dialog", { name: "Enroll 120 companies in a sequence" });
    await waitFor(() => expect(within(dialog).getByText("will be enrolled").previousSibling).toHaveTextContent("100"));
    expect(within(dialog).getByText("skipped: no verified email yet").previousSibling).toHaveTextContent("20");
    expect(within(dialog).getByRole("button", { name: "Enroll 100" })).toBeInTheDocument();
    expect(bodies("POST /companies/enroll-plan")[0]).toMatchObject({ selection: { all: true } });
  });

  it("shows Bau's first-run screen when the workspace has no companies", async () => {
    resetLeads({ companies: [], people: [] });
    render(<Host />);
    expect(await screen.findByRole("heading", { name: "Bring in the companies you already know" })).toBeInTheDocument();
  });

  it("shows the request that failed, and tries again", async () => {
    server.use(http.post(`${API}/api/v1/companies/query`, () => HttpResponse.json({}, { status: 503 }), { once: true }));
    render(<Host />);
    expect(await screen.findByText("POST /api/v1/companies/query · 503")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Kilima Dairies" })).toBeInTheDocument();
  });

  it("loads the next page as the list scrolls", async () => {
    resetLeads({ companies: Array.from({ length: 70 }, (_, i) => companyRow({ id: `k${String(i).padStart(2, "0")}`, name: `Co ${String(i).padStart(2, "0")}` })), people: [], fits: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${String(i).padStart(2, "0")}`, 90])) });
    render(<Host />);
    await screen.findByRole("button", { name: "Co 00" });
    expect(screen.getByText("Showing the first 50. The rest load as you scroll.")).toBeInTheDocument();
    const list = table().closest(".l-split__list") as HTMLElement;
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 700, configurable: true });
    act(() => { list.scrollTop = 0; list.dispatchEvent(new Event("scroll")); });
    await waitFor(() => expect(rowNames()).toHaveLength(70));
  });

  it("keeps Bau's sample for review states", () => {
    expect(LEAD_STATUSES).toContain("Disqualified");   // review fixtures keep the full list
    expect(LIVE_STATUSES).toEqual(LEAD_STATUSES.filter((st) => st !== "Disqualified"));
    render(<Host state="empty" />);
    expect(screen.getByRole("heading", { name: "Bring in the companies you already know" })).toBeInTheDocument();
    expect(leads.calls).toEqual([]);
  });
});

describe("import on the API", () => {
  const done = { id: "i1", filename: "list.csv", byteSize: 30, policy: "skip" as const, status: "done" as const, progressPct: 100, totalRows: 2, created: 1, updated: 0, skipped: 1, errors: 1,
    inFileDuplicates: 0, existingDuplicates: 1, peopleCreated: 1, failure: null, note: null, hasErrorsFile: true, finishedAt: "t", createdAt: "t" };
  const pick = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Open import" }));
    const dialog = await screen.findByRole("dialog", { name: "Import companies from CSV" });
    expect(within(dialog).queryByText("Try it with a sample trade-show export")).toBeNull();   // review/demo only
    const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["Company,Email\nKilima Dairies,wanjiru@kilima.co.ke\nMara Cold,lena@maracold.com\n"], "list.csv", { type: "text/csv" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    return dialog;
  };
  it("reviews with the server's dry run, imports with progress, and offers the rows left behind", async () => {
    // jsdom's FormData can't go through fetch: answer the multipart calls directly (the real calls are covered in lib/api/leads.test.ts).
    const plan = vi.spyOn(api, "dryRun").mockResolvedValue({ ok: true, value: { plan: { total: 2, create: 1, update: 0, skipped: 1, errors: 0, in_file: 0, existing: 1 } as never, headers: [], errors: [] } });
    plan.mockResolvedValue({ ok: true, value: { plan: { total: 2, create: 1, update: 0, skipped: 1, errors: 0, inFile: 0, existing: 1 }, headers: [], errors: [] } });
    const start = vi.spyOn(api, "startImport").mockResolvedValue({ ok: true, value: { ...done, status: "running", progressPct: 40 } });
    vi.spyOn(api, "getImport").mockResolvedValue({ ok: true, value: done });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    const dialog = await pick();
    await waitFor(() => expect(plan).toHaveBeenCalledWith(expect.objectContaining({ name: "list.csv", mapping: ["company", "email"], policy: "fill" }), expect.anything()));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Import 1 companies" })).toBeInTheDocument());
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 1 companies" }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ name: "list.csv", policy: "fill" }), expect.anything());
    expect(await screen.findByRole("dialog", { name: "Import finished" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("1 companies added")).toBeInTheDocument();
    expect(await screen.findByText("Imported 1 companies from list.csv")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download them as CSV" }));
    expect(open).toHaveBeenCalledWith(`${API}/api/v1/lead-imports/i1/errors.csv`, "_blank");
  });
  it("says the import didn't finish, and why", async () => {
    vi.spyOn(api, "dryRun").mockResolvedValue({ ok: false, error: { kind: "network", op: "POST /x", message: "down" } });
    vi.spyOn(api, "startImport").mockResolvedValue({ ok: true, value: { ...done, status: "failed", failure: "The file changed while it was read." } });
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    const dialog = await pick();
    await userEvent.click(await within(dialog).findByRole("button", { name: /^Import/ }));
    expect(await within(dialog).findByText("The import didn’t finish")).toBeInTheDocument();
    expect(within(dialog).getByText("The file changed while it was read.")).toBeInTheDocument();
  });
  it("shows the refusal's request when the upload is refused", async () => {
    vi.spyOn(api, "dryRun").mockResolvedValue({ ok: false, error: { kind: "network", op: "POST /x", message: "down" } });
    vi.spyOn(api, "startImport").mockResolvedValue({ ok: false, error: { kind: "http", op: "POST /api/v1/lead-imports", status: 413, message: "Too big" } });
    render(<Host />);
    await screen.findByRole("button", { name: "Kilima Dairies" });
    const dialog = await pick();
    await userEvent.click(await within(dialog).findByRole("button", { name: /^Import/ }));
    expect(await within(dialog).findByText("POST /api/v1/lead-imports · 413")).toBeInTheDocument();
  });
});
