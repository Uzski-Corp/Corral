import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { Integrations, type LoadDetail } from "./Integrations";
import { DefaultsMapping } from "./Live";
import { DEFAULT_MAPPING, type IntegrationDetail } from "@/lib/integrations/live";
import type { Connection, IntegrationId } from "@/lib/integrations/integrations";

const ON: Record<IntegrationId, Connection> = { cal: "connected", phoenix: "connected", autosend: "connected" };
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const DETAIL: IntegrationDetail = { id: "cal", connectedAt: ago(19 * 24 * 60), connectedById: "u2", supportsTest: false, logs: [], mapping: null };
const SAMPLE = /Tomás|ColdTrace|coldtrace|1 booking caught up|bk_7Hq2Lw/;

type Props = Partial<Parameters<typeof Integrations>[0]>;
const show = (p: Props = {}) => render(<ToastProvider><Integrations live={ON} loadDetail={vi.fn<LoadDetail>().mockResolvedValue(DETAIL)} {...p} /></ToastProvider>);
const rowOf = (name: RegExp) => within(screen.getByRole("list", { name: "Integrations" })).getAllByRole("listitem").find((li) => name.test(li.textContent ?? ""))!;

describe("signed-in Integrations (M14, the real API)", () => {
  it("shows a skeleton until the list arrives", () => {
    show({ live: null });
    expect(screen.getByRole("status")).toHaveTextContent("Loading integrations");
  });

  it("lists the real last event, or No activity yet, and no sample problem lines", () => {
    show({ live: { ...ON, autosend: "reauth" }, last: { cal: { event: "BOOKING_CREATED", at: ago(18) }, phoenix: null } });
    expect(rowOf(/Cal\.com/)).toHaveTextContent(/Last: BOOKING_CREATED · 18 min/);
    expect(rowOf(/Phoenix/)).toHaveTextContent("No activity yet");
    expect(rowOf(/AutoSend/)).toHaveTextContent("No activity yet");
    expect(document.body.textContent).not.toMatch(SAMPLE);
    expect(document.body.textContent).not.toMatch(/expired at 06:40/);
  });

  it("opens a connected integration from its detail: skeleton, then only what the API knows", async () => {
    const user = userEvent.setup();
    let answer: (d: IntegrationDetail | null) => void = () => {};
    const loadDetail = vi.fn<LoadDetail>(() => new Promise((r) => { answer = r; }));
    show({ loadDetail, names: { u2: "Joseph Otieno" } });
    await user.click(screen.getByRole("button", { name: "Manage Cal.com" }));
    expect(loadDetail).toHaveBeenCalledWith("cal");
    expect(screen.getByRole("status")).toHaveTextContent("Loading Cal.com");
    answer(DETAIL);
    expect(await screen.findByText("Joseph Otieno")).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByText("Account")).toBeNull(); // the API reported no account
    expect(screen.queryByRole("button", { name: "Send a test" })).toBeNull(); // no integration can take one yet
    expect(document.body.textContent).not.toMatch(SAMPLE);
  });

  it("says when the detail fails and tries again", async () => {
    const user = userEvent.setup();
    const loadDetail = vi.fn<LoadDetail>().mockResolvedValueOnce(null).mockResolvedValue({ ...DETAIL, connectedById: undefined });
    show({ loadDetail });
    await user.click(screen.getByRole("button", { name: "Manage Cal.com" }));
    expect(await screen.findByText("Couldn’t load Cal.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Connected by")).toBeNull();
  });

  it("reconnects a broken sign-in through the API, and says when that fails", async () => {
    const user = userEvent.setup();
    const broken = { ...DETAIL, problem: { kind: "token-expired" as const, since: ago(130) } };
    const loadDetail = vi.fn<LoadDetail>().mockResolvedValue(broken);
    const onChange = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    show({ loadDetail, onChange, live: { ...ON, cal: "reauth" } });
    await user.click(screen.getByRole("button", { name: "Open Cal.com" }));
    expect(await screen.findByText(/Sign-in expired (2h ago|yesterday)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onChange).toHaveBeenCalledWith("cal", "connected");
    expect(await screen.findByText("Couldn’t reconnect Cal.com. Try again.")).toBeInTheDocument();
    loadDetail.mockResolvedValue(DETAIL);
    await user.click(await screen.findByRole("button", { name: "Reconnect" }));
    expect(await screen.findByText("Cal.com reconnected")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull());
  });

  it("disconnects from the page and connects without sample claims", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    show({ onChange });
    await user.click(screen.getByRole("button", { name: "Manage Cal.com" }));
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Disconnect Cal.com" }));
    expect(onChange).toHaveBeenCalledWith("cal", "off");
    await user.click(rowOf(/Cal\.com/).querySelector("button")!);
    await user.click(screen.getByRole("button", { name: /Continue to Cal\.com/ }));
    await user.click(screen.getByRole("button", { name: "I’m back" }));
    expect(onChange).toHaveBeenLastCalledWith("cal", "connected");
    expect(await screen.findByText("Cal.com connected")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(SAMPLE);
  });

  it("opens Phoenix's mapping on the defaults", async () => {
    const user = userEvent.setup();
    const onSaveMapping = vi.fn().mockResolvedValue(true);
    show({ loadDetail: vi.fn<LoadDetail>().mockResolvedValue({ ...DETAIL, id: "phoenix" }), onSaveMapping });
    await user.click(screen.getByRole("button", { name: "Manage Phoenix ERP" }));
    await user.click(await screen.findByRole("tab", { name: "Field mapping" }));
    expect(screen.getByText("Defaults")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save mapping" })).toBeDisabled();
  });
});

describe("DefaultsMapping saving", () => {
  it("saves the defaults as nothing stored, and says when a save fails", async () => {
    const user = userEvent.setup();
    const edited = DEFAULT_MAPPING.map((r) => (r.erp === "deal.source" ? { erp: r.erp } : r));
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(<ToastProvider><DefaultsMapping saved={edited} onSave={onSave} /></ToastProvider>);
    expect(screen.getByText("Edited")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.getByText("Defaults")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save mapping" }));
    expect(onSave).toHaveBeenCalledWith([]);
    expect(await screen.findByText("Couldn’t save the mapping. Try again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save mapping" }));
    expect(await screen.findByText("Mapping saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save mapping" })).toBeDisabled();
  });
});
