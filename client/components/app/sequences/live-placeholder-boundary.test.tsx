import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toaster";
import { SequencesView } from "./Sequences";

/** Live data must never fall through into the sequence transport simulation. */
describe("live sequence placeholder boundary", () => {
  it("shows the unavailable state without fabricated audiences or sending controls", () => {
    render(<ToastProvider><SequencesView tab="sequences" onTabChange={vi.fn()} pool={[]} onPoolChange={vi.fn()}
      catalog={{ phase: "ready", list: [] }} /></ToastProvider>);
    expect(screen.getByText("Sequence sending is not available yet")).toBeInTheDocument();
    for (const label of ["Cold-room pilot", "Dairy proof drip", "Tomás Ibarra", "Launch"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("does not show demo mailbox identities when a live pool is empty", () => {
    render(<ToastProvider><SequencesView tab="pool" onTabChange={vi.fn()} pool={[]} onPoolChange={vi.fn()}
      catalog={{ phase: "ready", list: [] }} /></ToastProvider>);
    expect(screen.getByText("Mailbox connections are not available yet")).toBeInTheDocument();
    expect(screen.queryByText(/tomas@coldtrace/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Reconnect/ })).toBeNull();
  });
});
