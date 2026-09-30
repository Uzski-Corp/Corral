/**
 * Design-review states for Settings → Developers (M9, ENG-59): MCP connections, API keys and the docs.
 * Honoured where review states are (outside production and in the review build). Plain module so the
 * server page can read it. Same view as Integrations: /app?view=settings&state=
 *
 * MCP
 *   mcp               connected clients: Cursor, Claude, Claude Code, and n8n on a key; what each may do, last call
 *   mcp-empty         nothing connected yet: what connecting gives you, and the clients that work
 *   mcp-connect       Connect a client, Cursor picked: one-click install or the mcp.json to copy (OAuth, no key)
 *   mcp-connect-claude Claude picked: Settings → Connectors, the name and the URL
 *   mcp-connect-key   VS Code with an API key: VS Code asks for the key once and keeps it out of the file
 *   mcp-consent       the page a client opens in your browser: what it may do, per area; Allow or Deny
 *   mcp-waiting       copied; waiting for the client's first call
 *   mcp-connected     the first call arrived: which tools it sees
 *   mcp-activity      Cursor open: who, what it may do, and every call it made
 *   mcp-error         calls failing: Claude Code asked for send_reply without the scope; a Zapier key expired
 *   mcp-revoke        Disconnect Cursor? what stops, what stays
 *   mcp-loading       skeleton rows
 * API keys
 *   keys              every key: what it can reach, last used, when it expires; one expiring, one expired
 *   keys-empty        no keys yet: when you need one (and when MCP sign-in is better)
 *   key-create        Create key: name, scopes per area, expiry
 *   key-create-errors no name and no scopes: what to fix
 *   key-reveal        the secret, once: copy it now; Corral keeps a hash and the last four
 *   key-rotate        Rotate: a new secret; the old one works for 24 hours, or stops now
 *   key-rotated       the new secret, once; the old one's cut-off time
 *   key-revoke        Revoke a key that was used 12 minutes ago: what breaks
 *   key-expired       an expired key that something still calls: the refused calls; make a replacement
 *   keys-error        the page couldn’t load; no key changed
 *   keys-loading      skeleton rows (M10)
 *   keys-owner        (M10) Tomás, an owner: the Owner column, and every key's actions, whoever made it
 *   keys-member       (M10) Amara, a member: her key with every action; the others read-only, menus disabled, and why
 *   keys-member-key   (M10) Amara opens Tomás's n8n key: its details, no Revoke, and who can
 * Docs
 *   docs              the MCP and API docs: connect, the tools by area, guardrails, errors, limits
 *   docs-tool         one tool open (send_reply): arguments, the guardrail, the call and what comes back
 *   docs-search-empty a search with no tool: what Corral's MCP doesn't do
 */
export const MCP_REVIEW_STATES = [
  "mcp", "mcp-empty", "mcp-connect", "mcp-connect-claude", "mcp-connect-key", "mcp-consent", "mcp-waiting", "mcp-connected",
  "mcp-activity", "mcp-error", "mcp-revoke", "mcp-loading",
  "keys", "keys-empty", "key-create", "key-create-errors", "key-reveal", "key-rotate", "key-rotated", "key-revoke", "key-expired", "keys-error", "keys-loading", "keys-owner", "keys-member", "keys-member-key",
  "docs", "docs-tool", "docs-search-empty",
] as const;
export type McpReviewState = (typeof MCP_REVIEW_STATES)[number];
export type DevSection = "mcp" | "keys" | "docs";

export function mcpReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): McpReviewState | undefined {
  if (!reviewStates || view !== "settings") return undefined;
  return MCP_REVIEW_STATES.find((s) => s === state);
}
/** Which Developers page a state opens. */
export const sectionOf = (s: McpReviewState): DevSection => (s.startsWith("mcp") ? "mcp" : s.startsWith("doc") ? "docs" : "keys");
export const SECTION_TITLE: Record<DevSection, string> = { mcp: "MCP", keys: "API keys", docs: "Docs" };
