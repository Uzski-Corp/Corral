import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API, LOGOUT_URL, ME_BODY, server, testConfig } from "@/test/msw";
import { router } from "@/test/router";
import { AppScreen, sessionErrorDetail, shellAccount } from "./AppScreen";
import { SessionProvider, type Navigator, type SessionValue } from "./SessionProvider";

const nav = () => ({ assign: vi.fn(), replace: vi.fn() }) satisfies Navigator;

function live(n = nav()) {
  render(<SessionProvider config={testConfig()} navigator={n}><AppScreen hotkeys /></SessionProvider>);
  return n;
}

const account = () => screen.getByRole("button", { name: "Account" });

describe("shellAccount", () => {
  const s = (over: Partial<SessionValue>) => ({ status: "loading", account: null, ...over }) as SessionValue;
  it("maps session states to what the shell renders", () => {
    expect(shellAccount(null)).toBeUndefined();
    expect(shellAccount(s({ status: "review" }))).toBeUndefined();
    expect(shellAccount(s({ status: "loading" }))).toBe("loading");
    expect(shellAccount(s({ status: "error" }))).toBe("unavailable");
    const a = { name: "A", email: "a@b.co", role: "Owner", avatarUrl: null, workspace: "W" };
    expect(shellAccount(s({ status: "authenticated", account: a }))).toBe(a);
  });
});

describe("sessionErrorDetail", () => {
  it("formats the failed request for the fallback", () => {
    expect(sessionErrorDetail(null)).toBeUndefined();
    expect(sessionErrorDetail({ kind: "unavailable", op: "GET /me", status: 503, message: "x" })).toBe("GET /me · 503");
    expect(sessionErrorDetail({ kind: "timeout", op: "GET /me", timeoutMs: 10000, message: "x" })).toBe("GET /me · timed out after 10s");
    expect(sessionErrorDetail({ kind: "network", op: "GET /me", message: "x" })).toBe("GET /me · network");
  });
});

describe("AppScreen", () => {
  it("shows skeletons, then the signed-in person and workspace from /me", async () => {
    live();
    expect(within(account()).queryByText("Tomás Ibarra")).toBeNull();
    await waitFor(() => expect(within(account()).getByText("Wanjiru Mwangi")).toBeInTheDocument());
    expect(within(account()).getByText("wanjiru@kilima.co.ke")).toBeInTheDocument();
    expect(account().querySelector("img")).toHaveAttribute("src", "https://img.test/w.jpg");
    const ws = screen.getByRole("button", { name: "Switch workspace" });
    expect(within(ws).getByText("Kilima Dairies")).toBeInTheDocument();
    expect(within(ws).getByText("K")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Kilima Dairies")).toBeInTheDocument();
  });

  it("signs out from the account menu", async () => {
    const user = userEvent.setup();
    const n = live();
    await waitFor(() => expect(within(account()).getByText("Wanjiru Mwangi")).toBeInTheDocument());
    await user.click(account());
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText("Wanjiru Mwangi · Owner")).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    await waitFor(() => expect(n.assign).toHaveBeenCalledWith(LOGOUT_URL));
  });

  it("signs out from the workspace switcher and from ⌘K", async () => {
    const user = userEvent.setup();
    const n = live();
    await waitFor(() => expect(within(account()).getByText("Wanjiru Mwangi")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Switch workspace" }));
    const menu = screen.getByRole("menu", { name: "Workspaces" });
    expect(within(menu).getByText("wanjiru@kilima.co.ke")).toBeInTheDocument();
    expect(within(menu).queryByText("Pwani Fresh pilot")).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    await waitFor(() => expect(n.assign).toHaveBeenCalledTimes(1));

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("sign out");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(n.assign).toHaveBeenCalledTimes(2));
  });

  it("shows an error toast when sign-out fails", async () => {
    server.use(http.post(`${API}/api/v1/auth/logout`, () => HttpResponse.error()));
    const user = userEvent.setup();
    const n = live();
    await waitFor(() => expect(within(account()).getByText("Wanjiru Mwangi")).toBeInTheDocument());
    await user.click(account());
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign-out didn’t go through. You’re still signed in.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(n.assign).not.toHaveBeenCalled();
  });

  it("replaces the body with the full-shell fallback when the API is down, and recovers on retry", async () => {
    let up = false;
    server.use(http.get(`${API}/api/v1/auth/me`, () => (up ? HttpResponse.json(ME_BODY) : HttpResponse.json({ detail: "down" }, { status: 503 }))));
    const user = userEvent.setup();
    live();
    expect(await screen.findByRole("heading", { name: "Corral can’t reach its servers" })).toBeInTheDocument();
    expect(screen.getByText("GET /api/v1/auth/me · 503")).toBeInTheDocument();
    expect(within(account()).getByText("Not connected")).toBeInTheDocument();
    up = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(account()).getByText("Wanjiru Mwangi")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Corral can’t reach its servers" })).toBeNull();
  });

  it("previews the design-review states", async () => {
    const { unmount } = render(<AppScreen preview="api-down" hotkeys={false} />);
    expect(screen.getByRole("heading", { name: "Corral can’t reach its servers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Status page" })).toHaveAttribute("href", "#status");
    unmount();
    render(<AppScreen preview="no-avatar" hotkeys={false} />);
    expect(account().querySelector(".c-mono-av")).toHaveTextContent("AO");
  });

  it("keeps Bau's sample shell without a session (styleguide)", async () => {
    const user = userEvent.setup();
    render(<AppScreen hotkeys={false} />);
    expect(within(account()).getByText("Tomás Ibarra")).toBeInTheDocument();
    await user.click(account());
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    expect(router.push).toHaveBeenCalledWith("/sign-in");
  });

  it("renders review mode exactly like the sample", () => {
    render(<SessionProvider config={testConfig({ mode: "review", apiUrl: "" })}><AppScreen /></SessionProvider>);
    expect(within(account()).getByText("tomas@coldtrace.io")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Switch workspace" })).getByText("ColdTrace")).toBeInTheDocument();
  });
});
