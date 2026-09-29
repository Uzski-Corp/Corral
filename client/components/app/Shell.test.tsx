import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { router } from "@/test/router";
import { SideNav, WorkspaceSwitcher } from "./Shell";

const acct = { name: "Amina Otieno", email: "amina@pwani.co.ke", role: "Admin", avatarUrl: null, workspace: "pwani fresh" };

describe("WorkspaceSwitcher", () => {
  it("keeps the sample workspaces without an account", async () => {
    render(<WorkspaceSwitcher defaultOpen />);
    const menu = screen.getByRole("menu", { name: "Workspaces" });
    expect(within(menu).getByText("Pwani Fresh pilot")).toBeInTheDocument();
    expect(within(menu).getByText("tomas@coldtrace.io")).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    expect(router.push).toHaveBeenCalledWith("/sign-in");
  });

  it("shows the real workspace only, with its initial", async () => {
    const onSignOut = vi.fn();
    render(<WorkspaceSwitcher defaultOpen account={acct} onSignOut={onSignOut} />);
    const menu = screen.getByRole("menu", { name: "Workspaces" });
    expect(within(menu).getByRole("menuitemcheckbox", { name: /pwani fresh/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).queryByText("ColdTrace")).toBeNull();
    expect(within(screen.getByRole("button", { name: "Switch workspace" })).getAllByText("P").length).toBeGreaterThan(0);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Invite teammates/ }));
    expect(router.push).toHaveBeenCalledWith("/onboarding?step=5");
  });

  it("shows skeletons while loading", () => {
    render(<WorkspaceSwitcher defaultOpen account="loading" />);
    const menu = screen.getByRole("menu", { name: "Workspaces" });
    expect(within(menu).queryByText("tomas@coldtrace.io")).toBeNull();
    expect(screen.getByRole("button", { name: "Switch workspace" }).querySelector(".c-skel, [class*=skel]")).not.toBeNull();
  });
});

describe("SideNav account", () => {
  it("renders the signed-in person without a sample avatar", async () => {
    render(<SideNav active="unibox" account={acct} />);
    const me = screen.getByRole("button", { name: "Account" });
    expect(within(me).getByText("Amina Otieno")).toBeInTheDocument();
    expect(me.querySelector("img")).toBeNull();
    await userEvent.click(me);
    expect(screen.getByText("Amina Otieno · Admin")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    expect(router.push).toHaveBeenCalledWith("/sign-in");
  });

  it("drops the account heading while loading", async () => {
    render(<SideNav active="unibox" account="loading" />);
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.queryByText(/· Owner/)).toBeNull();
  });
});
