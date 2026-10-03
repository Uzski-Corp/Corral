import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { McpConnections } from "./Connections";
import { firstCallFrom, type Connection } from "./data";

// A live connection as the API lists it: no device (MCP sends no clientInfo Corral keeps), its oldest call's time.
const CONN: Connection = { id: "cn_1", client: "cursor", name: "Cursor", firstCallAt: "2026-10-03T12:00:00Z", who: "Wanjiru Mwangi", auth: "oauth", preset: "Read only",
  access: {} as Connection["access"], since: "Today", last: "Just now", lastTool: "tools/list", calls7d: 1, health: "ok" };

describe("firstCallFrom (the real API has no clientInfo)", () => {
  it("is the connection's name plus its oldest call", () => {
    const calls = [{ at: "09:41:12", tool: "get_thread" }, { at: "09:40:00", tool: "tools/list" }];
    expect(firstCallFrom(CONN, calls)).toEqual({ name: "Cursor", oldestCallAt: "2026-10-03T12:00:00Z", tool: "tools/list" });
    // Without the server's time, a call's own ISO time will do; a clock time alone won't.
    expect(firstCallFrom({ name: "Claude" }, [{ at: "2026-10-03T12:01:00Z" }])).toEqual({ name: "Claude", oldestCallAt: "2026-10-03T12:01:00Z" });
    expect(firstCallFrom({ name: "Claude" }, calls)).toBeNull();
    expect(firstCallFrom({ name: "Claude", firstCallAt: null }, [])).toBeNull();
  });
});

describe("signed-in connect flow", () => {
  it("waits until Check again finds a host, then adds it by name and first call", async () => {
    const user = userEvent.setup();
    const check = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ conn: CONN, first: { name: "Cursor", oldestCallAt: new Date().toISOString(), tool: "tools/list" } });
    render(<ToastProvider><McpConnections seed={{}} live={[]} check={check} /></ToastProvider>);
    expect(screen.getByText("No hosts connected")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Connect a client" })[0]);
    await user.click(screen.getByRole("button", { name: "I’ve added it" }));
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(check).toHaveBeenCalledWith([]);
    expect(screen.getByRole("dialog", { name: "Waiting for a host" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    const dialog = await screen.findByRole("dialog", { name: "Cursor is connected" });
    expect(dialog.textContent).toMatch(/first call Today, \d\d:\d\d/i);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("Cursor connected")).toBeInTheDocument();
    expect(screen.getByText(/First call/)).toBeInTheDocument();
    expect(screen.queryByText(/Tomás|ColdTrace| on Cursor/)).toBeNull();
  });
});
