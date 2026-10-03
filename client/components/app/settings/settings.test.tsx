import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { BillingView, PRICE_PLACEHOLDER, TeamView, parseInvites, soleOwner, teamFromApi, type TeamApi, type TeamMember } from ".";

const NOW = new Date("2026-10-03T12:00:00Z");
const ME: TeamMember = { id: "u1", name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "owner", status: "active", you: true };
const team = (members: TeamMember[], live?: TeamApi) => render(<ToastProvider><TeamView members={members} now={NOW} live={live} /></ToastProvider>);

describe("teamFromApi (the real members API)", () => {
  it("marks you, drops a name that is only the email, and adds pending invites", () => {
    const rows = teamFromApi(
      [{ id: "u1", name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "owner" }, { id: "u2", name: "joseph@kilima.co.ke", email: "joseph@kilima.co.ke", role: "viewer" }],
      [{ email: "JOSEPH@kilima.co.ke", role: "member" }, { email: "amina@kilima.co.ke", role: "admin" }],
      { id: "u1", avatarUrl: "https://img.test/w.jpg" },
    );
    expect(rows).toEqual([
      { id: "u1", name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "owner", status: "active", you: true, avatarUrl: "https://img.test/w.jpg" },
      { id: "u2", name: null, email: "joseph@kilima.co.ke", role: "member", status: "active" },
      { id: "invite:amina@kilima.co.ke", name: null, email: "amina@kilima.co.ke", role: "admin", status: "invited" },
    ]);
    expect(teamFromApi([{ id: "u1", name: "", email: "a@x.co", role: "admin" }], [], { id: "u1" })[0]).toMatchObject({ name: null, avatarUrl: null, role: "admin" });
  });

  it("parses pasted invites and knows the sole owner", () => {
    expect(parseInvites("a@x.co, bad; A@x.co b@y.io", ["b@y.io"])).toEqual({ ok: ["a@x.co"], bad: ["bad"], dupes: ["b@y.io"] });
    expect(soleOwner([ME], ME)).toBe(true);
  });
});

describe("TeamView", () => {
  it("shows the alone state and invites people locally in review", async () => {
    const user = userEvent.setup();
    team([ME]);
    expect(screen.getByText("Just you so far")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = screen.getByRole("dialog", { name: "Invite people" });
    await user.click(within(dialog).getByRole("button", { name: "Send invites" }));
    expect(within(dialog).getByText("Add at least one email.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox"), "amina@kilima.co.ke");
    await user.click(within(dialog).getByRole("button", { name: "Send invites" }));
    expect(await screen.findByText("Invite sent to amina@kilima.co.ke")).toBeInTheDocument();
    expect(screen.getAllByText("Invited").length).toBeGreaterThan(0);
  });

  it("signed in, saves invites, cancels them, and keeps role and removal off", async () => {
    const user = userEvent.setup();
    const live = { invite: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true), cancel: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) };
    team([ME, { id: "u2", name: "Joseph", email: "joseph@kilima.co.ke", role: "member", status: "active" }], live);
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await user.type(within(screen.getByRole("dialog")).getByRole("textbox"), "amina@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Send invites" }));
    expect(await screen.findByText("Couldn’t save the invites. Try again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send invites" }));
    expect(live.invite).toHaveBeenLastCalledWith(["amina@kilima.co.ke"], "member");
    expect(await screen.findByText("Invite sent to amina@kilima.co.ke")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Joseph options" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Admin" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeDisabled();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "amina@kilima.co.ke options" }));
    await user.click(screen.getByRole("menuitem", { name: "Cancel invite" }));
    expect(await screen.findByText("Couldn’t cancel the invite to amina@kilima.co.ke")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "amina@kilima.co.ke options" }));
    await user.click(screen.getByRole("menuitem", { name: "Cancel invite" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "amina@kilima.co.ke options" })).toBeNull());
  });

  it("has a loading skeleton", () => {
    render(<ToastProvider><TeamView members={[]} now={NOW} load="loading" /></ToastProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the team");
  });
});

describe("BillingView", () => {
  it("never shows a made-up price and writes to hello@corral.so", () => {
    render(<BillingView />);
    expect(screen.getByText("No plan yet")).toBeInTheDocument();
    expect(screen.getAllByText(PRICE_PLACEHOLDER).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Talk to us|Write to us/ })[0]).toHaveAttribute("href", expect.stringContaining("mailto:hello@corral.so"));
  });
  it("has a loading skeleton", () => {
    render(<BillingView load="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading billing");
  });
});
