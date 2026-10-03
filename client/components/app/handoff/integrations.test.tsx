import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../Toaster";
import { SettingsView } from "./Integrations";
import { settingsSeed } from "./data";
import { SETTINGS_REVIEW_STATES, type SettingsReviewState } from "@/lib/integrations/state";

const show = (state?: SettingsReviewState) => render(<ToastProvider><SettingsView state={state} /></ToastProvider>);
const rowOf = (name: RegExp) => within(screen.getByRole("list", { name: "Integrations" })).getAllByRole("listitem").find((li) => name.test(li.textContent ?? ""))!;

describe("settings seeds", () => {
  it("has a seed for every review state", () => {
    for (const s of SETTINGS_REVIEW_STATES) expect(settingsSeed(s)).toBeDefined();
    expect(settingsSeed().conn).toEqual({ cal: "connected", phoenix: "connected", autosend: "connected" });
  });
});

describe("Settings → Integrations", () => {
  it("lists the three with the handoff flow; other sections keep their place", async () => {
    show();
    expect(screen.getByRole("navigation", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Integrations" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("list", { name: "How a lead is handed on" })).toHaveTextContent(/Reply.*Meeting.*Deal.*Follow-up/);
    expect(within(screen.getByRole("list", { name: "Integrations" })).getAllByRole("button", { name: /^Manage/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();
  });

  it("with nothing connected, says what each is for and starts with Cal.com", () => {
    show("none");
    expect(screen.getByText("Nothing is connected yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(3);
  });

  it("connects Cal.com: permissions first, then waiting, then connected", async () => {
    show("connect-cal");
    const d = screen.getByRole("dialog", { name: "Connect Cal.com" });
    expect(within(d).getByText("Corral can")).toBeInTheDocument();
    expect(within(d).getByText("Corral never")).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: /Continue to Cal.com/ }));
    const w = screen.getByRole("dialog", { name: "Waiting for Cal.com" });
    await userEvent.click(within(w).getByRole("button", { name: "I’m back" }));
    expect(await screen.findByText("Cal.com connected")).toBeInTheDocument();
    expect(within(rowOf(/Cal\.com/)).getByRole("button", { name: "Manage Cal.com" })).toBeInTheDocument();
  });

  it("cancelling the wait leaves Cal.com off", async () => {
    show("connecting");
    await userEvent.click(within(screen.getByRole("dialog", { name: "Waiting for Cal.com" })).getByRole("button", { name: "Cancel" }));
    expect(within(rowOf(/Cal\.com/)).getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("connects Phoenix with a test deal, and blocks it when the test fails", async () => {
    const { unmount } = show("connect-erp-failed");
    let d = screen.getByRole("dialog", { name: "Connect Phoenix ERP" });
    expect(within(d).getByRole("status")).toHaveTextContent("401 invalid_signature");
    expect(within(d).getByRole("button", { name: "Connect Phoenix ERP" })).toBeDisabled();
    unmount();
    show("connect-erp");
    d = screen.getByRole("dialog", { name: "Connect Phoenix ERP" });
    await userEvent.click(within(d).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Signing secret copied")).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Connect Phoenix ERP" }));
    expect(await screen.findByText("Phoenix ERP connected")).toBeInTheDocument();
  });

  it("connects AutoSend with a sender that isn’t a cold mailbox", async () => {
    show("connect-autosend");
    const d = screen.getByRole("dialog", { name: "Connect AutoSend" });
    expect(within(d).getByRole("group", { name: "Journeys Corral starts" })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("checkbox", { name: /After your call/ }));
    await userEvent.click(within(d).getByRole("button", { name: "Connect AutoSend" }));
    expect(await screen.findByText("AutoSend connected")).toBeInTheDocument();
  });

  it("shows an expired sign-in with what’s waiting, and reconnects", async () => {
    show("reauth");
    expect(screen.getByRole("heading", { name: "Cal.com" })).toBeInTheDocument();
    expect(screen.getAllByText(/1 booking from 07:55 is waiting/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Reconnect Cal.com" }));
    expect(screen.getByRole("dialog", { name: "Waiting for Cal.com" })).toBeInTheDocument();
  });

  it("shows Phoenix failing, with the problems counted on Logs", async () => {
    show("error");
    expect(screen.getByText(/401 invalid_signature since 08:12/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update the secret" }));
    expect(screen.getByRole("dialog", { name: "Connect Phoenix ERP" })).toBeInTheDocument();
  });

  it("confirms a disconnect with what stops and what stays", async () => {
    show("disconnect");
    const d = screen.getByRole("dialog", { name: "Disconnect Phoenix ERP?" });
    expect(d).toHaveTextContent("Deals already in Phoenix stay exactly as they are.");
    await userEvent.click(within(d).getByRole("button", { name: "Disconnect Phoenix ERP" }));
    expect(await screen.findByText("Phoenix ERP disconnected")).toBeInTheDocument();
    expect(within(rowOf(/Phoenix ERP/)).getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("logs every push, filters to problems and replays with the same key", async () => {
    show("logs");
    const log = screen.getByRole("table", { name: "Phoenix ERP log" });
    expect(within(log).getByText(/same idempotency key means Phoenix can’t open it twice/)).toBeInTheDocument();
    await userEvent.click(within(log).getByRole("button", { name: "Replay" }));
    expect(await screen.findByText("Replaying deal.create")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Problems/ }));
    expect(within(screen.getByRole("table", { name: "Phoenix ERP log" })).getAllByRole("row")).toHaveLength(1 + 2 + 1);
    await userEvent.click(screen.getByRole("tab", { name: "From Phoenix ERP" }));
    expect(within(screen.getByRole("table", { name: "Phoenix ERP log" })).getAllByRole("row")).toHaveLength(2);
  });

  it("maps fields with a payload preview for Grace", () => {
    show("mapping");
    expect(screen.getByRole("table", { name: "Phoenix field mapping" })).toBeInTheDocument();
    expect(screen.getByLabelText("Payload preview")).toHaveTextContent('"account.name": "Nyota Beverages"');
    expect(screen.getByRole("button", { name: "Save mapping" })).toBeEnabled();
  });

  it("blocks saving a broken mapping and says which fields", async () => {
    show("mapping-errors");
    expect(screen.getByText(/^\d+ fields? needs? you before deals can go\.$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save mapping" })).toBeDisabled();
    expect(screen.getByText(/Phoenix would refuse this deal/)).toBeInTheDocument();
  });

  it("explains permissions and where the key lives", () => {
    show("scopes");
    expect(screen.getByRole("heading", { name: "Where the key lives" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Permissions" })).toHaveAttribute("aria-selected", "true");
  });

  it("explains AutoSend’s role: after the reply, never cold", async () => {
    show("autosend");
    expect(screen.getByRole("heading", { name: "Two engines, never mixed" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Integrations", current: false }));
    expect(screen.getByRole("list", { name: "Integrations" })).toBeInTheDocument();
  });

  it("loads with skeletons and recovers from a failed load", async () => {
    const { unmount } = show("loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading integrations");
    unmount();
    show("load-error");
    expect(screen.getByText("Couldn’t load integrations")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByRole("list", { name: "Integrations" })).toBeInTheDocument();
  });
});

describe("M14 · a connected integration from real data", () => {
  it("shows the account, since when and by whom, and Disconnect; no sample account", () => {
    show("int-connected");
    const acct = screen.getByLabelText("Connected account");
    expect(acct).toHaveTextContent("you@example.com");
    expect(acct).toHaveTextContent(/Connected by\s*You/);
    expect(within(acct).getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.queryByText(/tomas|coldtrace|Grace/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
  });

  it("no activity yet: the shared empty state, with Send a test where the integration takes one", async () => {
    const { unmount } = show("int-quiet");
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(screen.getByText("Test sent to AutoSend")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "AutoSend activity" })).toHaveTextContent("Delivered");
    unmount();
    show("int-quiet-cal");
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send a test" })).not.toBeInTheDocument();
  });

  it("field mapping with nothing saved: the defaults, tagged, editable, resettable", async () => {
    show("int-mapping");
    expect(screen.getByText("Defaults")).toBeInTheDocument();
    expect(screen.queryByText(/fit_score|corral_url|Grace/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save mapping" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Fill Source from/ }));
    await userEvent.click(screen.getByRole("option", { name: /Nothing/ }));
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save mapping" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /Reset to defaults/ }));
    expect(screen.getByText("Defaults")).toBeInTheDocument();
  });

  it("logs: time, event, status tag and a line per row; a skeleton while loading", () => {
    const { unmount } = show("int-logs");
    const rows = within(screen.getByRole("list", { name: "Phoenix ERP activity" })).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(/deal\.create.*Failed.*401 invalid_signature/);
    expect(rows[1]).toHaveTextContent("Retrying");
    unmount();
    show("int-logs-loading");
    expect(screen.getByText("Loading activity")).toBeInTheDocument();
  });

  it("token expired: Failed, one line, Reconnect, then Connecting and back to Connected", async () => {
    show("int-expired");
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Sign-in expired 2h ago\.$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(screen.getByText("Connecting")).toBeInTheDocument();
    expect(await screen.findByText("Cal.com reconnected", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
  });
});

describe("M14 · team in Krak's shapes", () => {
  it("has no row menu: role change and remove aren't offered", () => {
    show("team");
    const list = screen.getByRole("list", { name: "Members" });
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(list).toHaveTextContent("You");
    expect(list).toHaveTextContent("Invited");
  });
});
