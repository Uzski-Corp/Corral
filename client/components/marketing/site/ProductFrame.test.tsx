import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductFrame } from "./ProductFrame";

type Idle = { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
const w = window as unknown as Idle;
afterEach(() => { delete w.requestIdleCallback; delete w.cancelIdleCallback; vi.useRealTimers(); });

const frame = (eager?: boolean) => render(
  <ProductFrame eager={eager} label="the Companies screen" caption="The app.">
    <p>live screen</p>
  </ProductFrame>,
);

describe("ProductFrame (ENG-87)", () => {
  it("an eager (hero) frame shows the skeleton first and mounts the screen when the browser is idle", () => {
    let fire: (() => void) | undefined;
    w.requestIdleCallback = vi.fn((cb: () => void) => { fire = cb; return 1; });
    w.cancelIdleCallback = vi.fn();
    frame(true);
    expect(screen.getByRole("status", { name: "Loading the Companies screen" })).toBeInTheDocument();
    expect(screen.queryByText("live screen")).toBeNull();
    expect(w.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    act(() => fire!());
    expect(screen.getByText("live screen")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading the Companies screen" })).toBeNull();
  });

  it("falls back to a short timeout without requestIdleCallback (Safari)", () => {
    vi.useFakeTimers();
    frame(true);
    expect(screen.queryByText("live screen")).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText("live screen")).toBeInTheDocument();
  });

  it("cancels the idle mount if it unmounts first", () => {
    w.requestIdleCallback = vi.fn(() => 9);
    w.cancelIdleCallback = vi.fn();
    frame(true).unmount();
    expect(w.cancelIdleCallback).toHaveBeenCalledWith(9);
  });

  it("stays inert and described until Try it, then hands over the controls", async () => {
    vi.useFakeTimers();
    frame(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole("img", { name: "Corral screen: the Companies screen. Sample data." })).toBeInTheDocument();
    act(() => { screen.getByRole("button", { name: /Try it/ }).click(); });
    expect(screen.getByRole("region", { name: "the Companies screen, sample data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("a frame lower down mounts at once where there is no IntersectionObserver", () => {
    frame(false);
    expect(screen.getByText("live screen")).toBeInTheDocument();
  });
});
