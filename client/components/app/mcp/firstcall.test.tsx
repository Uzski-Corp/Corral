import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { McpConnections } from "./Connections";
import { firstCallFrom, type Connection } from "./data";

const CONN: Connection = { id: "cn_1", client: "cursor", name: "Cursor", device: "Cursor", who: "Wanjiru Mwangi", auth: "oauth", preset: "Read only",
  access: {} as Connection["access"], since: "Today", last: "Just now", lastTool: "tools/list", calls7d: 1, health: "ok" };

describe("firstCallFrom (the real API has no clientInfo)", () => {
  it("names the host after the connection and takes the oldest call", () => {
    expect(firstCallFrom(CONN, [{ at: "2026-10-03T12:01:00Z", tool: "get_thread" }, { at: "2026-10-03T12:00:00Z", tool: "tools/list" }]))
      .toEqual({ host: "Cursor", tool: "tools/list", atIso: "2026-10-03T12:00:00Z" });
    expect(firstCallFrom({ name: "Claude", lastTool: "search_knowledge" }, [])).toEqual({ host: "Claude", tool: "search_knowledge", atIso: "" });
    expect(firstCallFrom({ name: "Claude" }, [{ at: 1, tool: 2 }])).toBeNull();
  });
});

describe("signed-in connect flow", () => {
  it("waits until Check again finds a host, then adds it", async () => {
    const user = userEvent.setup();
    const check = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ conn: CONN, first: { host: "Cursor", tool: "tools/list", atIso: "" } });
    render(<ToastProvider><McpConnections seed={{}} live={[]} check={check} /></ToastProvider>);
    expect(screen.getByText("No hosts connected")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Connect a client" })[0]);
    await user.click(screen.getByRole("button", { name: "I’ve added it" }));
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(check).toHaveBeenCalledWith([]);
    expect(screen.getByRole("dialog", { name: "Waiting for a host" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("dialog", { name: "Cursor is connected" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("Cursor connected")).toBeInTheDocument();
    expect(screen.queryByText(/Tomás|ColdTrace/)).toBeNull();
  });
});
