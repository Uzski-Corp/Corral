/**
 * The Corral MCP server (M9, ENG-59 → ENG-75): its tools, what each needs, and how each client connects.
 * Plain module: no React. The docs page, the connect dialog and the build read the same list.
 */
import { hasScope, type Area, type Scope } from "./keys";

export const MCP_URL = "https://mcp.corral.app/mcp";
export const API_URL = "https://api.corral.app/v1";
export const SERVER_NAME = "corral";

export type ToolKind = "read" | "write" | "send";
export type Arg = { name: string; type: string; required?: boolean; note: string };
export type Tool = {
  name: string; area: Area; kind: ToolKind; scope: Scope; does: string;
  args: Arg[]; example: { ask: string; args: Record<string, unknown>; result: unknown };
  /** A guardrail the tool keeps, whoever calls it. */ guard?: string; credits?: number;
};

export const TOOLS: Tool[] = [
  { name: "search_companies", area: "leads", kind: "read", scope: "leads:read", does: "Find companies in your workspace by fit, country, industry or stage.",
    args: [{ name: "query", type: "string", note: "Words to match in the name, domain or notes" }, { name: "fit_min", type: "number", note: "0–100" }, { name: "country", type: "string", note: "ISO code, e.g. KE" }, { name: "limit", type: "number", note: "Up to 50; default 20" }],
    example: { ask: "Which dairies in Kenya fit above 80?", args: { query: "dairy", country: "KE", fit_min: 80, limit: 5 },
      result: { companies: [{ id: "cmp_kilima", name: "Kilima Dairies", fit: 88, stage: "Customer" }, { id: "cmp_nyota", name: "Nyota Foods", fit: 84, stage: "Meeting" }], next: null } } },
  { name: "get_company", area: "leads", kind: "read", scope: "leads:read", does: "One company: its contacts, fit and the checks behind it, and where it is in a sequence.",
    args: [{ name: "id", type: "string", required: true, note: "cmp_… or a domain" }],
    example: { ask: "What do we know about pwanifresh.com?", args: { id: "pwanifresh.com" },
      result: { id: "cmp_pwani", name: "Pwani Fresh", fit: 91, contacts: [{ name: "Brian Kamau", title: "COO", email: "brian@pwanifresh.com" }], sequence: { name: "Cold-room pilot", step: 2, state: "Stopped: replied" } } } },
  { name: "update_lead_status", area: "leads", kind: "write", scope: "leads:write", does: "Move a contact to a new status, with a note on why.",
    args: [{ name: "contact_id", type: "string", required: true, note: "ct_…" }, { name: "status", type: "enum", required: true, note: "Interested · Not now · Not a fit · Customer" }, { name: "note", type: "string", note: "Shown on the lead" }],
    example: { ask: "Mark Brian as Interested.", args: { contact_id: "ct_brian", status: "Interested", note: "Asked for Kilima’s numbers" }, result: { ok: true, status: "Interested" } } },
  { name: "list_segments", area: "segments", kind: "read", scope: "segments:read", does: "Your saved segments with how many companies each holds.",
    args: [],
    example: { ask: "What segments do I have?", args: {}, result: { segments: [{ id: "seg_fb_ea", name: "F&B · East Africa", count: 13 }, { id: "seg_logi", name: "Logistics · Fit > 70", count: 12 }] } } },
  { name: "create_segment", area: "segments", kind: "write", scope: "segments:write", does: "Save a segment from filters. It updates as companies change.",
    args: [{ name: "name", type: "string", required: true, note: "Shown in the sidebar" }, { name: "filters", type: "object", required: true, note: "Same filters as search_companies" }],
    example: { ask: "Save Kenyan dairies over 80 as a segment.", args: { name: "Dairies · KE · 80+", filters: { query: "dairy", country: "KE", fit_min: 80 } }, result: { id: "seg_8f2", name: "Dairies · KE · 80+", count: 4 } } },
  { name: "list_sequences", area: "sequences", kind: "read", scope: "sequences:read", does: "Sequences with their steps, who is in them and how they’re doing.",
    args: [{ name: "status", type: "enum", note: "live · paused · draft" }],
    example: { ask: "How is Cold-room pilot doing?", args: { status: "live" }, result: { sequences: [{ id: "seq_pilot", name: "Cold-room pilot", enrolled: 148, replied: 19, booked: 6 }] } } },
  { name: "enroll_in_sequence", area: "sequences", kind: "write", scope: "sequences:write", does: "Add contacts to a sequence.",
    guard: "Step 1 waits for the sequence’s launch checks (mailboxes, Never say, the daily cap) like any other enrollment. Nothing sends from this call.",
    args: [{ name: "sequence_id", type: "string", required: true, note: "seq_…" }, { name: "contact_ids", type: "string[]", required: true, note: "Up to 100" }],
    example: { ask: "Put the Nakuru contacts in Cold-room pilot.", args: { sequence_id: "seq_pilot", contact_ids: ["ct_wanjiru", "ct_otieno"] }, result: { enrolled: 2, first_send: "Thu 1 Oct, 08:10 EAT", skipped: [] } } },
  { name: "list_threads", area: "unibox", kind: "read", scope: "unibox:read", does: "Unibox threads by tab and triage, newest first.",
    args: [{ name: "tab", type: "enum", note: "needs · meetings · snoozed · all" }, { name: "triage", type: "enum[]", note: "interested · objection · referral · …" }],
    example: { ask: "What needs me this morning?", args: { tab: "needs" }, result: { threads: [{ id: "th_brian", from: "Brian Kamau", triage: "objection", at: "09:42" }, { id: "th_wanjiru", from: "Wanjiru Mwangi", triage: "interested", at: "09:10" }] } } },
  { name: "get_thread", area: "unibox", kind: "read", scope: "unibox:read", does: "A thread’s messages, the lead behind it and Corral’s draft if there is one.",
    args: [{ name: "id", type: "string", required: true, note: "th_…" }],
    example: { ask: "Read me Brian’s thread.", args: { id: "th_brian" }, result: { id: "th_brian", messages: 3, last: { from: "Brian Kamau", at: "09:42", text: "We already have loggers…" }, draft: { status: "ready", cites: 3 } } } },
  { name: "draft_reply", area: "unibox", kind: "write", scope: "unibox:write", does: "Have Corral draft a reply, cited from your knowledge base and checked against Never say. It waits in the Unibox.",
    args: [{ name: "thread_id", type: "string", required: true, note: "th_…" }, { name: "guidance", type: "string", note: "e.g. “shorter, offer the pilot”" }],
    example: { ask: "Draft Brian a shorter reply that offers the pilot.", args: { thread_id: "th_brian", guidance: "shorter, offer the pilot" }, result: { draft_id: "dr_31c", cites: 2, left_out: ["No price: the knowledge base has $35 and $39"] } } },
  { name: "send_reply", area: "unibox", kind: "send", scope: "unibox:send", does: "Send a saved draft from the thread’s mailbox.",
    guard: "Signed-in MCP connections only: an API key gets 403 key_cannot_send. Goes through the same 10-second undo and Never-say checks as the Send button. Refused with 409 if someone wrote in the thread since the draft.",
    args: [{ name: "draft_id", type: "string", required: true, note: "dr_… from draft_reply" }],
    example: { ask: "Send it.", args: { draft_id: "dr_31c" }, result: { status: "undo", from: "tomas@coldtrace.io", undo_until: "09:44:10 EAT", sent: false } } },
  { name: "search_knowledge", area: "knowledge", kind: "read", scope: "knowledge:read", does: "Search the knowledge base and Never say; each hit names its source line.",
    args: [{ name: "query", type: "string", required: true, note: "A question or words" }],
    example: { ask: "What’s our trial offer?", args: { query: "trial" }, result: { hits: [{ section: "Pricing and terms", text: "Free 30-day pilot on up to three rooms; the sensors stay if you sign.", source: "Pricing 2026.pdf · p.1" }] } } },
  { name: "add_knowledge_source", area: "knowledge", kind: "write", scope: "knowledge:write", does: "Add a URL or text as a source.",
    guard: "New sources wait in Review; Corral doesn’t cite them until you approve them.",
    args: [{ name: "url", type: "string", note: "A page to read" }, { name: "text", type: "string", note: "Or paste text" }, { name: "title", type: "string", required: true, note: "How it’s cited" }],
    example: { ask: "Add our new install guide.", args: { title: "Install guide v2", url: "https://coldtrace.io/install" }, result: { id: "src_44", status: "in review" } } },
  { name: "explain_fit", area: "scoring", kind: "read", scope: "scoring:read", does: "Why a company scored what it did: each check, its points and the evidence.",
    args: [{ name: "company_id", type: "string", required: true, note: "cmp_…" }],
    example: { ask: "Why is Pwani a 91?", args: { company_id: "cmp_pwani" }, result: { fit: 91, confidence: "high", checks: [{ finding: "Four cold rooms, fish and dairy", points: 24 }, { finding: "Lost a container in March", points: 18 }] } } },
  { name: "score_company", area: "scoring", kind: "write", scope: "scoring:write", credits: 1, does: "Score a company you haven’t scored yet, from its site and public records.",
    args: [{ name: "domain", type: "string", required: true, note: "e.g. mwanzafish.co.tz" }],
    example: { ask: "Score mwanzafish.co.tz.", args: { domain: "mwanzafish.co.tz" }, result: { fit: 72, confidence: "medium", credits_left: 1848 } } },
];

export const AREA_TITLE: Record<Area, string> = { leads: "Companies and contacts", segments: "Segments", sequences: "Sequences", unibox: "Unibox", knowledge: "Knowledge base", scoring: "Scoring" };
export const tool = (name: string) => TOOLS.find((t) => t.name === name);
/** Tools in area order, grouped. */
export function byArea(list: Tool[] = TOOLS): { area: Area; tools: Tool[] }[] {
  const areas = [...new Set(TOOLS.map((t) => t.area))];
  return areas.map((area) => ({ area, tools: list.filter((t) => t.area === area) })).filter((g) => g.tools.length);
}
/** Search by name, area or what it does. */
export function searchTools(q: string, list: Tool[] = TOOLS): Tool[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((t) => t.name.includes(s.replace(/\s+/g, "_")) || t.does.toLowerCase().includes(s) || AREA_TITLE[t.area].toLowerCase().includes(s));
}
/** The tools a client with these scopes sees. MCP lists only these; the others don't exist for it. */
export const toolsFor = (scopes: readonly string[]) => TOOLS.filter((t) => hasScope(scopes, t.scope));

/** The JSON-RPC body an MCP client sends for a tool (tools/call). */
export function callBody(t: Tool, id = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: t.name, arguments: t.example.args } }, null, 2);
}
/** The same call over plain HTTP, with an API key. */
/** Whether a key can call this tool at all (send is for signed-in connections only). */
export const keyMayCall = (t: Tool) => t.kind !== "send";
export function curlFor(t: Tool, key = "$CORRAL_API_KEY"): string {
  return [`curl ${MCP_URL} \\`, `  -H "Authorization: Bearer ${key}" \\`, `  -H "Content-Type: application/json" \\`, `  -H "Accept: application/json, text/event-stream" \\`,
    `  -d '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: t.name, arguments: t.example.args } })}'`].join("\n");
}

/* ------------------------------------------------------------ errors */
export type McpError = { status: number; code: string; means: string; fix: string };
export const ERRORS: McpError[] = [
  { status: 401, code: "invalid_token", means: "The key or sign-in is wrong, expired or revoked.", fix: "Sign in again from the client, or use a key that’s Active." },
  { status: 403, code: "insufficient_scope", means: "The tool needs a scope this connection wasn’t given.", fix: "Reconnect and allow it, or give the key that area." },
  { status: 403, code: "key_cannot_send", means: "An API key called send_reply. Keys draft; only a person’s signed-in connection sends.", fix: "Save the draft with the key, and send it from the Unibox or a signed-in client." },
  { status: 409, code: "thread_changed", means: "Someone wrote in the thread after the draft was made.", fix: "Read the thread again and redraft; nothing was sent." },
  { status: 422, code: "never_say", means: "The reply says something on your Never-say list.", fix: "Change the text; the error names the rule." },
  { status: 429, code: "rate_limited", means: "Over the limit for this key or connection.", fix: "Wait for Retry-After seconds. Reads and writes count separately." },
];
export const errorFor = (code: string) => ERRORS.find((e) => e.code === code);

/* ------------------------------------------------------------ clients */
export type ClientId = "cursor" | "claude-code" | "claude" | "vscode" | "other";
export type Auth = "oauth" | "key";
export type ClientDef = { id: ClientId; name: string; mark: string; where: string; lang: "json" | "shell" | "steps"; oauth: boolean };
export const CLIENTS: ClientDef[] = [
  { id: "cursor", name: "Cursor", mark: "Cu", where: "~/.cursor/mcp.json", lang: "json", oauth: true },
  { id: "claude-code", name: "Claude Code", mark: "CC", where: "Terminal", lang: "shell", oauth: true },
  { id: "claude", name: "Claude", mark: "Cl", where: "Settings → Connectors", lang: "steps", oauth: true },
  { id: "vscode", name: "VS Code", mark: "VS", where: ".vscode/mcp.json", lang: "json", oauth: true },
  { id: "other", name: "Other clients", mark: "{}", where: "Any MCP client over HTTP", lang: "json", oauth: false },
];
export const client = (id: ClientId) => CLIENTS.find((c) => c.id === id)!;

/** The text you copy for a client. OAuth needs only the URL; a key goes in a header (VS Code prompts for it). */
export function configFor(id: ClientId, auth: Auth, key = "YOUR_CORRAL_API_KEY"): string {
  const header = { Authorization: `Bearer ${key}` };
  switch (id) {
    case "cursor": return JSON.stringify({ mcpServers: { [SERVER_NAME]: auth === "oauth" ? { url: MCP_URL } : { url: MCP_URL, headers: header } } }, null, 2);
    case "claude-code": return auth === "oauth"
      ? `claude mcp add --transport http ${SERVER_NAME} ${MCP_URL}`
      : `claude mcp add --transport http ${SERVER_NAME} ${MCP_URL} \\\n  --header "Authorization: Bearer ${key}"`;
    case "claude": return `Name: Corral\nRemote MCP server URL: ${MCP_URL}`;
    case "vscode": return auth === "oauth"
      ? JSON.stringify({ servers: { [SERVER_NAME]: { type: "http", url: MCP_URL } } }, null, 2)
      : JSON.stringify({ inputs: [{ type: "promptString", id: "corral-key", description: "Corral API key", password: true }],
          servers: { [SERVER_NAME]: { type: "http", url: MCP_URL, headers: { Authorization: "Bearer ${input:corral-key}" } } } }, null, 2);
    case "other": return JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: "http", url: MCP_URL, headers: header } } }, null, 2);
  }
}
/** Steps around the snippet, in order. */
export function stepsFor(id: ClientId, auth: Auth): string[] {
  const signIn = "The first call opens Corral in your browser. Pick what it may do, then Allow.";
  switch (id) {
    case "cursor": return ["Open ~/.cursor/mcp.json (Cursor Settings → MCP → Add new global MCP server).", "Paste this in, or merge it with the servers you have.", auth === "oauth" ? signIn : "Save. Cursor connects with the key; no browser step."];
    case "claude-code": return ["Run this in a terminal, not inside a claude session.", auth === "oauth" ? "Start claude and run /mcp, choose corral, then Authenticate. " + signIn : "Check it with claude mcp list."];
    case "claude": return ["In Claude, open Settings → Connectors → Add custom connector.", "Paste the name and the URL, then Add.", "Press Connect. " + signIn];
    case "vscode": return ["Create .vscode/mcp.json in your project, or run MCP: Open User Configuration.", auth === "oauth" ? "Paste this in and press Start above the server. " + signIn : "Paste this in and press Start. VS Code asks for the key once and keeps it in its secret storage, not the file."];
    case "other": return ["Point any MCP client that speaks Streamable HTTP at the URL.", "Clients without OAuth send an API key as a Bearer header. Make a key with only the areas it needs."];
  }
}
/** Cursor's one-click install link (cursor://…/mcp/install). */
export function cursorDeeplink(): string {
  const cfg = btoa(JSON.stringify({ url: MCP_URL }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(cfg)}`;
}
