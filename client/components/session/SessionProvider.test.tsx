import { act, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API, LOGOUT_URL, ME_BODY, server, testConfig, unauthorized } from "@/test/msw";
import { router } from "@/test/router";
import { authApiFor } from "@/lib/api";
import { forgetVisitor, readVisitor } from "@/lib/marketing/visitor";
import { SessionProvider, toAccount, useSession, type Navigator, type SessionValue } from "./SessionProvider";

const ME = `${API}/api/v1/auth/me`;
const REFRESH = `${API}/api/v1/auth/refresh`;
const LOGOUT = `${API}/api/v1/auth/logout`;

// The probe is updated in a layout effect, which runs in the same commit as the DOM update.
// (A passive useEffect runs later, so a waitFor that matched the new text could still read the
// previous value here: that was the 1-in-4 flake in "confirms the session with /me".)
const probe: { current: SessionValue | null } = { current: null };
function Probe() {
  const s = useSession();
  useLayoutEffect(() => { probe.current = s; });
  return <div data-testid="status">{s?.status}:{s?.account?.name ?? "-"}:{s?.error?.kind ?? "-"}</div>;
}
const nav = () => ({ assign: vi.fn<(url: string) => void>(), replace: vi.fn<(url: string) => void>() }) satisfies Navigator;
const status = () => screen.getByTestId("status").textContent;

function mount(over: { config?: ReturnType<typeof testConfig>; navigator?: Navigator; refreshEveryMs?: number } = {}) {
  const n = over.navigator ?? nav();
  const utils = render(<SessionProvider config={over.config ?? testConfig()} navigator={n} refreshEveryMs={over.refreshEveryMs}><Probe /></SessionProvider>);
  return { ...utils, nav: n as ReturnType<typeof nav> };
}

const setVisibility = (v: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => { forgetVisitor(); vi.useRealTimers(); setVisibility("visible"); probe.current = null; window.history.replaceState(null, "", "/"); });

describe("useSession outside a provider", () => {
  it("is null, so the styleguide keeps its sample shell", () => {
    render(<Probe />);
    expect(status()).toBe(":-:-");
  });
});

describe("SessionProvider in review mode", () => {
  it("makes no requests and signs out to /sign-in", async () => {
    const hit = vi.fn();
    server.use(http.get(ME, () => { hit(); return HttpResponse.json(ME_BODY); }));
    mount({ config: testConfig({ mode: "review", apiUrl: "" }) });
    expect(status()).toBe("review:-:-");
    await act(async () => { expect(await probe.current!.signOut()).toEqual({ ok: true, value: undefined }); });
    expect(router.push).toHaveBeenCalledWith("/sign-in");
    await act(async () => { expect((await probe.current!.refresh()).ok).toBe(true); });
    expect(hit).not.toHaveBeenCalled();
  });
});

describe("SessionProvider in live mode", () => {
  it("confirms the session with /me", async () => {
    mount();
    expect(status()).toBe("loading:-:-");
    await waitFor(() => expect(status()).toBe("authenticated:Wanjiru Mwangi:-"));
    expect(probe.current!.me?.organization.slug).toBe("kilima");
  });

  it("sends a stale session to sign-in with the current path, once", async () => {
    window.history.replaceState(null, "", "/app/companies");
    server.use(http.get(ME, unauthorized), http.post(REFRESH, unauthorized));
    const { nav: n } = mount();
    await waitFor(() => expect(n.replace).toHaveBeenCalledWith("/sign-in?next=%2Fapp%2Fcompanies"));
    await act(async () => { await probe.current!.refresh(); });
    expect(n.replace).toHaveBeenCalledTimes(1);
  });

  it("keeps the shell up when the API is down, then recovers on refresh", async () => {
    let up = false;
    server.use(http.get(ME, () => (up ? HttpResponse.json(ME_BODY) : HttpResponse.json({ detail: "Authentication provider unavailable" }, { status: 503 }))));
    mount();
    await waitFor(() => expect(status()).toBe("error:-:unavailable"));
    up = true;
    await act(async () => { expect((await probe.current!.refresh()).ok).toBe(true); });
    expect(status()).toBe("authenticated:Wanjiru Mwangi:-");
  });

  it("keeps an authenticated session when a later call fails", async () => {
    mount();
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    server.use(http.post(REFRESH, () => HttpResponse.error()));
    await act(async () => { expect(await probe.current!.refresh()).toMatchObject({ ok: false, error: { kind: "network" } }); });
    expect(status()).toBe("authenticated:Wanjiru Mwangi:network");
  });

  it("ignores the /me response after unmount", async () => {
    let release: () => void = () => {};
    server.use(http.get(ME, () => new Promise((r) => { release = () => r(HttpResponse.json(ME_BODY)); })));
    const { unmount } = mount();
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(probe.current!.status).toBe("loading");
  });

  it("refreshes on an interval while visible, and when a long-hidden tab returns", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const refreshed = vi.fn();
    server.use(http.post(REFRESH, () => { refreshed(); return HttpResponse.json({ refreshed: true }); }));
    mount({ refreshEveryMs: 1_000 });
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));

    setVisibility("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(refreshed).toHaveBeenCalledTimes(1);
    await act(async () => { setVisibility("visible"); });
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(2));
    // Coming back again right away does not refresh twice.
    await act(async () => { setVisibility("visible"); });
    expect(refreshed).toHaveBeenCalledTimes(2);
  });

  it("signs out through the API and follows the WorkOS logout URL", async () => {
    const { nav: n } = mount();
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    await act(async () => { expect((await probe.current!.signOut()).ok).toBe(true); });
    expect(n.assign).toHaveBeenCalledWith(LOGOUT_URL);
  });

  it("reports a failed sign-out and stays put", async () => {
    server.use(http.post(LOGOUT, () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    const { nav: n } = mount();
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    await act(async () => { expect(await probe.current!.signOut()).toMatchObject({ ok: false, error: { kind: "http", status: 500 } }); });
    expect(n.assign).not.toHaveBeenCalled();
  });

  it("defaults to window.location for navigation and to process config", async () => {
    const replace = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...orig, pathname: "/app", search: "", replace, assign: vi.fn() } });
    try {
      server.use(http.get(ME, unauthorized));
      render(<SessionProvider config={testConfig()}><Probe /></SessionProvider>);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fapp"));
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: orig });
    }
  });

  it("uses an injected API", async () => {
    const api = authApiFor(testConfig());
    render(<SessionProvider config={testConfig()} api={api} navigator={nav()}><Probe /></SessionProvider>);
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
  });

  it("reads the process config when none is passed", () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    return import("@/lib/config").then(({ resetConfigCache }) => {
      resetConfigCache();
      render(<SessionProvider><Probe /></SessionProvider>);
      expect(status()).toBe("review:-:-");
      vi.unstubAllEnvs();
      resetConfigCache();
    });
  });
});

describe("SessionProvider and the marketing visitor hint (M10c)", () => {
  const visitor = () => readVisitor(document.cookie);

  it("remembers the person when /me succeeds and forgets them on sign-out", async () => {
    const { nav: n } = mount();
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    expect(visitor()).toEqual({ name: "Wanjiru Mwangi", avatarUrl: "https://img.test/w.jpg" });
    await act(async () => { expect((await probe.current!.signOut()).ok).toBe(true); });
    expect(visitor()).toBeNull();
    expect(n.assign).toHaveBeenCalledWith(LOGOUT_URL);
  });

  it("keeps the hint when sign-out fails for another reason, and drops it when the session is already gone", async () => {
    server.use(http.post(LOGOUT, () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    mount();
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    await act(async () => { await probe.current!.signOut(); });
    expect(visitor()).not.toBeNull();
    server.use(http.post(LOGOUT, unauthorized));
    await act(async () => { expect(await probe.current!.signOut()).toMatchObject({ ok: false, error: { kind: "unauthorized" } }); });
    expect(visitor()).toBeNull();
  });

  it("forgets the person on a 401 from /me", async () => {
    document.cookie = "corral_visitor=" + encodeURIComponent(JSON.stringify({ name: "Old Name", avatarUrl: null })) + "; path=/";
    expect(visitor()).not.toBeNull();
    server.use(http.get(ME, unauthorized));
    const { nav: n } = mount();
    await waitFor(() => expect(n.replace).toHaveBeenCalled());
    expect(visitor()).toBeNull();
  });

  it("forgets the person on a 401 from /refresh", async () => {
    mount();
    await waitFor(() => expect(status()).toMatch(/^authenticated/));
    expect(visitor()).not.toBeNull();
    server.use(http.post(REFRESH, unauthorized));
    await act(async () => { await probe.current!.refresh(); });
    expect(visitor()).toBeNull();
  });

  it("never writes the hint in review mode", async () => {
    mount({ config: testConfig({ mode: "review", apiUrl: "" }) });
    await act(async () => { await probe.current!.signOut(); });
    expect(visitor()).toBeNull();
  });
});

describe("toAccount", () => {
  it("shapes /me for the shell", async () => {
    const r = await authApiFor(testConfig()).me();
    expect(r.ok && toAccount(r.value)).toEqual({ name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "Owner", avatarUrl: "https://img.test/w.jpg", workspace: "Kilima Dairies", logoUrl: null });
  });
});
