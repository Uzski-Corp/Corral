/**
 * Sequences (M6, ENG-56): steps, the waits and conditions between them, personalisation variables,
 * launch checks, and the mailbox pool that sends them. Pure helpers, no React.
 */
import type { SourceKind } from "@/lib/discovery/provenance";

/* ---------------------------------------------------------------- variables */

export type VarKey = "first_name" | "company" | "title" | "industry" | "country" | "cold_storage" | "sender_first_name" | "unsubscribe_link";
export type VarDef = { key: VarKey; label: string; from: string; example: string; system?: boolean };
/** Every variable a step can use. `from` says where the value comes from (the M4 provenance field, or the mailbox). */
export const VARIABLES: VarDef[] = [
  { key: "first_name", label: "First name", from: "Decision-maker (M4 provenance)", example: "Lena" },
  { key: "company", label: "Company", from: "Company name", example: "Mara Cold Stores" },
  { key: "title", label: "Job title", from: "Title (M4 provenance)", example: "Head of Quality" },
  { key: "industry", label: "Industry", from: "Industry (M4 provenance)", example: "cold storage" },
  { key: "country", label: "Country", from: "Country (M4 provenance)", example: "Kenya" },
  { key: "cold_storage", label: "What they keep cold", from: "Read by Corral from their site", example: "your 14 cold rooms in Athi River" },
  { key: "sender_first_name", label: "Your first name", from: "The mailbox that sends it", example: "Tomás", system: true },
  { key: "unsubscribe_link", label: "Unsubscribe link", from: "Added by Corral; one click, no login", example: "unsubscribe", system: true },
];
export const varDef = (k: string) => VARIABLES.find((v) => v.key === k);

/** A token as written: {{key}} or {{key | fallback}}. */
export type Token = { raw: string; key: string; fallback?: string; at: number };
const TOKEN = /\{\{\s*([a-zA-Z_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;
export function tokensIn(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => ({ raw: m[0], key: m[1], fallback: m[2] || undefined, at: m.index ?? 0 }));
}

/** Closest known variable for a misspelt one (edit distance ≤ 2), for "Did you mean {{first_name}}?". */
export function suggestVar(key: string): VarKey | undefined {
  const d = (a: string, b: string) => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  };
  const best = VARIABLES.map((v) => ({ k: v.key, n: d(key.toLowerCase(), v.key) })).sort((a, b) => a.n - b.n)[0];
  return best && best.n <= 2 ? best.k : undefined;
}

/** A variable's value for one recipient, with where it came from (shown in the preview). */
export type VarValue = { value: string; kind: SourceKind | "mailbox" | "corral-link"; what: string; at?: string };
export type Recipient = {
  id: string; company: string; person: string; title: string; domain: string; email: string;
  values: Partial<Record<VarKey, VarValue>>;
};

export type Part =
  | { t: "text"; text: string }
  | { t: "var"; key: VarKey; text: string; src: VarValue }
  | { t: "fallback"; key: VarKey; text: string }
  | { t: "missing"; key: VarKey }
  | { t: "unknown"; key: string; suggest?: VarKey };

/** Split a subject or body into text and filled variables for one recipient. */
export function render(text: string, r: Recipient): Part[] {
  const out: Part[] = [];
  let i = 0;
  for (const tk of tokensIn(text)) {
    if (tk.at > i) out.push({ t: "text", text: text.slice(i, tk.at) });
    const def = varDef(tk.key);
    if (!def) out.push({ t: "unknown", key: tk.key, suggest: suggestVar(tk.key) });
    else {
      const v = r.values[def.key];
      if (v?.value) out.push({ t: "var", key: def.key, text: v.value, src: v });
      else if (tk.fallback) out.push({ t: "fallback", key: def.key, text: tk.fallback });
      else out.push({ t: "missing", key: def.key });
    }
    i = tk.at + tk.raw.length;
  }
  if (i < text.length) out.push({ t: "text", text: text.slice(i) });
  return out;
}
/** The email as it would be sent (missing variables left as [key]). */
export const plain = (parts: Part[]) => parts.map((p) => (p.t === "text" || p.t === "var" || p.t === "fallback" ? p.text : `[${p.key}]`)).join("");

/* ---------------------------------------------------------------- steps */

/** replied / opened / no reply: what has to be true for the next step to send. */
export type Condition = "no-reply" | "opened-no-reply" | "not-opened";
export const CONDITION_TEXT: Record<Condition, string> = {
  "no-reply": "if no reply", "opened-no-reply": "if they opened it but didn't reply", "not-opened": "if they didn't open it",
};
export const CONDITION_SHORT: Record<Condition, string> = { "no-reply": "No reply", "opened-no-reply": "Opened, no reply", "not-opened": "Not opened" };
/** Opens are unreliable (Apple Mail Privacy Protection and others fetch every email). M7 follow-up to M6 Q4. */
export const OPENS_NOTE = "Opens are a guess. Apple Mail and some others open every email automatically, so this may fire for people who never read it.";
/** Secondary line under the option in the condition menu. "Opened, no reply" is offered with it, never as the default. */
/** M8: the same caveat from the other side. Apple Mail's automatic opens make "Not opened" under-fire. */
export const NOT_OPENED_NOTE = "Opens are a guess, so some people who read it may still count as not opened.";
export const CONDITION_HINT: Partial<Record<Condition, string>> = { "opened-no-reply": OPENS_NOTE, "not-opened": NOT_OPENED_NOTE };
/** What happens to people the condition doesn't match. */
export type Otherwise = "stop" | "skip";
export type Gate = { wait: number; cond: Condition; otherwise?: Otherwise };

export type StepStats = { sent: number; opened: number; replied: number; bounced?: number; due?: number };
export type Step = {
  id: string;
  /** new thread (own subject) or a reply in the same thread (subject "Re: …"). */
  thread: "new" | "reply";
  subject: string; body: string;
  /** The wait and condition before this step. The first step has none. */
  gate?: Gate;
  stats?: StepStats;
};

/** Exits that apply at every step. "replied" is the condition that ends a sequence. */
export const EXITS: { on: string; then: string }[] = [
  { on: "Replied", then: "stops, and the thread goes to Needs you in the Unibox" },
  { on: "Out of office", then: "pauses, and picks up the day after they're back" },
  { on: "Meeting booked", then: "stops" },
  { on: "Bounced or unsubscribed", then: "stops, and Corral never writes to that address again" },
];

/** Day each step sends on, counted from enrollment (day 0). */
export const stepDays = (steps: Step[]) => steps.reduce<number[]>((a, s, i) => [...a, i === 0 ? 0 : a[i - 1] + (s.gate?.wait ?? 0)], []);
export const spanDays = (steps: Step[]) => (steps.length ? stepDays(steps)[steps.length - 1] : 0);
export const summaryOf = (steps: Step[]) => `${steps.length} ${steps.length === 1 ? "step" : "steps"} · ${spanDays(steps)} days`;
/** "Wait 3 days · if no reply · otherwise stop" */
export function gateText(g: Gate): string {
  const w = g.wait === 0 ? "Same day" : `Wait ${g.wait} ${g.wait === 1 ? "day" : "days"}`;
  const other = g.cond === "no-reply" ? "" : g.otherwise === "skip" ? " · otherwise skip to the next step" : " · otherwise stop";
  return `${w}, ${CONDITION_TEXT[g.cond]}${other}`;
}
export const subjectOf = (steps: Step[], i: number): string => {
  const s = steps[i];
  if (s.thread === "new" || i === 0) return s.subject;
  for (let j = i - 1; j >= 0; j--) if (steps[j].thread === "new" || j === 0) return `Re: ${steps[j].subject}`;
  return s.subject;
};
export const pct = (n: number, of: number) => (of ? rate(n / of) : "—");
/** 0.074 → "7.4%" */
export const rate = (r: number) => `${Math.round(r * 1000) / 10}%`;

/* ---------------------------------------------------------------- launch checks */

export type Issue = {
  step: number; kind: "missing-var" | "unknown-var" | "unsubscribe" | "subject" | "empty";
  title: string; fix: string; key?: string; count?: number;
};

/** What stops a launch. `missing` = how many recipients have no value, per variable. */
export function issuesOf(steps: Step[], missing: Partial<Record<VarKey, number>>, audience: number): Issue[] {
  const out: Issue[] = [];
  steps.forEach((s, i) => {
    const n = i + 1;
    if (!s.body.trim()) { out.push({ step: n, kind: "empty", title: `Step ${n} has no message`, fix: "Write it, or ask Corral for a draft." }); return; }
    if (s.thread === "new" && !s.subject.trim()) out.push({ step: n, kind: "subject", title: `Step ${n} has no subject`, fix: "Add one; replies in the same thread reuse it." });
    const seen = new Set<string>();
    for (const tk of tokensIn(`${s.thread === "new" ? s.subject : ""}\n${s.body}`)) {
      if (seen.has(tk.key)) continue; seen.add(tk.key);
      const def = varDef(tk.key);
      if (!def) {
        const sg = suggestVar(tk.key);
        out.push({ step: n, kind: "unknown-var", key: tk.key, title: `Step ${n}: {{${tk.key}}} isn't a variable`, fix: sg ? `Did you mean {{${sg}}}?` : "Pick one from Insert variable." });
      } else if (!tk.fallback && (missing[def.key] ?? 0) > 0) {
        const c = missing[def.key]!;
        out.push({ step: n, kind: "missing-var", key: def.key, count: c, title: `Step ${n}: {{${def.key}}} is empty for ${c} of ${audience} companies`,
          fix: `Add a fallback, like {{${def.key} | your cold rooms}}, or leave those ${c} out.` });
      }
    }
    if (!/\{\{\s*unsubscribe_link/.test(s.body)) out.push({ step: n, kind: "unsubscribe", title: `Step ${n} has no unsubscribe link`,
      fix: "Every email needs one. Add {{unsubscribe_link}}; Corral turns it into a one-click link." });
  });
  return out;
}

/* ---------------------------------------------------------------- mailbox pool */

export type Provider = "google" | "microsoft" | "smtp";
export type MailboxState = "warm" | "warming" | "disconnected" | "resting";
export type Mailbox = {
  id: string; address: string; provider: Provider; owner: string;
  state: MailboxState;
  /** Daily cap once warm (20 · 30 · 35). */ cap: number;
  /** Warm-up day, 1–14. */ day?: number;
  sentToday: number; bouncedToday: number;
  /** 30-day rates, 0–1. */ bounce30: number; complaints30: number;
  auth: { spf: boolean; dkim: boolean; dmarc: boolean };
  since?: string; note?: string;
  /** Sequences it sends for. */ sequences: number;
};

export const WARMUP_DAYS = 14;
/** Warm-up ramp: 8 a day on day 3, 20 on day 9, the full cap from day 14. */
export const warmupCap = (day: number, cap: number) => (day >= WARMUP_DAYS ? cap : Math.min(cap, 2 * day + 2));
/** What a mailbox can send today. Disconnected mailboxes send nothing; a resting one stops where it is. */
export function todayCap(m: Mailbox): number {
  if (m.state === "disconnected") return 0;
  if (m.state === "resting") return m.sentToday;
  if (m.state === "warming") return warmupCap(m.day ?? 1, m.cap);
  return m.cap;
}
export function tomorrowCap(m: Mailbox): number {
  if (m.state === "disconnected") return 0;
  if (m.state === "warming") return warmupCap((m.day ?? 1) + 1, m.cap);
  return m.cap;
}
/** A bounce spike: at least 3 bounces today, 3% or more of today's sends, and 3× the 30-day rate. */
export function bounceSpike(m: Pick<Mailbox, "sentToday" | "bouncedToday" | "bounce30">): boolean {
  if (m.bouncedToday < 3 || !m.sentToday) return false;
  const r = m.bouncedToday / m.sentToday;
  return r >= 0.03 && r >= 3 * m.bounce30;
}
export type Health = { level: "good" | "watch" | "bad"; word: string; why: string };
export function healthOf(m: Mailbox): Health {
  const authOk = m.auth.spf && m.auth.dkim && m.auth.dmarc;
  if (bounceSpike(m)) return { level: "bad", word: "Bounce spike", why: `${m.bouncedToday} of ${m.sentToday} bounced today (${pct(m.bouncedToday, m.sentToday)}), usually ${rate(m.bounce30)}` };
  if (!authOk) return { level: "bad", word: "Failing checks", why: `${["SPF", "DKIM", "DMARC"].filter((_, i) => ![m.auth.spf, m.auth.dkim, m.auth.dmarc][i]).join(", ")} not passing` };
  if (m.bounce30 >= 0.02 || m.complaints30 >= 0.001) return { level: "watch", word: "Watch", why: `${rate(m.bounce30)} bounced in 30 days` };
  return { level: "good", word: "Healthy", why: `${rate(m.bounce30)} bounced in 30 days · no spam complaints` };
}
export type PoolSummary = { sent: number; cap: number; tomorrow: number; sending: number; total: number; attention: number };
export function poolSummary(ms: Mailbox[]): PoolSummary {
  return {
    sent: ms.reduce((a, m) => a + m.sentToday, 0),
    cap: ms.reduce((a, m) => a + todayCap(m), 0),
    tomorrow: ms.reduce((a, m) => a + tomorrowCap(m), 0),
    sending: ms.filter((m) => m.state === "warm" || m.state === "warming").length,
    total: ms.length,
    attention: ms.filter((m) => m.state === "disconnected" || m.state === "resting" || healthOf(m).level === "bad").length,
  };
}
/** Working days to send `n` first emails at `perDay` (Corral spreads a launch; it never bursts). */
export const sendDays = (n: number, perDay: number) => (perDay > 0 ? Math.max(1, Math.ceil(n / perDay)) : Infinity);
