import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KNOWLEDGE, REVIEW_SOURCES, SOURCES, citedBy, sourceName, type Source } from "./data";
import { advance, FileTile, SourceState, faviconHost, faviconSrc } from "./parts";
import { SKIP, SKIP_REASONS } from "@/lib/kb/upload";
import { SourceList, filterSources } from "./SourceList";
import { PageStrip, SourceDetail, pageTicks, pipelineSteps } from "./SourceDetail";
import { UploadDialog, UploadTray, fileItem, useUploadQueue, type QueueItem } from "./Upload";
import { KnowledgeEditor, attentionOf } from "./Editor";
import { KnowledgeBase, reviewQueue } from "./KnowledgeBase";
import { useState } from "react";

const src = (id: string) => SOURCES.find((s) => s.id === id)!;

describe("pipeline", () => {
  it("advances a processing source through every stage to ready", () => {
    let st: Source["status"] = { s: "processing", stage: "upload", pct: 0 };
    let passages: number | undefined;
    for (let i = 0; i < 60 && st.s === "processing"; i++) { const r = advance(st, 30); st = r.status; passages = r.passages ?? passages; }
    expect(st).toEqual({ s: "ready" });
    expect(passages).toBe(30);
    expect(advance({ s: "ready" }, 1).status).toEqual({ s: "ready" });
  });
  it("describes each state as receipts", () => {
    expect(pipelineSteps(src("pitch")).every((s) => s.state === "done")).toBe(true);
    expect(pipelineSteps(src("gateway")).find((s) => s.stage === "parse")).toMatchObject({ state: "warn", text: "Used 31 of 38 pages" });
    expect(pipelineSteps(REVIEW_SOURCES.interrupted).find((s) => s.state === "fail")).toMatchObject({ stage: "embed", meta: "tried 5 times" });
    expect(pipelineSteps(REVIEW_SOURCES["interrupted-crash"]).find((s) => s.state === "fail")).toMatchObject({ stage: "parse", meta: "stopped" });
    expect(pipelineSteps(REVIEW_SOURCES["partial-text-limit"]).find((s) => s.stage === "parse")).toMatchObject({ state: "warn", text: "Read the first part" });
    expect(pipelineSteps(REVIEW_SOURCES.unreadable).find((s) => s.state === "fail")).toMatchObject({ stage: "parse", meta: "file damaged" });
    expect(pipelineSteps(REVIEW_SOURCES["unreadable-timeout"]).find((s) => s.state === "fail")?.meta).toBe("took too long");
    const failed = pipelineSteps(src("cert"));
    expect(failed.map((s) => s.state)).toEqual(["done", "fail", "todo", "todo", "todo"]);
    expect(failed[1]).toMatchObject({ text: "Stopped at checking file", meta: "password-protected" });
    const live = pipelineSteps(src("install"));
    expect(live.find((s) => s.state === "live")).toMatchObject({ stage: "chunk", text: "Splitting into passages" });
    expect(pipelineSteps(src("site"))[0].text).toBe("Fetched coldtrace.io");
  });
  it("labels unreadable files with their own extension", () => {
    const { container } = render(<FileTile kind="pdf" label="key" />);
    expect(container.textContent).toBe("key");
  });
  it("shows a crawled site's favicon in the tile, and the globe when there is no host", () => {
    expect(faviconHost("www.gs1kenya.org")).toBe("gs1kenya.org");
    expect(faviconHost("localhost")).toBeUndefined();
    const { container, rerender } = render(<FileTile kind="url" host="gs1kenya.org" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", faviconSrc("gs1kenya.org"));
    rerender(<FileTile kind="url" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("SourceList", () => {
  it("puts what needs you first, then what's still being read", () => {
    render(<SourceList sources={SOURCES} filter="all" onFilter={vi.fn()} onOpen={vi.fn()} />);
    const names = screen.getAllByRole("button", { name: /\.(pdf|docx|md)$|coldtrace\.io/ }).filter((b) => b.className === "k-src__open").map((b) => b.textContent);
    expect(names.slice(0, 4)).toEqual(["Gateway spec sheet v4.pdf", "Calibration certificate 2026.pdf", "Warehouse install guide.pdf", "coldtrace.io/blog"]);
    expect(screen.getByRole("progressbar", { name: /Warehouse install guide.pdf: Splitting into passages/ })).toBeInTheDocument();
    expect(screen.getByText("Partly read · 31 of 38 pages")).toBeInTheDocument();
  });
  it("filters, and says so when a filter is empty", async () => {
    const onFilter = vi.fn();
    const { rerender } = render(<SourceList sources={SOURCES} filter="all" onFilter={onFilter} onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: /Needs you/ }));
    expect(onFilter).toHaveBeenCalledWith("attention");
    expect(filterSources(SOURCES, "web").every((s) => s.kind === "url")).toBe(true);
    expect(filterSources(SOURCES, "files").some((s) => s.kind === "url")).toBe(false);
    rerender(<SourceList sources={SOURCES.filter((s) => s.status.s === "ready")} filter="attention" onFilter={onFilter} onOpen={vi.fn()} />);
    expect(screen.getByText("Nothing needs you")).toBeInTheDocument();
  });
  it("opens a source and offers row actions", async () => {
    const onOpen = vi.fn(); const onAction = vi.fn();
    render(<SourceList sources={SOURCES} filter="all" onFilter={vi.fn()} onOpen={onOpen} onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "ColdTrace pitch 2026.pdf" }));
    expect(onOpen).toHaveBeenCalledWith("pitch");
    await userEvent.click(screen.getByRole("button", { name: "Actions for ColdTrace pitch 2026.pdf" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
    expect(onAction).toHaveBeenCalledWith("pitch", "remove");
  });
});

describe("SourceDetail", () => {
  it("explains a partial read and offers a replacement", async () => {
    const onAction = vi.fn();
    render(<SourceDetail src={src("gateway")} knowledge={KNOWLEDGE} onAction={onAction} onJump={vi.fn()} />);
    expect(screen.getByText("31 of 38 pages used · 7 skipped")).toBeInTheDocument();
    expect(screen.getAllByText(/skipped pages 12–18/).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(/They’re scanned images with no text layer, and Corral can’t read text inside images yet/);
    expect(screen.getByRole("figure", { name: "31 pages used, 7 skipped" })).toBeInTheDocument();
    expect(document.querySelectorAll(".k-pages__p.is-off")).toHaveLength(7);
    await userEvent.click(screen.getByRole("button", { name: /Upload a text version/ }));
    expect(onAction).toHaveBeenCalledWith("gateway", "replace");
    await userEvent.click(screen.getAllByRole("button", { name: /Replace file/ })[0]);
    expect(onAction).toHaveBeenCalledTimes(2);
  });
  it("partial: skipped_reason picks the copy and the fix, not the note text", async () => {
    const onAction = vi.fn();
    // The note says scans, the reason says size-limit: the reason wins (M10c, 2f66f91).
    const limit: Source = { ...REVIEW_SOURCES["partial-limit"], status: { ...(REVIEW_SOURCES["partial-limit"].status as Extract<Source["status"], { s: "partial" }>), note: "7 pages are scanned images." } };
    const { unmount } = render(<SourceDetail src={limit} onAction={onAction} />);
    expect(screen.getByText("500 of 620 pages used · 120 skipped")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Corral reads up to 500 pages of one file, so it stopped there and skipped pages 501–620/);
    expect(screen.getByRole("status")).not.toHaveTextContent(/scanned/);
    expect(screen.getByRole("figure", { name: "500 pages used, 120 skipped" })).toHaveTextContent("past the limit");
    expect(document.querySelectorAll(".k-pages__p").length).toBeLessThanOrEqual(76);
    await userEvent.click(screen.getByRole("button", { name: /Replace with the first part/ }));
    expect(onAction).toHaveBeenLastCalledWith(limit.id, "replace");
    unmount();
    const web = REVIEW_SOURCES["partial-web"];
    const w = render(<SourceDetail src={web} onAction={onAction} />);
    expect(screen.getByRole("status")).toHaveTextContent(/3 pages in this section didn’t load or had no text/);
    expect(screen.queryByRole("figure")).toBeNull();
    await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: /Re-read/ }));
    expect(onAction).toHaveBeenLastCalledWith(web.id, "reread");
    w.unmount();
    const mixed = render(<SourceDetail src={REVIEW_SOURCES["partial-mixed"]} onAction={onAction} />);
    expect(screen.getByRole("status")).toHaveTextContent(/for two reasons: some are scanned images .* past the most Corral reads/);
    expect(screen.getByRole("button", { name: /Upload a text version/ })).toBeInTheDocument();
    mixed.unmount();
    render(<SourceDetail src={REVIEW_SOURCES["partial-text-limit"]} onAction={onAction} />);
    expect(screen.getByText("Partly read · the end was skipped")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/skipped the end of the document/);
    expect(screen.queryByRole("figure")).toBeNull();
  });
  it("each skip reason has its own copy and fix", () => {
    expect(SKIP_REASONS.map((r) => SKIP[r].fix)).toEqual(["text-version", "split", "reread", "text-version"]);
    expect(new Set(SKIP_REASONS.map((r) => SKIP[r].key)).size).toBe(4);
  });
  it("unreadable: couldn't read the file, Replace file, and what happened", async () => {
    const onAction = vi.fn();
    const { unmount } = render(<SourceDetail src={REVIEW_SOURCES.unreadable} onAction={onAction} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Corral couldn’t read this file");
    expect(screen.getByRole("alert")).toHaveTextContent(/It may be damaged, or it took too long to open.*Corral isn’t using anything from it/);
    expect(screen.getByText("failure: unreadable · failure_stage: parse")).toBeInTheDocument();
    expect(screen.getByText(/isn’t really a PDF/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: /Replace file/ }));
    expect(onAction).toHaveBeenCalledWith("pricelist", "replace");
    unmount();
    render(<SourceDetail src={REVIEW_SOURCES["unreadable-timeout"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/^.*Reading the file took too long\. Save a fresh copy or export it as PDF, then replace it\./);
    expect(screen.getByText(/isn’t really a Word document|very large or complex/)).toHaveTextContent(/very large or complex/);
  });
  it("interrupted: tried 5 times, Try again first, with the detail open", async () => {
    const onAction = vi.fn();
    render(<SourceDetail src={REVIEW_SOURCES.interrupted} onAction={onAction} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Reading stopped");
    expect(alert).toHaveTextContent(/Your file is kept/);
    expect(document.querySelector("details.k-why")).toHaveAttribute("open");
    expect(document.querySelector(".k-why dd")).toHaveTextContent("Indexing embed");
    expect(screen.getByText("Corral couldn’t finish reading it.")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Corral tried 5 times and couldn’t finish, so nothing from it is searchable yet.");
    expect(screen.getByText("Tried 5 times, waiting longer between each, then stopped.")).toBeInTheDocument();
    expect(screen.getByText("Today, 09:12")).toBeInTheDocument();
    expect(screen.getByText("tried 5 times")).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(onAction).toHaveBeenCalledWith("fleet", "reread");
    await userEvent.click(screen.getByRole("button", { name: /Replace instead/ }));
    expect(onAction).toHaveBeenCalledWith("fleet", "replace");
  });
  it("interrupted at upload: the file is gone, so it asks for it again", async () => {
    const onAction = vi.fn();
    const lost: Source = { ...REVIEW_SOURCES.interrupted, status: { s: "failed", failure: "interrupted", at: "upload", note: "The upload wasn't stored." } };
    render(<SourceDetail src={lost} onAction={onAction} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/nothing to try again/);
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    expect(screen.queryByText(/Tried \d+ times/)).toBeNull();
    expect(screen.getByText("Not stored. Upload it again.")).toBeInTheDocument();
    expect(screen.getByText("file not stored")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Upload again/ }));
    expect(onAction).toHaveBeenCalledWith("fleet", "replace");
  });
  it("interrupted once (a crash) says it stopped, not that it retried; no attempts falls back to the old copy", () => {
    const { unmount } = render(<SourceDetail src={REVIEW_SOURCES["interrupted-crash"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Corral stopped partway through reading it");
    expect(screen.getByText("Tried once. This kind of stop isn’t retried on its own.")).toBeInTheDocument();
    unmount();
    const bare: Source = { ...REVIEW_SOURCES.interrupted, status: { s: "failed", failure: "interrupted", at: "embed" } };
    render(<SourceDetail src={bare} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Corral tried again on its own and still couldn’t finish");
    expect(screen.getByText("Corral retried on its own until it ran out of tries.")).toBeInTheDocument();
  });
  it("a retry in progress shows its try in the row and the live step", () => {
    const { unmount } = render(<SourceState src={REVIEW_SOURCES.retrying} />);
    expect(screen.getByText(/· try 3/)).toBeInTheDocument();
    unmount();
    render(<SourceDetail src={REVIEW_SOURCES.retrying} />);
    expect(screen.getByText(/try 3 · retrying after a hiccup/)).toBeInTheDocument();
  });
  it("a partial row without counts says the end was skipped", () => {
    render(<SourceState src={REVIEW_SOURCES["partial-text-limit"]} />);
    expect(screen.getByText(/Partly read · end skipped/)).toBeInTheDocument();
  });
  it("a failure whose fix is removal offers Remove; a web page has no file line", async () => {
    const onAction = vi.fn();
    const blocked: Source = { ...src("blog"), status: { s: "failed", failure: "blocked", at: "upload" } };
    render(<SourceDetail src={blocked} onAction={onAction} />);
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Remove" }));
    expect(onAction).toHaveBeenCalledWith("blog", "remove");
    const web: Source = { ...src("blog"), id: "w2", status: { s: "failed", failure: "interrupted", at: "parse" } };
    render(<SourceDetail src={web} />);
    expect(screen.queryByText("Your file")).toBeNull();
  });
  it("page ticks: one per page up to 76, then buckets that are part-skipped where they straddle", () => {
    expect(pageTicks(3, [2])).toEqual(["on", "off", "on"]);
    const big = pageTicks(620, Array.from({ length: 120 }, (_, i) => 501 + i));
    expect(big).toHaveLength(69);
    expect(big.filter((t) => t === "off").length).toBe(13);
    expect(big.includes("part")).toBe(true);
    expect(pageTicks(76, [])).toHaveLength(76);
  });
  it("the page strip counts one page, and ignores pages past the total", () => {
    render(<PageStrip total={3} skipped={[2]} />);
    expect(screen.getByRole("figure", { name: "2 pages used, 1 skipped" })).not.toHaveTextContent("images");
  });
  it("lists where a source is cited and jumps there", async () => {
    const onJump = vi.fn();
    render(<SourceDetail src={src("pitch")} knowledge={KNOWLEDGE} onJump={onJump} />);
    expect(citedBy("pitch").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: /In one line/ })[0]);
    expect(onJump).toHaveBeenCalledWith("one");
    expect(screen.getByText(/Passages/)).toHaveTextContent("3 of 46");
  });
  it("says a failed source is unused, with its fix", () => {
    render(<SourceDetail src={src("cert")} knowledge={KNOWLEDGE} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Remove the password, then add it again.");
    expect(screen.queryByRole("button", { name: /Read again/ })).toBeNull();
  });
});

function Queue({ initial = [] as QueueItem[], onDone = vi.fn(), open = true }) {
  const q = useUploadQueue({ initial, onDone });
  return <><UploadDialog open={open} onClose={vi.fn()} q={q} product="ColdTrace Sensors" existing={["ColdTrace pitch 2026.pdf"]} inline /><UploadTray q={q} onOpen={vi.fn()} inline /></>;
}
const pick = (files: { name: string; size: number }[]) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: files.map((f) => new File([new Uint8Array(Math.min(f.size, 8))], f.name)).map((file, i) => Object.defineProperty(file, "size", { value: files[i].size })) } });
};

describe("Upload", () => {
  it("rejects unsupported, oversized and duplicate files before uploading", () => {
    expect(fileItem({ name: "deck.key", size: 10 })).toMatchObject({ state: "error", error: { title: ".key files aren't supported" } });
    expect(fileItem({ name: "big.pdf", size: 40 * 1048576 })).toMatchObject({ state: "error", error: { title: "40 MB is over the 25 MB limit" } });
    expect(fileItem({ name: "a.pdf", size: 1 }, ["a.pdf"])).toMatchObject({ state: "error", error: { actions: ["replace", "skip"] } });
    expect(fileItem({ name: "a.md", size: 1 })).toMatchObject({ state: "queued", kind: "md" });
  });
  it("uploads, checks and hands each file to the source list", () => {
    vi.useFakeTimers();
    try {
      const onDone = vi.fn();
      render(<Queue onDone={onDone} />);
      pick([{ name: "Retrofit guide.pdf", size: 2 * 1048576 }, { name: "Deck.key", size: 10 }]);
      expect(screen.getByText(/\.key files aren't supported/)).toBeInTheDocument();
      expect(screen.getAllByRole("status").some((s) => /Adding 1 of 1 · 1 needs attention/.test(s.textContent ?? ""))).toBe(true);
      for (let i = 0; i < 12; i++) act(() => { vi.advanceTimersByTime(280); });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone.mock.calls[0][0]).toMatchObject({ name: "Retrofit guide.pdf", state: "done" });
      expect(screen.getByText(/Added\. Corral is reading it now/)).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("fails a password-protected PDF at the check, and retries a stopped upload", () => {
    vi.useFakeTimers();
    try {
      render(<Queue initial={reviewQueue("upload-errors")} />);
      expect(screen.getByText(/Upload stopped\./)).toBeInTheDocument();
      pick([{ name: "Price list password.pdf", size: 1024 }]);
      for (let i = 0; i < 8; i++) act(() => { vi.advanceTimersByTime(280); });
      expect(screen.getAllByText(/This PDF is password-protected\./)).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
      expect(screen.queryByText(/Upload stopped\./)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("explains a bad web address and queues a good one", async () => {
    render(<Queue />);
    const url = screen.getByRole("textbox", { name: "Or add a web page" });
    await userEvent.type(url, "localhost:3000");
    await userEvent.click(screen.getByRole("button", { name: "Add page" }));
    expect(screen.getByText("Corral can only read public web pages.")).toBeInTheDocument();
    await userEvent.clear(url);
    await userEvent.type(url, "coldtrace.io/pricing{Enter}");
    expect(screen.getAllByText("coldtrace.io/pricing").length).toBeGreaterThan(0);
  });
  it("caps a drop at 20 files and says so", () => {
    render(<Queue />);
    pick(Array.from({ length: 22 }, (_, i) => ({ name: `f${i}.md`, size: 100 })));
    expect(screen.getByText(/Only 20 files at a time/)).toBeInTheDocument();
  });
});

function Editor({ initialEditing, failFirstSave }: { initialEditing?: string; failFirstSave?: boolean }) {
  const [k, setK] = useState(KNOWLEDGE);
  return <KnowledgeEditor sections={k} onChange={setK} sources={SOURCES} onOpenSource={vi.fn()} onShowSources={vi.fn()} initialEditing={initialEditing} failFirstSave={failFirstSave} />;
}

describe("KnowledgeEditor", () => {
  it("lists what needs you", () => {
    expect(attentionOf(KNOWLEDGE).map((a) => a.kind)).toEqual(["review", "stale", "conflict"]);
    render(<Editor />);
    expect(screen.getByRole("region", { name: "Needs you" })).toHaveTextContent("3 lines need you");
    expect(screen.getByRole("heading", { level: 1, name: "ColdTrace Sensors" })).toBeInTheDocument();
  });
  it("edits and saves a line as yours", () => {
    vi.useFakeTimers();
    try {
      render(<Editor />);
      fireEvent.click(screen.getByRole("button", { name: /Edit: Median alert time/ }));
      const box = screen.getByRole("textbox", { name: "What Corral can say" });
      fireEvent.change(box, { target: { value: "Median alert time is 94 seconds." } });
      fireEvent.keyDown(box, { key: "Enter", metaKey: true });
      expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
      act(() => { vi.advanceTimersByTime(700); });
      expect(screen.getByText("Median alert time is 94 seconds.")).toBeInTheDocument();
      expect(screen.getByText(/All changes saved · just now/)).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("cancels with Esc and drops an empty new line", async () => {
    render(<Editor />);
    await userEvent.click(screen.getByRole("button", { name: "Add a pain" }));
    const box = screen.getByRole("textbox", { name: "What Corral can say" });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "What Corral can say" })).toBeNull();
  });
  it("shows a failed save without losing the edit", () => {
    render(<Editor initialEditing="proof-kilima" failFirstSave />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save this line.");
    expect((screen.getByRole("textbox", { name: "What Corral can say" }) as HTMLTextAreaElement).value).toMatch(/^Kilima Dairies cut spoilage/);
  });
  it("resolves a conflict, a removed source and a new line", async () => {
    render(<Editor />);
    const conflict = document.getElementById("k-item-price")!;
    await userEvent.click(within(conflict).getAllByRole("button", { name: "Use this" })[1]);
    expect(screen.getByText(/\$39 per sensor per month, billed annually/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep as my claim" }));
    await userEvent.click(screen.getByRole("button", { name: "Looks right" }));
    expect(screen.queryByRole("region", { name: "Needs you" })).toBeNull();
  });
  it("marks a citation to a removed source", () => {
    render(<Editor />);
    expect(sourceName("brochure")).toBe("Warehouse brochure 2024.pdf");
    expect(screen.getByText("(removed)", { exact: false })).toBeInTheDocument();
  });
});

describe("KnowledgeBase", () => {
  let last: ReturnType<typeof render> | undefined;
  const mount = (state?: Parameters<typeof KnowledgeBase>[0]["state"], addOpen = false) => {
    const onAdd = vi.fn();
    last = render(<KnowledgeBase state={state} addOpen={addOpen} onAddOpenChange={onAdd} contained />);
    return onAdd;
  };
  const cleanupAndMount = (state: Parameters<typeof KnowledgeBase>[0]["state"]) => { last?.unmount(); mount(state); };
  it("starts empty with the drop zone as the page", () => {
    mount("empty");
    expect(screen.getByRole("heading", { name: "Teach Corral what you sell" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Sources/ })).toHaveTextContent("0");
  });
  it("says the page is drafted once the first source is read", () => {
    mount("drafting");
    expect(screen.getByText(/Corral drafts this page once your first source is read/)).toBeInTheDocument();
  });
  it("shows loading and error states", async () => {
    mount("loading");
    expect(screen.getByLabelText("Loading knowledge")).toHaveAttribute("aria-busy", "true");
  });
  it("retries after an error", () => {
    vi.useFakeTimers();
    try {
      mount("error");
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load the knowledge base");
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
      act(() => { vi.advanceTimersByTime(800); });
      expect(screen.getByRole("heading", { level: 1, name: "ColdTrace Sensors" })).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("removes a source after confirming, and marks what cited it", async () => {
    mount("source");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog", { name: /Remove ColdTrace pitch 2026.pdf/ })).toHaveTextContent("lines of knowledge cite it");
    await userEvent.click(screen.getByRole("button", { name: "Remove source" }));
    expect(screen.queryByRole("button", { name: "ColdTrace pitch 2026.pdf" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Knowledge" }));
    expect(screen.getByRole("region", { name: "Needs you" })).toHaveTextContent(/lines need you/);
  });
  it("opens the dialog when files are dropped on the page", () => {
    const onAdd = mount("sources");
    const view = document.querySelector(".k-kb")!;
    const dataTransfer = { types: ["Files"], files: [new File(["x"], "Notes.md")] };
    fireEvent.dragEnter(view, { dataTransfer });
    expect(screen.getByText("Drop to add to ColdTrace Sensors")).toBeInTheDocument();
    fireEvent.drop(view, { dataTransfer });
    expect(onAdd).toHaveBeenCalledWith(true);
    expect(screen.getByRole("region", { name: "Uploads" })).toBeInTheDocument();
  });
  it("opens the M10b failures in the detail, on top of the list", () => {
    mount("unreadable");
    expect(screen.getByRole("complementary", { name: /Distributor price list 2026.pdf details/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Sources/ })).toHaveTextContent(String(SOURCES.length + 1));
    cleanupAndMount("interrupted");
    expect(screen.getByRole("complementary", { name: /Reefer fleet brochure.pdf details/ })).toHaveTextContent("Reading stopped");
    cleanupAndMount("partial-limit");
    expect(screen.getByRole("complementary", { name: /Gateway service manual 2019–2026.pdf details/ })).toHaveTextContent("500 of 620 pages used");
    cleanupAndMount("partial-web");
    expect(screen.getByRole("complementary", { name: /coldtrace.io\/blog details/ })).toHaveTextContent("didn’t load or had no text");
    cleanupAndMount("partial-mixed");
    expect(screen.getByRole("complementary", { name: /Installer archive/ })).toHaveTextContent("for two reasons");
  });
  it("shows the tray while uploads continue", () => {
    mount("tray");
    expect(screen.getByRole("region", { name: "Uploads" })).toHaveTextContent("Adding");
  });
});
