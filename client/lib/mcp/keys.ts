/**
 * API keys and scopes (M9, ENG-59 → ENG-77). One set of scopes for API keys and for MCP clients signed in
 * with OAuth. Plain module: no React. The design data, the review states and the build share it.
 */

/** The areas an MCP client or a key can reach (ENG-75), in the order the pages list them. */
export type Area = "leads" | "segments" | "sequences" | "unibox" | "knowledge" | "scoring";
/** How far into an area: nothing, read, write (change things, draft), send (Unibox only: email a person). */
export type Access = "none" | "read" | "write" | "send";

export const AREAS: { id: Area; label: string; read: string; write: string; send?: string }[] = [
  { id: "leads", label: "Companies and contacts", read: "Search and read companies, contacts and fit", write: "Add, tag and change a lead’s status" },
  { id: "segments", label: "Segments", read: "List segments and who is in them", write: "Create and change segments" },
  { id: "sequences", label: "Sequences", read: "Read sequences, steps and results", write: "Enroll and pause people; step 1 still waits for launch checks" },
  { id: "unibox", label: "Unibox", read: "Read threads and their triage", write: "Triage and save drafts; nothing leaves your mailboxes", send: "Send replies, through the same 10-second undo and Never-say checks" },
  { id: "knowledge", label: "Knowledge base", read: "Search the knowledge base and Never say", write: "Add sources; they wait for your review before Corral uses them" },
  { id: "scoring", label: "Scoring", read: "Read scores and why", write: "Score a company (1 credit each)" },
];

export type Scope = `${Area}:read` | `${Area}:write` | "unibox:send";
export type AccessMap = Record<Area, Access>;

const RANK: Record<Access, number> = { none: 0, read: 1, write: 2, send: 3 };
/** The scopes an access map grants. Write implies read; send implies write. Only the Unibox has send. */
export function scopesOf(a: Partial<AccessMap>): Scope[] {
  const out: Scope[] = [];
  for (const { id } of AREAS) {
    const r = RANK[a[id] ?? "none"];
    if (r >= 1) out.push(`${id}:read`);
    if (r >= 2) out.push(`${id}:write`);
    if (r >= 3 && id === "unibox") out.push("unibox:send");
  }
  return out;
}
/** The access map a list of scopes gives, highest level per area. */
export function accessOf(scopes: readonly string[]): AccessMap {
  const m = Object.fromEntries(AREAS.map((x) => [x.id, "none"])) as AccessMap;
  for (const s of scopes) {
    const [area, lvl] = s.split(":") as [Area, Access];
    if (!(area in m) || !(lvl in RANK)) continue;
    if (lvl === "send" && area !== "unibox") continue;
    if (RANK[lvl] > RANK[m[area]]) m[area] = lvl;
  }
  return m;
}
export const hasScope = (scopes: readonly string[], need: Scope) => scopesOf(accessOf(scopes)).includes(need);

/** Starting points in Create key and in the OAuth consent. Read only is the default; send is never preset. */
export const PRESETS: { id: "read" | "draft" | "custom"; label: string; hint: string; access: AccessMap }[] = [
  { id: "read", label: "Read only", hint: "Look things up. Changes nothing.", access: { leads: "read", segments: "read", sequences: "read", unibox: "read", knowledge: "read", scoring: "read" } },
  { id: "draft", label: "Read and draft", hint: "Also triage, save drafts, build segments. Sends nothing.", access: { leads: "write", segments: "write", sequences: "read", unibox: "write", knowledge: "read", scoring: "read" } },
  { id: "custom", label: "Choose per area", hint: "Set each area yourself.", access: { leads: "none", segments: "none", sequences: "none", unibox: "none", knowledge: "none", scoring: "none" } },
];

/* ------------------------------------------------------------ the key itself */
export type KeyEnv = "live" | "test";
export const KEY_PREFIX: Record<KeyEnv, string> = { live: "crl_live_", test: "crl_test_" };
const KEY_RE = /^crl_(live|test)_[A-Za-z0-9]{32}$/;
export const isKeyShaped = (s: string) => KEY_RE.test(s.trim());
/** What Corral shows after the reveal: the prefix and the last four. The rest is never stored. */
export const redact = (secret: string) => (isKeyShaped(secret) ? `${secret.slice(0, secret.lastIndexOf("_") + 1)}…${secret.slice(-4)}` : "…");

/* ------------------------------------------------------------ expiry and status */
export const EXPIRY = [
  { id: "30", label: "30 days", days: 30 }, { id: "90", label: "90 days", days: 90 },
  { id: "365", label: "1 year", days: 365 }, { id: "never", label: "Never", days: null },
] as const;
export type ExpiryId = (typeof EXPIRY)[number]["id"];
export const DEFAULT_EXPIRY: ExpiryId = "90";
/** How long a rotated key's old secret keeps working, so a deploy can pick up the new one. */
export const ROTATE_OVERLAP_HOURS = 24;
/** A key inside this many days of its expiry says so on the list. */
export const EXPIRING_DAYS = 7;

const DAY = 86_400_000;
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export function expiresOn(created: Date, expiry: ExpiryId): Date | null {
  const e = EXPIRY.find((x) => x.id === expiry)!;
  return e.days === null ? null : addDays(created, e.days);
}

export type KeyStatus = "active" | "expiring" | "rotating" | "expired" | "revoked";
export type KeyDates = { expires?: string | null; revoked?: string; oldUntil?: string };
export function statusOf(k: KeyDates, now: Date): KeyStatus {
  if (k.revoked) return "revoked";
  if (k.expires && new Date(k.expires) <= now) return "expired";
  if (k.oldUntil && new Date(k.oldUntil) > now) return "rotating";
  if (k.expires && new Date(k.expires).getTime() - now.getTime() <= EXPIRING_DAYS * DAY) return "expiring";
  return "active";
}
/** Whether a request with this key gets through. */
export const works = (s: KeyStatus) => s === "active" || s === "expiring" || s === "rotating";
export const STATUS_WORD: Record<KeyStatus, string> = { active: "Active", expiring: "Expires soon", rotating: "Rotating", expired: "Expired", revoked: "Revoked" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayWords = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
/** "Never used", "Just now", "12 min ago", "3 h ago", "Yesterday", "Sep 21". */
export function lastUsedWords(iso: string | undefined, now: Date): string {
  if (!iso) return "Never used";
  const d = new Date(iso); const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY && d.getDate() === now.getDate()) return `${Math.floor(ms / 3_600_000)} h ago`;
  if (ms < 2 * DAY && addDays(d, 1).getDate() === now.getDate()) return "Yesterday";
  return dayWords(d);
}
/** "in 5 days", "tomorrow", "today", or the day, for an expiry. */
export function expiryWords(iso: string | null | undefined, now: Date): string {
  if (!iso) return "Never expires";
  const d = new Date(iso);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = d <= now ? -1 : Math.round((midnight(d) - midnight(now)) / DAY);
  if (days < 0) return `Expired ${dayWords(d)}`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= EXPIRING_DAYS) return `Expires in ${days} days`;
  return `Expires ${dayWords(d)}`;
}

/* ------------------------------------------------------------ create */
export type KeyDraft = { name: string; access: AccessMap; expiry: ExpiryId };
export type KeyErrors = { name?: string; scopes?: string };
/* ------------------------------------------------------------ who may hold send (§17 decision 15) */
/** A key belongs to a job; a signed-in MCP connection belongs to a person. Only a person's connection may send. */
export type Holder = "key" | "oauth";
export const maySend = (h: Holder) => h === "oauth";
/** The levels an area offers this holder: keys stop at Write on the Unibox (a job drafts, a person sends). */
export function levelsFor(area: Area, h: Holder): Access[] {
  const a = AREAS.find((x) => x.id === area)!;
  return ["none", "read", "write", ...(a.send && maySend(h) ? (["send"] as const) : [])];
}
/** Clamp an access map to what a holder may have: send becomes write for a key. */
export const clampFor = (m: AccessMap, h: Holder): AccessMap => (maySend(h) || m.unibox !== "send" ? m : { ...m, unibox: "write" });
export const KEY_SEND_REFUSED = "API keys can draft but can’t send. Sending needs a signed-in MCP connection.";
/** A key's scopes: never unibox:send, whatever the map says (the picker doesn't offer it; this is the backstop). */
export type KeyScope = Exclude<Scope, "unibox:send">;
export const keyScopesOf = (a: Partial<AccessMap>): KeyScope[] => scopesOf({ ...a, unibox: a.unibox === "send" ? "write" : a.unibox }) as KeyScope[];

/* ------------------------------------------------------------ who manages which key (§17 decision 16) */
export type Role = "owner" | "member";
export type Viewer = { name: string; role: Role };
/** Owners manage every key. Members create keys, and rotate and revoke only the ones they made. */
export const canManageKey = (k: { by: string }, v: Viewer) => v.role === "owner" || k.by === v.name;
export const manageNote = (k: { by: string }, v: Viewer) =>
  canManageKey(k, v) ? undefined : `Made by ${k.by.split(" ")[0]}. Only ${k.by.split(" ")[0]} or an owner can rotate or revoke it.`;

export function validateKey(k: KeyDraft, taken: readonly string[]): KeyErrors {
  const e: KeyErrors = {};
  const n = k.name.trim();
  if (!n) e.name = "Name it after what uses it, like “n8n lead sync”, so you know what breaks if you revoke it.";
  else if (n.length > 48) e.name = "Keep it under 48 characters.";
  else if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) e.name = `A key called “${n}” already exists. Rotate that one, or pick another name.`;
  if (!scopesOf(k.access).length) e.scopes = "Pick at least one area. A key with no scopes can’t call anything.";
  else if (k.access.unibox === "send") e.scopes = KEY_SEND_REFUSED;
  return e;
}
export const isValid = (e: KeyErrors) => !e.name && !e.scopes;

/** Rotating: a new secret now; the old one works for ROTATE_OVERLAP_HOURS, then stops. */
export function rotate(now: Date) {
  return { rotated: now.toISOString(), oldUntil: new Date(now.getTime() + ROTATE_OVERLAP_HOURS * 3_600_000).toISOString() };
}

/** Rate limits, per key and per MCP connection. */
export const RATE = { perMinute: 60, writesPerMinute: 20, sendsPerHour: 30 };
