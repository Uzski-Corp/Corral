/* Settings → Developers (M9, ENG-59): the keys, the connected clients and their calls, and a seed per review state. */
import { accessOf, PRESETS, type AccessMap, type ExpiryId, type KeyEnv, type Viewer } from "@/lib/mcp/keys";
import type { Auth, ClientId } from "@/lib/mcp/tools";
import type { McpReviewState } from "@/lib/mcp/state";

/** When the review fixtures below were written (Wed 30 Sep 2026, 09:45 EAT). M13: never rendered as "now";
 *  `rebaseKey` moves a fixture's dates so they keep the same distance from the real clock (gap 4). */
export const FIXTURES_WRITTEN = new Date("2026-09-30T09:45:00+03:00");
/** @deprecated M13: measure against the real clock (`useNow()`), not a fixed sample date. Kept for old tests only. */
export const NOW = FIXTURES_WRITTEN;
const shiftIso = (iso: string | undefined, by: number) => (iso ? new Date(new Date(iso).getTime() + by).toISOString() : iso);
/** A review key with its created / expires / last-used dates moved to the real clock. Live keys come from the API as they are. */
export function rebaseKey(k: ApiKey, now: Date): ApiKey {
  const by = now.getTime() - FIXTURES_WRITTEN.getTime();
  return { ...k, created: shiftIso(k.created, by)!, expires: k.expires === null ? null : shiftIso(k.expires, by)!, lastUsed: shiftIso(k.lastUsed, by),
    revoked: k.revoked, oldUntil: shiftIso(k.oldUntil, by), refused: k.refused && { ...k.refused, last: shiftIso(k.refused.last, by)! } };
}

export type ApiKey = {
  id: string; name: string; env: KeyEnv; last4: string; scopes: string[]; by: string; created: string;
  expires: string | null; lastUsed?: string; lastFrom?: string; calls7d: number;
  revoked?: string; oldUntil?: string; refused?: { n: number; last: string; from: string };
};
export const KEYS: ApiKey[] = [
  { id: "key_n8n", name: "n8n lead sync", env: "live", last4: "7Qa2", scopes: ["leads:read", "leads:write", "segments:read", "segments:write"], by: "Tomás Ibarra", created: "2026-08-12T10:00:00+03:00",
    expires: "2026-11-10T10:00:00+03:00", lastUsed: "2026-09-30T09:33:00+03:00", lastFrom: "n8n Cloud · 34.90.12.7", calls7d: 1204 },
  { id: "key_metabase", name: "Metabase reporting", env: "live", last4: "k91Z", scopes: ["leads:read", "segments:read", "sequences:read", "unibox:read", "scoring:read"], by: "Amara Njoroge", created: "2026-07-06T10:00:00+03:00",
    expires: "2026-10-04T10:00:00+03:00", lastUsed: "2026-09-29T16:20:00+03:00", lastFrom: "Metabase · 18.157.4.20", calls7d: 96 },
  { id: "key_zapier", name: "Zapier (old)", env: "live", last4: "Hc3m", scopes: ["leads:read", "unibox:read"], by: "Tomás Ibarra", created: "2026-06-23T10:00:00+03:00",
    expires: "2026-09-21T10:00:00+03:00", lastUsed: "2026-09-21T09:58:00+03:00", lastFrom: "Zapier · 54.86.9.101", calls7d: 0,
    refused: { n: 12, last: "2026-09-30T08:02:00+03:00", from: "Zapier · 54.86.9.101" } },
  { id: "key_ci", name: "CI smoke tests", env: "test", last4: "p0Lx", scopes: ["leads:read", "knowledge:read"], by: "Tomás Ibarra", created: "2026-09-28T14:00:00+03:00", expires: null, calls7d: 0 },
];
/** The key made in `key-create` (shown in `key-reveal`). */
export const NEW_KEY: ApiKey = { id: "key_new", name: "HubSpot sync", env: "live", last4: "6uGa", scopes: ["leads:read", "leads:write", "segments:read", "sequences:read"], by: "Tomás Ibarra",
  created: "2026-09-30T09:45:00+03:00", expires: "2026-12-29T09:45:00+03:00", calls7d: 0 };
export const REVOKED_KEYS = [{ name: "Old Sheets export", last4: "b2Tw", revoked: "Sep 3", by: "Tomás Ibarra" }];

/** A secret as it appears once, on reveal. Made up; the shape is the real one. */
export const NEW_SECRET = "crl_live_4fKq9TzW2mRb7XcN1pLs8VdJ3hYe6uGa";
export const ROTATED_SECRET = "crl_live_9GvT3kLq7ZpX2wNc5RbM8sHd1yJf4uEa";

export type Health = "ok" | "scope" | "expired" | "limited";
export type Connection = {
  /** `device`: where it runs, when Corral knows (fixtures). M14: MCP has no clientInfo, so a new connection has none;
   *  it reads by its name and `firstCallAt`, the oldest call the server has for it (ISO). */
  id: string; client: ClientId | "n8n" | "zapier"; name: string; device?: string; firstCallAt?: string; who: string; auth: Auth; keyName?: string;
  preset: string; access: AccessMap; since: string; last: string; lastTool: string; calls7d: number; health: Health; problem?: string;
};
const R = PRESETS[0].access; const D = PRESETS[1].access;
export const CONNECTIONS: Connection[] = [
  { id: "cn_cursor", client: "cursor", name: "Cursor", device: "Tomás’s MacBook Pro", who: "Tomás Ibarra", auth: "oauth", preset: "Read and draft", access: D, since: "Sep 22", last: "4 min ago", lastTool: "get_thread", calls7d: 212, health: "ok" },
  { id: "cn_claude", client: "claude", name: "Claude", device: "claude.ai", who: "Amara Njoroge", auth: "oauth", preset: "Read only", access: R, since: "Sep 25", last: "Yesterday", lastTool: "search_knowledge", calls7d: 41, health: "ok" },
  { id: "cn_cc", client: "claude-code", name: "Claude Code", device: "tomas@coldtrace-dev", who: "Tomás Ibarra", auth: "oauth", preset: "Read and draft", access: D, since: "Sep 29", last: "08:58", lastTool: "send_reply", calls7d: 57, health: "ok" },
  { id: "cn_n8n", client: "n8n", name: "n8n", device: "n8n Cloud · 34.90.12.7", who: "Tomás Ibarra", auth: "key", keyName: "n8n lead sync", preset: "Custom", access: accessOf(KEYS[0].scopes), since: "Aug 12", last: "12 min ago", lastTool: "search_companies", calls7d: 1204, health: "ok" },
];
/** In `mcp-error`: what went wrong, per connection. */
export const PROBLEMS: Record<string, { health: Health; problem: string }> = {
  cn_cc: { health: "scope", problem: "Asked for send_reply 3 times since 08:58. This connection can draft but can’t send, so each call got 403 and nothing was sent." },
  cn_zapier: { health: "expired", problem: "Its key “Zapier (old)” expired Sep 21. 12 calls refused since, the last at 08:02 today." },
};
export const ZAPIER: Connection = { id: "cn_zapier", client: "zapier", name: "Zapier", device: "Zapier · 54.86.9.101", who: "Tomás Ibarra", auth: "key", keyName: "Zapier (old)", preset: "Custom",
  access: accessOf(KEYS[2].scopes), since: "Jun 23", last: "Sep 21", lastTool: "list_threads", calls7d: 0, health: "expired" };

export type Call = { at: string; tool: string; args: string; status: number; code?: string; ms: number; conn?: string };
export const CALLS: Call[] = [
  { at: "09:41:12", tool: "get_thread", args: "th_brian", status: 200, ms: 182 },
  { at: "09:41:09", tool: "search_knowledge", args: "“trial”", status: 200, ms: 240 },
  { at: "09:40:31", tool: "draft_reply", args: "th_brian · shorter, offer the pilot", status: 200, ms: 3120 },
  { at: "09:12:40", tool: "list_threads", args: "needs", status: 200, ms: 95 },
  { at: "09:12:02", tool: "search_companies", args: "dairy · KE · fit ≥ 80", status: 200, ms: 311 },
  { at: "08:30:18", tool: "search_companies", args: "fish · TZ", status: 429, code: "rate_limited", ms: 12 },
  { at: "08:29:51", tool: "explain_fit", args: "cmp_pwani", status: 200, ms: 402 },
];
export const CC_CALLS: Call[] = [
  { at: "09:02:44", tool: "send_reply", args: "dr_31c", status: 403, code: "insufficient_scope", ms: 9 },
  { at: "09:00:10", tool: "send_reply", args: "dr_31c", status: 403, code: "insufficient_scope", ms: 8 },
  { at: "08:58:37", tool: "send_reply", args: "dr_31c", status: 403, code: "insufficient_scope", ms: 11 },
  { at: "08:58:30", tool: "draft_reply", args: "th_brian", status: 200, ms: 2890 },
];
export const ZAPIER_CALLS: Call[] = [
  { at: "08:02:15", tool: "list_threads", args: "needs", status: 401, code: "invalid_token", ms: 6 },
  { at: "Yesterday 18:02", tool: "list_threads", args: "needs", status: 401, code: "invalid_token", ms: 5 },
  { at: "Yesterday 08:02", tool: "list_threads", args: "needs", status: 401, code: "invalid_token", ms: 7 },
];

/* ------------------------------------------------------------ seeds */
export type DevDialog = "connect" | "waiting" | "connected" | "revoke-conn" | "create" | "reveal" | "rotate" | "rotated" | "revoke-key";
/** Who's looking. Tomás owns ColdTrace's workspace; Amara is a member (keys-member). */
export const OWNER: Viewer = { name: "Tomás Ibarra", role: "owner" };
export const MEMBER: Viewer = { name: "Amara Njoroge", role: "member" };
/** M14 (Krak): what the server has for a new connection. MCP sends no clientInfo Corral keeps, so there's no host
 *  version: only the connection's name and its oldest call (ISO). Never a sample name. */
export type FirstCall = { name: string; oldestCallAt: string; tool?: string };
/** A review fixture time moved to the real clock, the way rebaseKey moves a key's dates. */
export const rebaseIso = (iso: string, now: Date) => new Date(new Date(iso).getTime() + now.getTime() - FIXTURES_WRITTEN.getTime()).toISOString();
/** Signed in, what the Waiting dialog's "Check again" asks: a connection the list didn't have, with its first call. */
export type FirstCallCheck = (known: string[]) => Promise<{ conn: Connection; first: FirstCall } | null>;
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
/** The connection's name plus its oldest call. The list's `firstCallAt` is the server's own time for it; the calls
 *  (newest first, the last 50) name the tool. No call yet means the host hasn't arrived. */
export function firstCallFrom(conn: { name: string; firstCallAt?: unknown }, calls: { at?: unknown; tool?: unknown }[]): FirstCall | null {
  const oldest = calls.at(-1);
  const at = isTime(conn.firstCallAt) ? conn.firstCallAt : isTime(oldest?.at) ? oldest.at : undefined;
  if (!at) return null;
  return { name: conn.name, oldestCallAt: at, ...(typeof oldest?.tool === "string" ? { tool: oldest.tool } : {}) };
}
export type DevSeed = {
  firstCall?: FirstCall;
  viewer?: Viewer;
  load?: "loading" | "error"; empty?: boolean; dialog?: DevDialog; client?: ClientId; auth?: Auth;
  open?: string; errors?: boolean; problems?: boolean; key?: string; consent?: boolean;
  docTool?: string; docQuery?: string; draft?: { name: string; access: AccessMap; expiry: ExpiryId };
};
export function devSeed(s?: McpReviewState): DevSeed {
  switch (s) {
    case undefined: case "mcp": case "keys": case "docs": return {};
    case "mcp-empty": case "keys-empty": return { empty: true };
    case "mcp-connect": return { dialog: "connect", client: "cursor", auth: "oauth" };
    case "mcp-connect-claude": return { dialog: "connect", client: "claude", auth: "oauth" };
    case "mcp-connect-key": return { dialog: "connect", client: "vscode", auth: "key" };
    case "mcp-consent": return { consent: true };
    case "mcp-waiting": return { dialog: "waiting", client: "cursor", auth: "oauth" };
    case "mcp-connected": return { dialog: "connected", client: "cursor", auth: "oauth", firstCall: { name: "Cursor", oldestCallAt: new Date(FIXTURES_WRITTEN.getTime() - 2 * 60_000).toISOString(), tool: "tools/list" } };
    case "mcp-activity": return { open: "cn_cursor" };
    case "mcp-error": return { problems: true };
    case "mcp-revoke": return { open: "cn_cursor", dialog: "revoke-conn" };
    case "mcp-loading": return { load: "loading" };
    case "key-create": return { dialog: "create", draft: { name: "HubSpot sync", access: { ...PRESETS[0].access, unibox: "none", knowledge: "none", scoring: "none", leads: "write" }, expiry: "90" } };
    case "key-create-errors": return { dialog: "create", errors: true, draft: { name: "", access: PRESETS[2].access, expiry: "never" } };
    case "key-reveal": return { dialog: "reveal", key: "key_new" };
    case "key-rotate": return { dialog: "rotate", key: "key_n8n" };
    case "key-rotated": return { dialog: "rotated", key: "key_n8n" };
    case "key-revoke": return { dialog: "revoke-key", key: "key_n8n" };
    case "key-expired": return { open: "key_zapier" };
    case "keys-error": return { load: "error" };
    case "keys-loading": return { load: "loading" };
    case "keys-member": return { viewer: MEMBER };
    case "keys-member-key": return { viewer: MEMBER, open: "key_n8n" };
    case "keys-owner": return { viewer: OWNER };
    case "docs-tool": return { docTool: "send_reply" };
    case "docs-search-empty": return { docQuery: "invoice" };
  }
}
