/* Sample sequences and mailbox pool for M6 (ENG-56). Names and numbers line up with M1 (Cold-room pilot,
   4 steps · 12 days; Wanjiru's "Three sites, one alert" thread), M2 (knowledge lines), M4 (provenance)
   and the sidebar pool (6 mailboxes, 184 / 210 today). People, companies and numbers are illustrative. */
import type { Mailbox, Recipient, Step, VarKey } from "@/lib/sequences/sequence";
import type { SequenceReviewState } from "@/lib/sequences/state";

export type SeqStatus = "draft" | "launching" | "running" | "paused";
export type Sequence = {
  id: string; name: string; status: SeqStatus; product: string;
  audience: { label: string; count: number; skipped?: { n: number; why: string }[] };
  steps: Step[];
  window: string; by: string; updated: string;
  /** Recipients with no value, per variable (drives the launch checks). */ missing: Partial<Record<VarKey, number>>;
  run?: { enrolled: number; active: number; replied: number; meetings: number; bounced: number; unsubscribed: number; next?: string };
  paused?: { by: string; at: string; note?: string; held: number };
  launch?: { stage: number };
};

const UNSUB = "\n\nNot useful? {{unsubscribe_link}}";

/* ---------------------------------------------------------------- the draft */
export const DRAFT_STEPS: Step[] = [
  { id: "d1", thread: "new", subject: "Overnight at {{company}}", body:
    "Hi {{first_name}},\n\nWhen a compressor fails at night, the spoilage is usually found in the morning. ColdTrace puts a wireless sensor in each room and calls whoever is on duty within two minutes.\n\nKilima Dairies cut spoilage by 31% in its first quarter with it. Would it be worth a look for {{cold_storage}}?\n\n{{sender_first_name}}" + UNSUB },
  { id: "d2", thread: "reply", subject: "", gate: { wait: 3, cond: "no-reply" }, body:
    "{{first_name}}, one number from the Kilima pilot: the alert reached the duty manager in 94 seconds, on average.\n\nIf a free 30-day pilot on up to three rooms would help, reply with a good week and I'll set it up.\n\n{{sender_first_name}}" },
  { id: "d3", thread: "reply", subject: "", gate: { wait: 5, cond: "opened-no-reply", otherwise: "stop" }, body:
    "Last note from me, {{first_name}}. If cold-room alerts aren't a priority at {{company}} this year, no reply needed and I won't write again.\n\n{{sender_first_name}}" + UNSUB },
];
/** The draft once its launch checks pass: a fallback for {{cold_storage}} and an unsubscribe link in step 2. */
export const FIXED_STEPS: Step[] = DRAFT_STEPS.map((s) => s.id === "d1" ? { ...s, body: s.body.replace("{{cold_storage}}", "{{cold_storage | your cold rooms}}") }
  : s.id === "d2" ? { ...s, body: s.body + UNSUB } : s);

export const DRAFT: Sequence = {
  id: "dairy", name: "Dairy cold rooms · first touch", status: "draft", product: "ColdTrace Sensors",
  audience: { label: "Dairy & cold rooms · East Africa", count: 86, skipped: [{ n: 4, why: "already in Cold-room pilot" }] },
  steps: DRAFT_STEPS, window: "Their morning, 08:00–11:00", by: "Tomás Ibarra", updated: "12 min ago", missing: { cold_storage: 23 },
};

/* ---------------------------------------------------------------- live sequences */
const PILOT: Sequence = {
  id: "pilot", name: "Cold-room pilot", status: "running", product: "ColdTrace Sensors",
  audience: { label: "F&B · East Africa", count: 312 }, window: "Their morning, 08:00–11:00", by: "Tomás Ibarra", updated: "Sep 14", missing: {},
  steps: [
    { id: "p1", thread: "new", subject: "Three sites, one alert", stats: { sent: 312, opened: 181, replied: 23, bounced: 2 }, body:
      "Hi {{first_name}},\n\nMost cold-room losses are found in the morning. ColdTrace calls whoever is on duty within two minutes of a room going out of range, at every site, from one gateway.\n\nWorth 20 minutes to see it on {{cold_storage | your cold rooms}}?\n\n{{sender_first_name}}" + UNSUB },
    { id: "p2", thread: "reply", subject: "", gate: { wait: 3, cond: "no-reply" }, stats: { sent: 264, opened: 139, replied: 14, due: 21 }, body:
      "{{first_name}}, Kilima Dairies ran it across three Nakuru sites and cut spoilage by 31% in a quarter. Happy to send the one-pager.\n\n{{sender_first_name}}" + UNSUB },
    { id: "p3", thread: "new", subject: "The 94-second alert", gate: { wait: 4, cond: "opened-no-reply", otherwise: "skip" }, stats: { sent: 97, opened: 61, replied: 6, due: 9 }, body:
      "Hi {{first_name}},\n\nThe median ColdTrace alert reaches a phone in 94 seconds. That's usually the difference between moving the stock and writing it off.\n\nA 30-day pilot on three rooms is free. Want one at {{company}}?\n\n{{sender_first_name}}" + UNSUB },
    { id: "p4", thread: "reply", subject: "", gate: { wait: 5, cond: "no-reply" }, stats: { sent: 41, opened: 18, replied: 0, due: 6 }, body:
      "I'll stop here, {{first_name}}. If it's ever useful, the pilot offer stands.\n\n{{sender_first_name}}" + UNSUB },
  ],
  run: { enrolled: 312, active: 118, replied: 43, meetings: 11, bounced: 2, unsubscribed: 3, next: "Tomorrow 08:10–10:40 their time: 36 emails (step 2 · 21, step 3 · 9, step 4 · 6)" },
};
const PROOF: Sequence = {
  id: "proof", name: "Dairy proof drip", status: "paused", product: "ColdTrace Sensors",
  audience: { label: "Replied, no meeting", count: 64 }, window: "Business hours, 08:00–17:00", by: "Tomás Ibarra", updated: "Sep 28", missing: {},
  steps: [
    { id: "q1", thread: "new", subject: "What Kilima's audit looked like", stats: { sent: 64, opened: 49, replied: 7 }, body: "Hi {{first_name}},\n\nKilima passed its KEBS audit on the log ColdTrace kept for it. Here is what the inspector asked for, and what they showed.\n\n{{sender_first_name}}" + UNSUB },
    { id: "q2", thread: "reply", subject: "", gate: { wait: 4, cond: "no-reply" }, stats: { sent: 51, opened: 30, replied: 4, due: 22 }, body: "{{first_name}}, the short version: 31% less spoilage in the first quarter.\n\n{{sender_first_name}}" + UNSUB },
    { id: "q3", thread: "reply", subject: "", gate: { wait: 5, cond: "no-reply" }, stats: { sent: 0, opened: 0, replied: 0 }, body: "Should I close this out, {{first_name}}?\n\n{{sender_first_name}}" + UNSUB },
  ],
  run: { enrolled: 64, active: 40, replied: 11, meetings: 3, bounced: 0, unsubscribed: 1 },
  paused: { by: "Tomás Ibarra", at: "Sep 28, 16:40", note: "Hold until the new Kilima numbers are in the case study.", held: 22 },
};
const Q4: Sequence = {
  id: "q4", name: "Re-engage Q4", status: "running", product: "ColdTrace Sensors",
  audience: { label: "Logistics · Fit > 70", count: 41 }, window: "Their morning, 08:00–11:00", by: "Wanjiru Kamau", updated: "Sep 21", missing: {},
  steps: [
    { id: "r1", thread: "new", subject: "Before the dry season", stats: { sent: 41, opened: 22, replied: 3 }, body: "Hi {{first_name}},\n\nLast year you asked us to come back before the dry season. Is now a better time?\n\n{{sender_first_name}}" + UNSUB },
    { id: "r2", thread: "reply", subject: "", gate: { wait: 5, cond: "no-reply" }, stats: { sent: 12, opened: 5, replied: 1, due: 26 }, body: "{{first_name}}, the pilot offer is still open.\n\n{{sender_first_name}}" + UNSUB },
  ],
  run: { enrolled: 41, active: 30, replied: 4, meetings: 1, bounced: 0, unsubscribed: 0 },
};
export const LIVE: Sequence[] = [PILOT, PROOF, Q4];

/* ---------------------------------------------------------------- preview recipients (the draft's audience) */
const who = (v: string, what: string, at = "2026-09-02") => ({ value: v, kind: "site" as const, what, at });
const shared = (company: string, domain: string) => ({
  company: { value: company, kind: "search" as const, what: `Search result and the title of ${domain}`, at: "2026-09-02" },
  sender_first_name: { value: "Tomás", kind: "mailbox" as const, what: "tomas@coldtrace.io, one of the mailboxes it rotates across" },
  unsubscribe_link: { value: "unsubscribe", kind: "corral-link" as const, what: "One click, no login; Corral stops at once" },
});
export const RECIPIENTS: Recipient[] = [
  { id: "mara", company: "Mara Cold Stores", person: "Lena Fischer", title: "Head of Quality", domain: "maracold.com", email: "lena@maracold.com", values: {
    ...shared("Mara Cold Stores", "maracold.com"),
    first_name: who("Lena", "Named on the Team page, confirmed by Hunter"), title: who("Head of Quality", "Title on the Team page"),
    industry: { value: "cold storage", kind: "corral", what: "Read from the About page", at: "2026-09-02" }, country: who("Kenya", "Address in the site footer"),
    cold_storage: { value: "your 14 cold rooms in Athi River", kind: "corral", what: "Read on maracold.com/facilities", at: "2026-09-02" } } },
  { id: "kampala", company: "Kampala Ice Cream Co.", person: "Ruth Nambi", title: "Founder", domain: "kampalaice.ug", email: "ruth@kampalaice.ug", values: {
    ...shared("Kampala Ice Cream Co.", "kampalaice.ug"),
    first_name: who("Ruth", "Named on the About page, confirmed by Hunter"), title: who("Founder", "About page"),
    industry: { value: "dairy", kind: "corral", what: "Read from the About page", at: "2026-09-02" }, country: who("Uganda", "Address in the site footer"),
    cold_storage: { value: "the two blast freezers at your Ntinda plant", kind: "corral", what: "Read on kampalaice.ug/about", at: "2026-09-02" } } },
  { id: "dodoma", company: "Dodoma Dairy Co-op", person: "Neema Mushi", title: "General Manager", domain: "dodomadairy.co.tz", email: "neema@dodomadairy.co.tz", values: {
    ...shared("Dodoma Dairy Co-op", "dodomadairy.co.tz"),
    first_name: who("Neema", "Named on the Team page, confirmed by Hunter"), title: who("General Manager", "Title on the Team page"),
    industry: { value: "dairy", kind: "corral", what: "Read from the About page", at: "2026-09-02" }, country: who("Tanzania", "Address in the site footer"),
    cold_storage: { value: "the milk-cooling rooms at your collection centre", kind: "corral", what: "Read on dodomadairy.co.tz/about", at: "2026-09-02" } } },
  { id: "mbarara", company: "Mbarara Milk Collectors", person: "Brenda Ainembabazi", title: "Operations Manager", domain: "mbararamilk.ug", email: "brenda@mbararamilk.ug", values: {
    ...shared("Mbarara Milk Collectors", "mbararamilk.ug"),
    first_name: who("Brenda", "Named on the Contact page, confirmed by Hunter"), title: who("Operations Manager", "Contact page"),
    industry: { value: "dairy", kind: "corral", what: "Read from the home page", at: "2026-09-02" }, country: who("Uganda", "Address on the home page") } },
];
/** Why a recipient has no value, for the preview. */
export const MISSING_WHY: Partial<Record<string, Partial<Record<VarKey, string>>>> = {
  mbarara: { cold_storage: "Corral could only read one page of mbararamilk.ug, and it doesn't say what they keep cold." },
};

/* ---------------------------------------------------------------- Corral's draft (copilot), citing the knowledge base */
export type KbCite = { n: number; section: string; text: string; sources: string[]; by?: "you" };
export type Copilot = { subject: string; body: string; cites: KbCite[]; left: { what: string; why: string; action?: string }[]; rules: string[]; notes: string };
export const COPILOT: Copilot = {
  subject: "Overnight at {{company}}",
  body: "Hi {{first_name}},\n\nMost spoilage is found in the morning, after a compressor failed overnight and nobody knew.[1] ColdTrace puts a wireless sensor in each room and calls the manager on duty within two minutes; the median across 1,200 sensors is 94 seconds.[2]\n\nKilima Dairies cut spoilage by 31% in its first quarter and passed its KEBS audit on the log ColdTrace kept.[3] Would a free 30-day pilot on three rooms be useful for {{cold_storage | your cold rooms}}?[4]\n\n{{sender_first_name}}" + UNSUB,
  cites: [
    { n: 1, section: "Pains it solves", text: "Spoilage is found in the morning, after a compressor failed overnight and nobody knew.", sources: ["Kilima Dairies case study.docx p.1", "Objection handling v3.docx p.3"] },
    { n: 2, section: "Proof", text: "Median alert time is 94 seconds across 1,200 installed sensors.", sources: ["ColdTrace pitch 2026.pdf p.4"] },
    { n: 3, section: "Proof", text: "Kilima Dairies cut spoilage by 31% in its first quarter and passed its KEBS audit using the log ColdTrace wrote for it.", sources: ["Kilima Dairies case study.docx p.2"], by: "you" },
    { n: 4, section: "Pricing and terms", text: "A 30-day pilot on up to three rooms, free, with the sensors left in place if they sign.", sources: ["Sales FAQ.md"] },
  ],
  left: [
    { what: "No price", why: "The knowledge base has two prices, $35 and $39 a month, so the draft doesn't quote either.", action: "Resolve it in Pricing and terms" },
    { what: "No battery life", why: "Its source, Warehouse brochure 2024.pdf, was removed on Sep 26." },
  ],
  rules: ["Doesn't call ColdTrace “FDA approved”", "Doesn't promise same-day installation"],
  notes: "Written as Tomás, for dairies with cold rooms (this sequence's audience). 86 words.",
};

/* ---------------------------------------------------------------- mailbox pool */
const box = (m: Partial<Mailbox> & Pick<Mailbox, "id" | "address">): Mailbox => ({
  provider: "google", owner: "Tomás Ibarra", state: "warm", cap: 35, sentToday: 0, bouncedToday: 0, bounce30: 0.004, complaints30: 0,
  auth: { spf: true, dkim: true, dmarc: true }, sequences: 3, ...m,
});
/** The pool as the sidebar shows it by default: 6 warm mailboxes, 184 of 210 sent today. */
export const POOL_HEALTHY: Mailbox[] = [
  box({ id: "tomas", address: "tomas@coldtrace.io", sentToday: 33 }),
  box({ id: "wanjiru", address: "wanjiru@coldtrace.io", owner: "Wanjiru Kamau", sentToday: 31, bounce30: 0.005 }),
  box({ id: "amara", address: "amara@coldtrace.io", owner: "Amara Njoroge", provider: "microsoft", sentToday: 30, bounce30: 0.006 }),
  box({ id: "sales", address: "sales@coldtrace-mail.com", sentToday: 32, bounce30: 0.003 }),
  box({ id: "hello", address: "hello@coldtrace-mail.com", sentToday: 29, bounce30: 0.004 }),
  box({ id: "ops", address: "ops@coldtrace-mail.com", sentToday: 29, bounce30: 0.005 }),
];
/** The pool on a bad morning: two warming up, one disconnected, one resting after a bounce spike. */
export const POOL_ISSUES: Mailbox[] = [
  box({ id: "tomas", address: "tomas@coldtrace.io", sentToday: 31 }),
  box({ id: "wanjiru", address: "wanjiru@coldtrace.io", owner: "Wanjiru Kamau", sentToday: 29, bounce30: 0.005 }),
  box({ id: "amara", address: "amara@coldtrace.io", owner: "Amara Njoroge", provider: "microsoft", state: "warming", day: 9, sentToday: 18, bounce30: 0.006, sequences: 2, since: "Sep 21" }),
  box({ id: "sales", address: "sales@coldtrace-mail.com", state: "warming", day: 3, sentToday: 8, bounce30: 0, sequences: 1, since: "Sep 27" }),
  box({ id: "hello", address: "hello@coldtrace-mail.com", state: "disconnected", sentToday: 0, since: "06:12 today", note: "Google sign-in expired. Nothing sends from it, and its share is spread over the others." }),
  box({ id: "ops", address: "ops@coldtrace-mail.com", state: "resting", sentToday: 31, bouncedToday: 4, bounce30: 0.005, since: "09:41 today",
    note: "3 of the 4 were at mwanzafish.co.tz, whose mail server started refusing mail on Sep 29. Corral stopped this mailbox for the day and won't write to that domain again until it answers." }),
];

/* ---------------------------------------------------------------- review seeds */
export type SeqSeed = {
  list: Sequence[]; open: string | null; tab: "sequences" | "pool"; pool: Mailbox[];
  step?: number; form?: "copilot" | "conditions"; preview?: string; tried?: boolean; launch?: "confirm" | "running"; phase?: "loading" | "error";
};
export function seedFor(state?: SequenceReviewState): SeqSeed {
  const list = (d: Sequence) => [d, ...LIVE];
  const base: SeqSeed = { list: list(DRAFT), open: "pilot", tab: "sequences", pool: POOL_HEALTHY };
  switch (state) {
    case "empty": return { ...base, list: [], open: null };
    case "loading": return { ...base, phase: "loading" };
    case "error": return { ...base, phase: "error" };
    case "draft": return { ...base, open: "dairy" };
    case "conditions": return { ...base, open: "dairy", form: "conditions" };
    case "editor": return { ...base, open: "dairy", step: 0, preview: "mara" };
    case "copilot": return { ...base, open: "dairy", step: 0, preview: "mara", form: "copilot" };
    case "errors": return { ...base, open: "dairy", tried: true, step: 0, preview: "mbarara" };
    case "launch": return { ...base, list: list({ ...DRAFT, steps: FIXED_STEPS, missing: {} }), open: "dairy", launch: "confirm" };
    case "launching": return { ...base, list: list({ ...DRAFT, steps: FIXED_STEPS, missing: {}, status: "launching", launch: { stage: 1 } }), open: "dairy" };
    case "running": return { ...base, open: "pilot" };
    case "paused": return { ...base, open: "proof" };
    case "mailboxes": return { ...base, tab: "pool", pool: POOL_ISSUES };
    default: return base;
  }
}
