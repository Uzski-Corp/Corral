/**
 * Run `fn` when the main thread is next idle (ENG-87): requestIdleCallback with a deadline, or a short
 * setTimeout where there is none (Safari). Returns a cancel function for effect cleanup.
 *
 * The marketing hero uses it to mount its live app screen after hydration and first paint instead of in the
 * same burst of work, so the page is interactive sooner; the skeleton it replaces is the first frame either way.
 */
export type IdleHost = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
};

export const IDLE_TIMEOUT_MS = 2000;
export const IDLE_FALLBACK_MS = 200;

export function whenIdle(fn: () => void, host: IdleHost = globalThis as unknown as IdleHost, timeout = IDLE_TIMEOUT_MS): () => void {
  if (typeof host.requestIdleCallback === "function") {
    const id = host.requestIdleCallback(fn, { timeout });
    return () => host.cancelIdleCallback?.(id);
  }
  const id = host.setTimeout(fn, IDLE_FALLBACK_MS);
  return () => host.clearTimeout(id as never);
}
