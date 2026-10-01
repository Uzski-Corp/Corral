import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import type { SearchHit } from "@/lib/api/kb";
import { REVIEW_SOURCES, SOURCES } from "./data";
import { KnowledgeBase, reviewSearch, sampleSearch } from "./KnowledgeBase";
import { PassageItem, PassageText, PersonMark, byName } from "./parts";
import { KbSearch, mark, termsOf } from "./Search";
import { SourceList } from "./SourceList";
import { FirstProductField, ReplacingCard, UploadDialog, useUploadQueue } from "./Upload";

const hit = (i: number, over: Partial<SearchHit> = {}): SearchHit => ({ passageId: `p${i}`, sourceId: "gateway", sourceName: "Gateway spec sheet v4.pdf", sourceKind: "pdf", loc: "p.19", text: `Battery life is five years (${i}).`, score: 1 - i / 100, ...over });

describe("M11 people: a teammate we can't name", () => {
  it("draws a neutral mark and 'Teammate', and a known person by photo or initials", () => {
    const anon = { name: "Teammate", unknown: true };
    expect(byName(anon)).toBe("Teammate");
    expect(byName({ name: "Tomás Ibarra" })).toBe("Tomás");
    expect(byName({ name: "Tomás Ibarra" }, "full")).toBe("Tomás Ibarra");
    const { container, rerender } = render(<PersonMark by={anon} />);
    expect(container.querySelector(".k-anon")).toBeInTheDocument();
    rerender(<PersonMark by={{ name: "Amara Njoroge" }} />);
    expect(container.querySelector(".c-mono-av")).toHaveTextContent("AN");
    rerender(<PersonMark by={{ name: "Tomás", avatar: "tomas" }} />);
    expect(container.querySelector("img")).toBeInTheDocument();
    render(<SourceList sources={[REVIEW_SOURCES.warranty]} filter="all" onFilter={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole("row", { name: /Sensor warranty/ })).toHaveTextContent("Teammate");
  });
});

describe("M11 passages", () => {
  it("puts a heading label on its own line with the full text on focus, and strips markdown markers", () => {
    render(<ul><PassageItem loc="ColdTrace T4 wireless temperature sensors: warranty" ordinal={0} text={"# ColdTrace T4 wireless temperature sensors: warranty\nA **three-year** warranty.\n## Returns\nTwo days."} /></ul>);
    const label = screen.getByText("ColdTrace T4 wireless temperature sensors: warranty").closest(".k-phead") as HTMLElement;
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(label);
    expect(screen.getByRole("tooltip")).toHaveTextContent("ColdTrace T4 wireless temperature sensors: warranty");
    fireEvent.blur(label);
    fireEvent.mouseEnter(label);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(label);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByText("A three-year warranty.")).toBeInTheDocument();
    expect(screen.getByText("Returns").tagName).toBe("B");
    expect(document.body.textContent).not.toContain("#");
  });
  it("keeps a short locator in the column", () => {
    render(<ul><PassageItem loc="p. 14" ordinal={0} text="Plain." /></ul>);
    expect(screen.getByText("p. 14")).toHaveClass("k-ploc");
    render(<PassageText text="x" clamp={false} />);
  });
});

describe("M11 search", () => {
  it("marks query terms", () => {
    expect(termsOf("Battery life, battery")).toEqual(["battery", "life"]);
    const { container } = render(<p>{mark("Battery life is long", ["battery", "life"])}</p>);
    expect(container.querySelectorAll("mark")).toHaveLength(2);
    expect(mark("x", [])).toEqual(["x"]);
  });
  it("a passage that is only its heading shows the heading label, and no empty text row", async () => {
    const search = vi.fn().mockResolvedValue(ok([
      hit(0, { sourceName: "coldtrace-overview.md", sourceKind: "md", loc: "## Who buys it", text: "## Who buys it" }),
      hit(1, { sourceName: "coldtrace-pricing-faq.md", sourceKind: "md", loc: "## Pricing", text: "## Pricing\nFrom $12 a sensor a month." }),
    ]));
    const { container } = render(<KbSearch search={search} searchable={40} onOpen={() => {}}><p>the list</p></KbSearch>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "buys" } });
    const only = await screen.findByRole("button", { name: /coldtrace-overview\.md/ });
    expect(within(only).getByText("Who buys it")).toBeInTheDocument();
    expect(only.querySelector(".k-hit__txt")).toBeNull();
    const withText = screen.getByRole("button", { name: /coldtrace-pricing-faq\.md/ });
    expect(withText.querySelector(".k-hit__txt")).toHaveTextContent("From $12 a sensor a month.");
    expect(container.querySelectorAll(".k-hit__txt:empty")).toHaveLength(0);
  });
  it("searches as you type: loading, results with source and label, show more to 20, open a source", async () => {
    let resolve: ((v: ReturnType<typeof ok<SearchHit[]>>) => void) | undefined;
    const search = vi.fn((_q: string, limit: number) => new Promise<ReturnType<typeof ok<SearchHit[]>>>((r) => { resolve = (v) => r(v); void limit; }));
    const onOpen = vi.fn();
    render(<KbSearch search={search} searchable={40} onOpen={onOpen}><p>the list</p></KbSearch>);
    expect(screen.getByText(/40 passages/)).toBeInTheDocument();
    const box = screen.getByRole("searchbox", { name: "Search your sources" });
    fireEvent.change(box, { target: { value: "b" } });
    expect(screen.getByText("the list")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "battery" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("battery", 8, expect.anything()));
    expect(screen.getByRole("status", { name: "Searching for battery" })).toBeInTheDocument();
    await act(async () => resolve!(ok(Array.from({ length: 8 }, (_, i) => hit(i, i === 1 ? { loc: null } : {})))));
    expect(screen.getByText(/8 passages/)).toBeInTheDocument();
    expect(screen.getAllByText("Gateway spec sheet v4.pdf")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(search).toHaveBeenLastCalledWith("battery", 20, expect.anything());
    await act(async () => resolve!(ok(Array.from({ length: 20 }, (_, i) => hit(i)))));
    expect(screen.getByText(/20 closest passages/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Gateway spec sheet/ })[0]);
    expect(onOpen).toHaveBeenCalledWith("gateway");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.getByText("the list")).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Escape" });
  });
  it("shows no results, and an error with Try again", async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(err({ kind: "http", op: "POST /search", status: 503, message: "down" }))
      .mockResolvedValueOnce(ok([hit(0)]))
      .mockResolvedValueOnce(err({ kind: "aborted", op: "POST /search", message: "a" }));
    const onAdd = vi.fn();
    render(<KbSearch search={search} searchable={4} onOpen={() => {}} onAdd={onAdd}><p>the list</p></KbSearch>);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "solar" } });
    await screen.findByText(/Nothing in your sources matches/);
    fireEvent.click(screen.getByRole("button", { name: /Add sources/ }));
    expect(onAdd).toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "solar panels" } });
    await screen.findByText("Couldn’t search your sources");
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await screen.findByText(/1 passage\b/);
    fireEvent.change(box, { target: { value: "solar panel" } });
    await waitFor(() => expect(screen.getByText("the list")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  });
  it("is disabled until something has been read", () => {
    render(<KbSearch search={vi.fn()} searchable={0} onOpen={() => {}}><p>list</p></KbSearch>);
    expect(screen.getByRole("searchbox")).toBeDisabled();
  });
  it("sample search and the frozen review states", async () => {
    const r = await sampleSearch([...SOURCES, REVIEW_SOURCES.warranty])("battery", 8);
    expect(r.ok && r.value[0].sourceId).toBeTruthy();
    expect(reviewSearch("search", SOURCES)?.state).toMatchObject({ phase: "done" });
    expect(reviewSearch("search-none", SOURCES)?.state).toMatchObject({ phase: "done", hits: [] });
    expect(reviewSearch("search-loading", SOURCES)?.state.phase).toBe("loading");
    expect(reviewSearch("search-error", SOURCES)?.state.phase).toBe("error");
    expect(reviewSearch("sources", SOURCES)).toBeUndefined();
  });
});

describe("M11 first product and replace", () => {
  it("prefills, can be skipped to a line, and renamed", () => {
    const setName = vi.fn();
    render(<FirstProductField fp={{ name: "", workspace: "ColdTrace", setName }} />);
    const box = screen.getByRole("textbox", { name: "What do you sell?" });
    fireEvent.change(box, { target: { value: "Sensors" } });
    expect(setName).toHaveBeenCalledWith("Sensors");
    fireEvent.blur(box);
    expect(setName).toHaveBeenLastCalledWith("ColdTrace");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("ColdTrace").tagName).toBe("B");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
  it("the replace dialog names the source, and takes one file", () => {
    render(<ReplacingCard src={REVIEW_SOURCES.warranty} />);
    expect(screen.getByText("Markdown · 6.2 KB · 12 passages")).toBeInTheDocument();
    function D() { const q = useUploadQueue({ live: false }); return <UploadDialog open inline onClose={() => {}} q={q} product="P" replacing={SOURCES[4]} />; }
    render(<ReplacingCard src={SOURCES[4]} />);
    expect(screen.getByText("PDF · 18 pages · 4.2 MB · 46 passages")).toBeInTheDocument();
    render(<D />);
    const dlg = screen.getByRole("dialog", { name: "Replace file" });
    expect(within(dlg).getByText("ColdTrace pitch 2026.pdf")).toBeInTheDocument();
    expect(within(dlg).queryByText("Or add a web page")).toBeNull();
  });
});

describe("M11 knowledge tab", () => {
  it("not drafted: honest page, search and sources actions", async () => {
    render(<KnowledgeBase state="not-drafted" addOpen={false} onAddOpenChange={() => {}} contained />);
    expect(screen.getByRole("heading", { name: /This page isn’t drafted yet/ })).toBeInTheDocument();
    expect(screen.getAllByText("Not drafted")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /Search your sources/ }));
    await screen.findByRole("searchbox");
    fireEvent.click(screen.getByRole("tab", { name: /Knowledge/ }));
    fireEvent.click(screen.getByRole("button", { name: "See sources" }));
    expect(screen.getByRole("table", { name: "Sources" })).toBeInTheDocument();
  });
  it("first product, markdown and search review states render", () => {
    const { unmount } = render(<KnowledgeBase state="first-product" addOpen={false} onAddOpenChange={() => {}} contained />);
    expect(screen.getByRole("textbox", { name: "What do you sell?" })).toHaveValue("ColdTrace");
    unmount();
    const m = render(<KnowledgeBase state="markdown" addOpen={false} onAddOpenChange={() => {}} contained />);
    expect(screen.getByText(/Added by a teammate/)).toBeInTheDocument();
    m.unmount();
    const s = render(<KnowledgeBase state="search" addOpen={false} onAddOpenChange={() => {}} contained />);
    expect(screen.getByRole("searchbox")).toHaveValue("battery life");
    expect(screen.getByText(/5 passages/)).toBeInTheDocument();
    s.unmount();
    render(<KnowledgeBase state="replace" addOpen onAddOpenChange={() => {}} contained />);
    expect(screen.getByRole("dialog", { name: "Replace file" })).toBeInTheDocument();
  });
});
