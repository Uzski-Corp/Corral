import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API, LOGOUT_URL, server, testConfig } from "@/test/msw";
import { router } from "@/test/router";
import { AppScreen, shellAccount } from "./AppScreen";
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
    expect(shellAccount(s({ status: "error" }))).toBe("loading");
    const a = { name: "A", email: "a@b.co", role: "Owner", avatarUrl: null, workspace: "W" };
    expect(shellAccount(s({ status: "authenticated", account: a }))).toBe(a);
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t sign out. Check your connection and try again.");
    expect(n.assign).not.toHaveBeenCalled();
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
