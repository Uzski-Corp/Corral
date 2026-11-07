import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { BillingView, TeamView, parseInvites, type Member, type TeamSession, type WorkspaceInvite } from ".";

const NOW = new Date("2026-10-03T12:00:00Z");
const ME: Member = { id: "u1", name: "Wanjiru Mwangi", email: "wanjiru@kilima.co.ke", role: "owner" };
const SESSION: TeamSession = { userId: "u1", email: "wanjiru@kilima.co.ke", avatarUrl: "https://img.test/w.jpg" };
const team = (members: Member[], invites: WorkspaceInvite[] = [], onInvite?: (e: string[], r: "owner" | "admin" | "member") => Promise<void>) =>
  render(<ToastProvider><TeamView members={members} invites={invites} session={SESSION} now={NOW} onInvite={onInvite} /></ToastProvider>);

describe("TeamView (the API's shapes)", () => {
  it("parses pasted invites", () => {
    expect(parseInvites("a@x.co, bad; A@x.co b@y.io", ["b@y.io"])).toEqual({ ok: ["a@x.co"], bad: ["bad"], dupes: ["b@y.io"] });
  });

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

  it("signed in: a failed save says so and keeps the dialog; there is no role or remove menu", async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn().mockRejectedValueOnce(new Error("no")).mockResolvedValue(undefined);
    team([ME, { id: "u2", name: "Joseph", email: "joseph@kilima.co.ke", role: "member" }], [{ email: "sales@kilima.co.ke", role: "member", invitedAt: "2026-10-01T12:00:00Z" }], onInvite);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Invited 2 days ago")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /options/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await user.type(within(screen.getByRole("dialog")).getByRole("textbox"), "amina@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Send invites" }));
    expect(await screen.findByText("Couldn’t save the invites. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Invite people" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send invites" }));
    expect(onInvite).toHaveBeenLastCalledWith(["amina@kilima.co.ke"], "member");
    expect(await screen.findByText("Invite sent to amina@kilima.co.ke")).toBeInTheDocument();
  });

  it("has a loading skeleton", () => {
    render(<ToastProvider><TeamView members={[]} invites={[]} now={NOW} load="loading" /></ToastProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the team");
  });
});

describe("BillingView", () => {
  it("shows the confirmed monthly prices and writes to hello@corral.so", () => {
    render(<BillingView />);
    expect(screen.getByText("No plan yet")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getByText("$149")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Talk to us|Write to us/ })[0]).toHaveAttribute("href", expect.stringContaining("mailto:hello@corral.so"));
  });
  it("has a loading skeleton", () => {
    render(<BillingView load="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading billing");
  });
});
