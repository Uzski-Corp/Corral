import { describe, expect, it, vi } from "vitest";
import { IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS, whenIdle, type IdleHost } from "./idle";

const timers = (): IdleHost => ({ setTimeout: vi.fn(() => 7), clearTimeout: vi.fn() });

describe("whenIdle", () => {
  it("uses requestIdleCallback with a deadline, and cancels it", () => {
    const fn = vi.fn();
    const host: IdleHost = { ...timers(), requestIdleCallback: vi.fn((cb) => { cb(); return 3; }), cancelIdleCallback: vi.fn() };
    const cancel = whenIdle(fn, host);
    expect(host.requestIdleCallback).toHaveBeenCalledWith(fn, { timeout: IDLE_TIMEOUT_MS });
    expect(fn).toHaveBeenCalledOnce();
    expect(host.setTimeout).not.toHaveBeenCalled();
    cancel();
    expect(host.cancelIdleCallback).toHaveBeenCalledWith(3);
  });
  it("takes a custom deadline", () => {
    const host: IdleHost = { ...timers(), requestIdleCallback: vi.fn(() => 1) };
    whenIdle(() => {}, host, 500);
    expect(host.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 500 });
  });
  it("cancelling is safe without cancelIdleCallback", () => {
    const host: IdleHost = { ...timers(), requestIdleCallback: vi.fn(() => 1) };
    expect(() => whenIdle(() => {}, host)()).not.toThrow();
  });
  it("falls back to setTimeout where there is no requestIdleCallback (Safari), and cancels it", () => {
    const fn = vi.fn();
    const host = timers();
    const cancel = whenIdle(fn, host);
    expect(host.setTimeout).toHaveBeenCalledWith(fn, IDLE_FALLBACK_MS);
    cancel();
    expect(host.clearTimeout).toHaveBeenCalledWith(7);
  });
  it("defaults to the global scheduler", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const had = "requestIdleCallback" in globalThis;
    whenIdle(fn);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    if (!had) expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
