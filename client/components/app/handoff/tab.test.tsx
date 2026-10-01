import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../Toaster";
import { SettingsView, settingsTabLabel, settingsTabOf } from "./Integrations";

/** /app?view=settings&tab=… (Bau's follow-up to M10c): a production deep link to one Settings page. */
describe("Settings tab param", () => {
  it("accepts a page with its own place and ignores the rest", () => {
    expect(settingsTabOf("mcp")).toBe("mcp");
    expect(settingsTabOf("keys")).toBe("keys");
    expect(settingsTabOf("mailboxes")).toBeUndefined(); // a link out to Sequences, not a Settings page
    expect(settingsTabOf("nope")).toBeUndefined();
    expect(settingsTabOf(undefined)).toBeUndefined();
    expect(settingsTabLabel("keys")).toBe("API keys");
  });

  it("opens Developers → MCP from tab=mcp, and Integrations otherwise", () => {
    const { unmount } = render(<ToastProvider><SettingsView tab="mcp" /></ToastProvider>);
    expect(screen.getByRole("button", { name: "MCP" })).toHaveAttribute("aria-current", "page");
    unmount();
    render(<ToastProvider><SettingsView tab="nope" /></ToastProvider>);
    expect(screen.getByRole("button", { name: "Integrations" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the profile from tab=profile", () => {
    render(<ToastProvider><SettingsView tab="profile" /></ToastProvider>);
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeInTheDocument();
    expect(screen.getByText("tomas@coldtrace.io")).toBeInTheDocument();
  });

  it("opens the workspace form from tab=workspace", () => {
    render(<ToastProvider><SettingsView tab="workspace" /></ToastProvider>);
    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Workspace name")).toHaveValue("ColdTrace");
    expect(screen.queryByText(/Designed in a later milestone/)).toBeNull();
  });
});
