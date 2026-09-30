import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../Toaster";
import { SettingsView } from "../handoff/Integrations";
import { MCP_REVIEW_STATES, sectionOf, type McpReviewState } from "@/lib/mcp/state";
import { MCP_URL, toolsFor } from "@/lib/mcp/tools";
import { PRESETS, scopesOf } from "@/lib/mcp/keys";
import { CONNECTIONS, KEYS, devSeed } from "./data";
import { McpConsent } from ".";

const show = (developer?: McpReviewState) => render(<ToastProvider><SettingsView developer={developer} /></ToastProvider>);
const dialog = () => screen.getByRole("dialog");
const nav = () => screen.getByRole("navigation", { name: "Settings" });
const nRead = toolsFor(scopesOf(PRESETS[0].access)).length;
const nDraft = toolsFor(scopesOf(PRESETS[1].access)).length;

describe("developer seeds", () => {
  it("every state has a seed, and every state renders its page", () => {
    for (const s of MCP_REVIEW_STATES) {
      expect(devSeed(s)).toBeTypeOf("object");
      const r = show(s);
      if (s !== "mcp-consent") expect(within(nav()).getByRole("button", { name: { mcp: "MCP", keys: "API keys", docs: "Docs" }[sectionOf(s)] })).toHaveAttribute("aria-current", "page");
      r.unmount();
    }
    expect(devSeed(undefined)).toEqual({});
  });
});

describe("Settings → Developers nav", () => {
  it("sits under its own heading and opens each page; Integrations stays the default", async () => {
    show();
    expect(screen.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    const dev = screen.getByRole("list", { name: "Developers" });
    await userEvent.click(within(dev).getByRole("button", { name: "API keys" }));
    expect(screen.getByRole("heading", { name: "API keys" })).toBeInTheDocument();
    await userEvent.click(within(dev).getByRole("button", { name: "MCP" }));
    expect(screen.getByText(MCP_URL)).toBeInTheDocument();
    await userEvent.click(within(dev).getByRole("button", { name: "Docs" }));
    expect(screen.getByRole("heading", { name: /Corral, from the tools/ })).toBeInTheDocument();
  });
});

describe("API keys", () => {
  it("lists each key masked, with what it reaches, last use and expiry; warns on expiring and expired", () => {
    show("keys");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(KEYS.length);
    expect(within(rows[0]).getByText("crl_live_…7Qa2")).toBeInTheDocument();
    expect(within(rows[0]).getByText("12 min ago")).toBeInTheDocument();
    expect(within(rows[1]).getByText("in 4 days")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Expired")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Never used")).toBeInTheDocument();
    expect(screen.getByText(/Zapier \(old\) expired Sep 21 and is still being called/)).toBeInTheDocument();
    expect(screen.getByText(/Metabase reporting expires in 4 days/)).toBeInTheDocument();
    expect(screen.getByText(/never the key/)).toBeInTheDocument();
  });

  it("creates a key: says what's missing, then shows the secret once, then lists it", async () => {
    show("key-create-errors");
    expect(within(dialog()).getByText(/Two things before this key can exist/)).toBeInTheDocument();
    expect(within(dialog()).getByText(/Pick at least one area/)).toBeInTheDocument();
    await userEvent.type(within(dialog()).getByRole("textbox", { name: "Name" }), "HubSpot sync");
    await userEvent.click(within(dialog()).getByRole("radio", { name: /Read only/ }));
    expect(within(dialog()).queryByText(/Pick at least one area/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Create key" }));
    expect(within(dialog()).getByText("HubSpot sync is ready")).toBeInTheDocument();
    expect(within(dialog()).getByText(/^crl_live_4fKq/)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Copy the key" }));
    expect(screen.getByText("Copied the key")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Done, I’ve stored it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HubSpot sync" })).toBeInTheDocument();
    expect(screen.queryByText(/^crl_live_4fKq/)).not.toBeInTheDocument();
  });

  it("won't take a name that's taken; per-area access switches to custom", async () => {
    show("key-create");
    const d = dialog();
    await userEvent.clear(within(d).getByRole("textbox", { name: "Name" }));
    await userEvent.type(within(d).getByRole("textbox", { name: "Name" }), "n8n lead sync");
    await userEvent.click(within(d).getByRole("button", { name: "Create key" }));
    expect(within(d).getByText(/already exists/)).toBeInTheDocument();
    await userEvent.click(within(within(d).getByRole("radiogroup", { name: "Unibox" })).getByRole("radio", { name: "Send" }));
    expect(within(d).getByText(/Send replies, through the same 10-second undo/)).toBeInTheDocument();
    await userEvent.click(within(within(d).getByRole("radiogroup", { name: "Environment" })).getByRole("radio", { name: "Test" }));
    expect(within(d).getByText(/sends nothing/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rotates with a 24-hour overlap, then shows the new secret and the cut-off", async () => {
    show("key-rotate");
    expect(within(dialog()).getByText(/Keeps working for 24 hours/)).toBeInTheDocument();
    expect(within(dialog()).getByText(/1,204 calls this week/)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Rotate key" }));
    expect(within(dialog()).getByText("New secret for n8n lead sync")).toBeInTheDocument();
    expect(within(dialog()).getByText(/works until 09:45 tomorrow/)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Done, I’ve stored it" }));
    expect(screen.getByText(/Old secret until 09:45 tomorrow/)).toBeInTheDocument();
  });

  it("rotating with Stops now leaves no overlap", async () => {
    show("key-rotate");
    await userEvent.click(within(dialog()).getByRole("radio", { name: /Stops now/ }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Rotate key" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Done, I’ve stored it" }));
    expect(screen.queryByText(/Old secret until/)).not.toBeInTheDocument();
    expect(screen.getByText("crl_live_…4uEa")).toBeInTheDocument();
  });

  it("revoking says it's in use and what breaks; it leaves the list", async () => {
    show("key-revoke");
    expect(within(dialog()).getByText(/In use: last call 12 min ago from n8n Cloud/)).toBeInTheDocument();
    expect(within(dialog()).getByText("401 invalid_token")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Revoke key" }));
    expect(screen.getByText("Revoked n8n lead sync")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "n8n lead sync" })).not.toBeInTheDocument();
  });

  it("row menu: details, rotate, revoke; an expired key offers delete", async () => {
    show("keys");
    await userEvent.click(screen.getByRole("button", { name: "n8n lead sync: more" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Rotate/ }));
    expect(within(dialog()).getByText("Rotate n8n lead sync?")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapier (old): more" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(within(dialog()).getByText("Delete Zapier (old)?")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete key" }));
    expect(screen.queryByRole("button", { name: "Zapier (old)" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Metabase reporting: more" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Details/ }));
    expect(screen.getByRole("heading", { name: "Metabase reporting" })).toBeInTheDocument();
    expect(screen.getByText("No calls in the last 7 days.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(within(dialog()).getByText("Revoke Metabase reporting?")).toBeInTheDocument();
  });

  it("an expired key shows the refused calls; a replacement keeps name and scopes, new secret", async () => {
    show("key-expired");
    expect(screen.getByText(/12 calls refused since it expired/)).toBeInTheDocument();
    expect(screen.getAllByText("401 invalid_token")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Make a replacement" }));
    expect(within(dialog()).getByText("Zapier is ready")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Done, I’ve stored it" }));
    expect(screen.getByRole("button", { name: "Zapier" })).toBeInTheDocument();
  });

  it("the banners open the refused calls and the rotate", async () => {
    show("keys");
    await userEvent.click(screen.getByRole("button", { name: "Rotate now" }));
    expect(within(dialog()).getByText("Rotate Metabase reporting?")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "See the calls" }));
    expect(screen.getByRole("heading", { name: "Zapier (old)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "API keys", current: false }));
    expect(screen.getByRole("button", { name: "n8n lead sync" })).toBeInTheDocument();
  });

  it("empty says when to make a key and when MCP is better; error keeps the keys working", async () => {
    const a = show("keys-empty");
    expect(screen.getByText("No API keys yet")).toBeInTheDocument();
    expect(screen.getByText(/No key to leak/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(within(dialog()).getByText("Create API key")).toBeInTheDocument();
    a.unmount();
    show("keys-error");
    expect(screen.getByText(/calls with them still work/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "n8n lead sync" })).toBeInTheDocument();
  });
});

describe("MCP connections", () => {
  it("lists each client, who, how it signed in, what it may do and its last call", () => {
    show("mcp");
    const list = screen.getByRole("list", { name: "Connected clients" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(CONNECTIONS.length);
    expect(within(list).getAllByText(/Tomás Ibarra · signed in · Read and draft/)).toHaveLength(2);
    expect(within(list).getByText("n8n lead sync")).toBeInTheDocument();
    expect(within(list).getAllByText("Working")).toHaveLength(4);
  });

  it("connects Cursor: config, waiting for the first call, connected, then listed", async () => {
    show("mcp");
    await userEvent.click(screen.getByRole("button", { name: "Connect a client" }));
    const d = dialog();
    expect(within(d).getByRole("radio", { name: "Cursor" })).toHaveAttribute("aria-checked", "true");
    expect(within(d).getByRole("link", { name: /Add to Cursor/ })).toHaveAttribute("href", expect.stringMatching(/^cursor:\/\//));
    expect(within(d).getByLabelText("Config").textContent).toContain('"url": "https://mcp.corral.app/mcp"');
    await userEvent.click(within(d).getByRole("button", { name: "Copy the config" }));
    await userEvent.click(within(d).getByRole("button", { name: "I’ve added it" }));
    expect(within(dialog()).getByText("Waiting for Cursor")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Back to the config" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "I’ve added it" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Check again" }));
    expect(within(dialog()).getByText(`Cursor sees ${nRead} tools.`)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
    expect(screen.getByText("Cursor connected")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Connected clients" })).getAllByRole("listitem")).toHaveLength(CONNECTIONS.length + 1);
  });

  it("each client gets its own config; an API key goes in a header or a VS Code prompt", async () => {
    show("mcp-connect");
    const d = dialog();
    await userEvent.click(within(d).getByRole("radio", { name: "Claude Code" }));
    expect(within(d).getByLabelText("Command").textContent).toBe(`claude mcp add --transport http corral ${MCP_URL}`);
    await userEvent.click(within(d).getByRole("radio", { name: "API key" }));
    expect(within(d).getByLabelText("Command").textContent).toContain("--header");
    await userEvent.click(within(d).getByRole("radio", { name: "VS Code" }));
    expect(within(d).getByLabelText("Config").textContent).toContain("${input:corral-key}");
    expect(within(d).getByText(/secret storage, not the file/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("radio", { name: "Other clients" }));
    expect(within(d).getByText(/clients without OAuth/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("radio", { name: "Claude" }));
    await userEvent.click(within(d).getByRole("radio", { name: "Corral account" }));
    expect(within(d).getByText(/Settings → Connectors → Add custom connector/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("empty: the client picker opens Connect on that client", async () => {
    show("mcp-empty");
    expect(screen.getByText("Nothing connected yet")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("list", { name: "Clients" })).getByRole("button", { name: /VS Code/ }));
    expect(within(dialog()).getByRole("radio", { name: "VS Code" })).toHaveAttribute("aria-checked", "true");
  });

  it("errors: a missing scope and an expired key, each saying what happened", async () => {
    show("mcp-error");
    expect(screen.getByText("2 connections are failing.")).toBeInTheDocument();
    expect(screen.getByText(/Asked for send_reply 3 times/)).toBeInTheDocument();
    expect(screen.getByText(/Its key “Zapier \(old\)” expired Sep 21/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Replace the key" })).toHaveAttribute("href", "/app?view=settings&state=key-expired");
    await userEvent.click(screen.getByRole("button", { name: "See the calls" }));
    expect(screen.getByText(/can draft but not send/)).toBeInTheDocument();
    expect(screen.getAllByText("403 insufficient_scope")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Allow sending" })).toHaveAttribute("href", "/app?view=settings&state=mcp-consent");
  });

  it("activity, what it may do, and disconnect", async () => {
    show("mcp-activity");
    expect(screen.getByText("429 rate_limited")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "What it may do" }));
    expect(screen.getByText(/can never widen its own access/)).toBeInTheDocument();
    expect(screen.getByText(/of 15 tools/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(within(dialog()).getByText(/Drafts it saved stay/)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Disconnect" }));
    expect(screen.getByText(/Disconnected Cursor on Tomás’s MacBook Pro/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cursor" })).not.toBeInTheDocument();
  });

  it("revoke state opens on the dialog; cancel keeps it", async () => {
    show("mcp-revoke");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Cursor" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "MCP", current: false }));
    expect(screen.getByRole("list", { name: "Connected clients" })).toBeInTheDocument();
  });

  it("loading says so", () => {
    show("mcp-loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading connections");
  });
});

describe("the consent page", () => {
  it("asks per area, warns on send, and allows or denies", async () => {
    const a = render(<ToastProvider><McpConsent /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Claude Code wants to use Corral" })).toBeInTheDocument();
    expect(screen.getByText(`${nDraft} tools · until you disconnect it`)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Unibox" })).getByRole("radio", { name: "Send" }));
    expect(screen.getByText("It can send replies as you.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Choose per area/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: /Read only/ }));
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(screen.getByText("Claude Code is connected")).toBeInTheDocument();
    a.unmount();
    render(<ToastProvider><McpConsent /></ToastProvider>);
    await userEvent.click(screen.getByRole("radio", { name: /Choose per area/ }));
    expect(screen.getByRole("button", { name: "Allow" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.getByText("Claude Code wasn’t connected")).toBeInTheDocument();
  });
  it("renders in place of Settings for its state", () => {
    show("mcp-consent");
    expect(screen.queryByRole("navigation", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });
});

describe("the docs", () => {
  it("connect per client, tools by area, open one with its call and result", async () => {
    show("docs");
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(screen.getByLabelText("Command").textContent).toContain("claude mcp add");
    const open = screen.getByRole("button", { name: /search_companies/ });
    expect(open).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("tab", { name: "curl" }));
    expect(screen.getByLabelText("curl with a key").textContent).toContain("Authorization: Bearer $CORRAL_API_KEY");
    await userEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: /score_company/ }));
    expect(screen.getByText("Costs 1 credit.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /list_segments/ }));
    expect(screen.getByText("No arguments.")).toBeInTheDocument();
  });
  it("docs-tool opens send_reply with its guardrail", () => {
    show("docs-tool");
    expect(screen.getByRole("button", { name: /send_reply/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText(/Refused with 409/).length).toBeGreaterThan(0);
  });
  it("search narrows the tools; nothing found says what MCP doesn't do", async () => {
    show("docs-search-empty");
    expect(screen.getByText("No tool for “invoice”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all 15" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search tools" }), "draft");
    expect(screen.getByRole("button", { name: /draft_reply/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /search_companies/ })).not.toBeInTheDocument();
  });
});
