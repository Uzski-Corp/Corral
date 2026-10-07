import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { router } from "@/test/router";
import { HEROES, VARIANT_IDS, type VariantId } from "@/components/marketing/landing-v/copy";
import { LandingVariant } from "@/components/marketing/landing-v/Variant";
import Page, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const props = (variant: string) => ({ params: Promise.resolve({ variant }) }) as never;

describe("/v/[variant] routes", () => {
  it("prerenders exactly /v/1 to /v/4 and nothing else", () => {
    expect(generateStaticParams()).toEqual([{ variant: "1" }, { variant: "2" }, { variant: "3" }, { variant: "4" }]);
    expect(dynamicParams).toBe(false);
  });

  it.each(VARIANT_IDS)("keeps /v/%s out of search, canonical to /", async (v) => {
    const meta = await generateMetadata(props(v));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toEqual({ canonical: "/" });
    expect(meta.title).toEqual({ absolute: HEROES[v].title });
    expect(meta.description).toMatch(/agentic lead acquisition/i);
  });

  it("has no metadata and 404s for an unknown variant", async () => {
    expect(await generateMetadata(props("9"))).toEqual({});
    await expect(Page(props("9"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(VARIANT_IDS)("renders /v/%s with its own hero and waitlist source", async (v) => {
    const { container } = render(await Page(props(v)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(HEROES[v].headline);
    expect(container.querySelector("main")).toHaveAttribute("data-variant", v);
    const sources = [...container.querySelectorAll<HTMLInputElement>('input[name="source"]')].map((i) => i.value);
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sources)).toEqual(new Set([`v${v}`]));
    // Exactly one set of no-script result lines per page (ids must be unique).
    expect(container.querySelectorAll("#waitlist-joined")).toHaveLength(1);
    expect(container.querySelectorAll("form[action='/api/waitlist']").length).toBe(sources.length);
  });
});

describe("the variant picker (harness chrome)", () => {
  const picker = () => screen.getByRole("navigation", { name: "Prototype variants" });
  const names = VARIANT_IDS.map((id) => HEROES[id].name);

  it("marks the current variant and navigates to another on click", () => {
    render(<LandingVariant v="2" />);
    expect(within(picker()).getByRole("button", { name: names[1] })).toHaveAttribute("aria-current", "true");
    fireEvent.click(within(picker()).getByRole("button", { name: names[1] }));
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(within(picker()).getByRole("button", { name: names[3] }));
    expect(router.push).toHaveBeenCalledWith("/v/4", { scroll: false });
  });

  it.each([
    ["3", "1", "/v/3"],
    ["ArrowRight", "4", "/v/1"],
    ["ArrowLeft", "1", "/v/4"],
  ] as [string, VariantId, string][])("key %s on /v/%s goes to %s", (key, v, to) => {
    render(<LandingVariant v={v} />);
    fireEvent.keyDown(document, { key });
    expect(router.push).toHaveBeenCalledWith(to, { scroll: false });
  });

  it("ignores keys while typing, with modifiers, for the current variant and out of range", () => {
    render(<LandingVariant v="1" />);
    fireEvent.keyDown(screen.getAllByRole("textbox")[0], { key: "2" });
    fireEvent.keyDown(document, { key: "2", metaKey: true });
    fireEvent.keyDown(document, { key: "1" });
    fireEvent.keyDown(document, { key: "9" });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("replays the hero entrance on R and on the replay button", () => {
    render(<LandingVariant v="1" />);
    const first = screen.getByRole("heading", { level: 1 });
    act(() => { fireEvent.keyDown(document, { key: "r" }); });
    const second = screen.getByRole("heading", { level: 1 });
    expect(second).not.toBe(first);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Replay animation (R)" })); });
    expect(screen.getByRole("heading", { level: 1 })).not.toBe(second);
  });

  it("is left out when a variant is promoted (picker={false})", () => {
    render(<LandingVariant v="3" picker={false} />);
    expect(screen.queryByRole("navigation", { name: "Prototype variants" })).toBeNull();
  });
});
