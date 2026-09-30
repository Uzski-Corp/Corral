/* Unibox sample data for M7 (ENG-57): the M1 threads with their history, mailbox and sequence, two threads
   Corral handled on its own, and Corral's drafts with knowledge-base citations (M2 lines). Illustrative. */
import { THREADS, type Thread } from "../data";
import type { Cite, DraftKind, SendKind } from "@/lib/unibox/draft";
import { NO_FILTERS, type Filters, type Triage } from "@/lib/unibox/triage";
import type { UniboxReviewState } from "@/lib/unibox/state";
import { isHandoffState } from "@/lib/handoff/state";
import { backInNeedsYou } from "@/lib/unibox/ooo";

export const POOL_MAILBOX = "tomas@coldtrace.io";

const step1 = (subject: string, body: string, at = "Mon 21 Sep, 08:12", meta = "Opened") =>
  ({ from: "you" as const, who: "You", at, note: `Cold-room pilot, step 1 · ${subject}`, body, meta });
const step2 = (body: string, at = "Thu 24 Sep, 08:10", meta = "Opened 3×") =>
  ({ from: "you" as const, who: "You", at, note: "Cold-room pilot, step 2", body, meta });
const pilot = (step: number) => ({ id: "pilot", name: "Cold-room pilot", step, of: 4, state: "Stopped: replied" });

/** What M7 adds to each M1 thread. */
const EXTRA: Record<string, Partial<Thread>> = {
  brian: { email: "brian@pwanifresh.com", mailbox: POOL_MAILBOX, seq: pilot(2),
    history: [
      step1("Spoilage across your Mombasa cold rooms", "Brian, Pwani Fresh runs four cold rooms across fish and dairy. When one drifts overnight, who finds out, and when?"),
      step2("Brian, your March post about the Likoni container stuck with me. Four rooms, fish and dairy, and no one gets paged when a door is left open…")] },
  wanjiru: { email: "wanjiru@kilima.co.ke", mailbox: POOL_MAILBOX, seq: pilot(2),
    receipts: [["Classified as Interested · pilot request", "0.9s"], ["Found pilot terms in Pricing and terms", "30 days · up to 3 rooms"], ["Added Cal.com link", "tomas/20min"]],
    next: [["+2d", "Nudge with the pilot one-pager", "auto"]],
    history: [
      step1("Spoilage found in the morning", "Wanjiru, Kilima runs three cold rooms at Nakuru. In March a compressor failed overnight and the morning shift found 6,000 litres gone. ColdTrace calls whoever is on duty within two minutes.", "Mon 21 Sep, 08:12", "Opened 2×"),
      { ...step2("Wanjiru, one gateway covers a whole site, so three sites is three plugs and an afternoon each. Worth a look before the dry season?", "Thu 24 Sep, 08:10", "Opened"), note: "Cold-room pilot, step 2 · Three sites, one alert" }] },
  grace: { email: "grace@nyota.co.tz", mailbox: POOL_MAILBOX, time: "08:55", unread: true, meeting: "booked", seq: { id: "pilot", name: "Cold-room pilot", step: 3, of: 4, state: "Stopped: meeting booked" },
    snippet: "Mercy asks two things before Thursday: is ColdTrace FDA approved…",
    body: "Mercy asks two things before Thursday. Is ColdTrace FDA approved? We export concentrate to the US. And could you install at our Arusha plant this week, same day, so we can show it running?",
    receipts: [["Classified as Meeting booked · question", "0.8s"], ["Asks for claims on the Never-say list", "2 rules"]],
    history: [{ from: "them", who: "Grace Holloway", at: "Yesterday, 16:20", body: "Booked for Thursday 10:30. Adding our QA lead, Mercy, since she’ll own the rollout." }] },
  daniel: { email: "daniel.weber@rvgrain.co.ke", mailbox: "wanjiru@coldtrace.io", triage: "ooo", handled: true, seq: { id: "pilot", name: "Cold-room pilot", step: 2, of: 4, state: "Paused until 15 Oct, 09:00" } },
  reza: { email: "reza@tamubakeries.ug", mailbox: POOL_MAILBOX, seq: { id: "pilot", name: "Cold-room pilot", step: 1, of: 4, state: "Stopped: not interested" } },
  amara: { email: "amara@savannajuice.africa", mailbox: "hello@coldtrace-mail.com", seq: { id: "drip", name: "Dairy proof drip", step: 1, of: 3, state: "Stopped: replied" },
    body: "Who else in dairy is using this? Send me a case study and I’ll share it with our founders. Also: our new blast freezer runs at −35 °C. Will the sensors work in there?" },
  sofia: { email: "sofia@kivucoffee.rw", mailbox: POOL_MAILBOX, seq: pilot(1) },
};

/** Two threads Corral handled on its own: in All, never in Needs you. */
const HANDLED: Thread[] = [
  { id: "neema", avatar: "", name: "Neema Mushi", email: "neema@dodomadairy.co.tz", company: "Dodoma Dairy Co-op", title: "General Manager", fit: 79, status: "Unsubscribed", triage: "unsubscribe", handled: true, time: "08:31",
    mailbox: "amara@coldtrace.io", seq: { id: "drip", name: "Dairy proof drip", step: 2, of: 3, state: "Stopped: unsubscribed" },
    snippet: "Please take me off your list.", subject: "Re: What Kilima’s auditors saw", body: "Please take me off your list.",
    receipts: [["Classified as Unsubscribe", "0.3s"], ["Stopped Dairy proof drip for Neema", "auto"], ["Never writes to neema@dodomadairy.co.tz again", "suppressed"]] },
  { id: "bounce", avatar: "", name: "Juma Magesa", email: "juma@mwanzafish.co.tz", sender: { name: "Mail Delivery Subsystem", email: "mailer-daemon@googlemail.com" }, company: "Mwanza Fish Processors", title: "Operations Manager", fit: 72, status: "Bounced", triage: "bounce", handled: true, time: "07:04",
    mailbox: "ops@coldtrace.io", seq: { id: "pilot", name: "Cold-room pilot", step: 1, of: 4, state: "Stopped: bounced" },
    snippet: "Mail Delivery Subsystem: not delivered. 554 5.7.1…", subject: "Delivery Status Notification (Failure)",
    body: "Your message wasn’t delivered to juma@mwanzafish.co.tz. The receiving server refused it: 554 5.7.1 Service unavailable; client host blocked.",
    receipts: [["Classified as Bounce · domain refusing mail", "0.2s"], ["Held mwanzafish.co.tz: no more mail until it answers", "3 bounces · Sep 29"], ["Found another contact: Rehema Said, Plant Manager", "verified"]] },
];

/** The M7 thread list: every M1 thread (M1 order), extended, then the handled ones. */
export const UNIBOX_THREADS: Thread[] = [...THREADS.map((t) => ({ ...t, ...EXTRA[t.id] })), ...HANDLED];

/** The sample’s today (Wed 30 Sep 2026), for dates read out of replies. */
export const TODAY = new Date(2026, 8, 30, 9, 0);

/** What the triage buttons say Corral did on a handled thread. */
export const HANDLED_NOTE: Record<string, string> = {
  daniel: `Daniel is out until 14 October. Corral paused Cold-room pilot for him; step 3 goes on 15 Oct at 09:00, his morning. ${backInNeedsYou(THREADS.find((t) => t.id === "daniel")!.body, TODAY).label}, the day he’s back. Nothing to send.`,
  neema: "Neema asked to be removed. Corral stopped Dairy proof drip for her and won’t write to neema@dodomadairy.co.tz again, from any sequence or mailbox.",
  bounce: "mwanzafish.co.tz is refusing mail. Corral marked juma@ bad, held the domain (3 bounces from ops@ on Sep 29) and found Rehema Said, Plant Manager, to try instead.",
};

/* ------------------------------------------------------------ Corral's drafts */
export type DraftModel = {
  paras: string[]; cites: Cite[];
  /** Said in the card: what Corral chose not to write. */
  left?: string[];
  /** Low confidence: the sentence that defers, and why. */
  gap?: { sentence: string; why: string };
  /** A new thread (referral intro) rather than a reply. */
  to?: string;
};
export type CopilotModel = { draft?: DraftModel; refused?: { asks: { quote: string; rule: string }[] }; safe?: DraftModel; low?: boolean };

const C = {
  loggers: { n: 0, section: "Objections and answers", text: "Loggers tell you what went wrong yesterday. ColdTrace tells you while there's still time to move the stock, and the log writes itself.", source: "Objection handling v3.docx · p.2" },
  kilima: { n: 0, section: "Proof", text: "Kilima Dairies cut spoilage by 31% in its first quarter and passed its KEBS audit using the log ColdTrace wrote for it.", source: "Kilima Dairies case study.docx · p.2" },
  trial: { n: 0, section: "Pricing and terms", text: "A 30-day pilot on up to three rooms, free, with the sensors left in place if they sign.", source: "Sales FAQ.md" },
  install: { n: 0, section: "Objections and answers", text: "Nothing goes offline. Sensors stick on and the gateway plugs into a socket; a six-room site is usually live in an afternoon.", source: "Objection handling v3.docx · p.4 · Sales FAQ.md" },
  pitch: { n: 0, section: "In one line", text: "Wireless sensors that tell a cold room's manager within two minutes when something is going wrong, and keep the temperature log inspectors ask for.", source: "ColdTrace pitch 2026.pdf · p.2 · written by you" },
  fda: { n: 0, section: "Never say", text: "Don't call ColdTrace “FDA approved”. The logging meets 21 CFR Part 11; the device itself isn't approved by anyone.", source: "Never say · written by you" },
};
const cites = (...c: Cite[]) => c.map((x, i) => ({ ...x, n: i + 1 }));
const NO_PRICE = "No price: the knowledge base has $35 and $39 a sensor. Resolve it in Pricing and terms and Corral can quote it.";

export const COPILOT: Record<string, CopilotModel> = {
  brian: { draft: {
    paras: ["Fair point, Brian. Loggers tell you what went wrong yesterday; ColdTrace tells you while there’s still time to move the stock, and the log writes itself.[1]",
      "Kilima Dairies cut spoilage by 31% in its first quarter.[2] If price is the blocker this quarter, a free 30-day pilot on up to three of your rooms lets you compare it with your loggers first.[3] Twenty minutes to set it up? cal.com/tomas/20min"],
    cites: cites(C.loggers, C.kilima, C.trial), left: [NO_PRICE] } },
  wanjiru: { draft: {
    paras: ["Yes, and November is realistic. The pilot is 30 days on up to three rooms, free, and the sensors stay if you sign,[1] so one room at each Nakuru site works.",
      "Nothing goes offline to install: sensors stick on and the gateway plugs into a socket.[2] Could we take 20 minutes this week to pick the rooms? cal.com/tomas/20min"],
    cites: cites(C.trial, C.install), left: ["No install date: sites outside Nairobi and Mombasa are scheduled, not same-day (Never say)."] } },
  amara: { low: true, draft: {
    paras: ["Of course. Kilima Dairies is the closest to you: they cut spoilage by 31% in their first quarter and passed a KEBS audit on ColdTrace’s log.[1] The case study is attached.",
      "On the blast freezer: I don’t want to guess at −35 °C. I’ll check with our engineers and come back to you by Thursday."],
    cites: cites(C.kilima),
    gap: { sentence: "I don’t want to guess at −35 °C. I’ll check with our engineers and come back to you by Thursday.",
      why: "The knowledge base gives −30 °C to +60 °C for the gateway and nothing for sensors below −30 °C. Pages 12–18 of Gateway spec sheet v4.pdf are scanned images Corral couldn’t read; the answer may be there." } } },
  grace: {
    refused: { asks: [
      { quote: "Is ColdTrace FDA approved?", rule: "Don’t call ColdTrace “FDA approved”. The logging meets 21 CFR Part 11; the device itself isn’t approved by anyone." },
      { quote: "Could you install at our Arusha plant this week, same day?", rule: "Don’t promise same-day installation outside Nairobi and Mombasa." }] },
    safe: {
      paras: ["Good questions from Mercy. The FDA doesn’t approve temperature sensors; what it looks at is the record, and ColdTrace’s log meets 21 CFR Part 11.[1] I’ll bring a sample export on Thursday.",
        "On Arusha: a site is usually live in an afternoon once we’re there,[2] but I won’t promise this week before I’ve checked the install team’s schedule. I’ll confirm a date by tomorrow."],
      cites: cites(C.fda, C.install), left: ["Doesn’t say “FDA approved” or promise same-day installation (Never say)."] } },
  sofia: { draft: { to: "aline@kivucoffee.rw · Sofia in cc",
    paras: ["Hi Aline, Sofia suggested I write to you, since you own the QA budget at Kivu Coffee Works.",
      "ColdTrace tells a cold room’s manager within two minutes when something is going wrong, and keeps the temperature log inspectors ask for.[1] Most of your beans sit ambient, so it may only matter for the rooms you chill; happy to check that before taking your time.",
      "Worth 20 minutes? cal.com/tomas/20min"],
    cites: cites(C.pitch) } },
};

/** The edit shown in `edited`: you added a price the knowledge base disagrees on. */
export const BRIAN_EDIT = [
  "Fair point, Brian. Loggers tell you what went wrong yesterday; ColdTrace tells you while there’s still time to move the stock, and the log writes itself.",
  "At $35 a sensor a month, one saved container pays for a year of your four rooms. If price is the blocker this quarter, a free 30-day pilot on up to three of your rooms lets you compare it with your loggers first. Twenty minutes to set it up? cal.com/tomas/20min",
].join("\n\n");

/** A teammate's reply that landed while you were writing (`conflict`). */
export const TEAMMATE_REPLY = { who: "Amara Njoroge", email: "amara@coldtrace.io", at: "09:51",
  body: "Hi Brian, Amara here, I look after Pwani’s region. Totally fair on price. Could I send you Kilima’s spoilage numbers and we compare them against your loggers on a call?" };

/** Where a send failed (`failed`). */
export const SEND_ERROR = { code: "421 4.7.0", text: "Try again later, closing connection. (Google, tomas@coldtrace.io)", at: "09:44" };
export const DISCONNECTED = { mailbox: "hello@coldtrace-mail.com", since: "06:12", why: "Google sign-in expired" };

/* ------------------------------------------------------------ review seeds */
export type UniboxTab = "needs" | "meetings" | "snoozed" | "all";
export type UniboxSeed = {
  active: string; tab: UniboxTab; pane: "list" | "read"; filters: Filters;
  draft: Record<string, DraftKind>; send: Record<string, SendKind>; text: Record<string, string>;
  menu?: boolean; keys?: boolean; load?: "loading" | "error"; empty?: boolean; sentAt?: string; undoLeft?: number;
  conflict?: boolean;
  /** M8: a Cal.com handoff state (the thread is Grace's). `patch` changes her thread for that state. */
  handoff?: boolean; patch?: Record<string, Partial<Thread>>;
};

/** Default draft kind for a thread: Corral has one ready (or low, or refused), else none. */
export function draftKindFor(id: string, c: CopilotModel | undefined = COPILOT[id]): DraftKind {
  if (!c) return "none";
  return c.refused ? "refused" : c.low ? "low" : "ready";
}

/* M8 (ENG-58): how Grace's thread looks in each handoff state. Booked-type states sit in Meetings; a
   cancellation or a no-show is a person's job again, so the thread is back in Needs you. */
const GRACE_TAB: Partial<Record<UniboxReviewState, UniboxTab>> = { "meeting-cancelled": "needs", "meeting-no-show": "needs" };
const GRACE_EARLIER = { from: "them" as const, who: "Grace Holloway", at: "Today, 08:55",
  body: "Mercy asks two things before Thursday. Is ColdTrace FDA approved? We export concentrate to the US. And could you install at our Arusha plant this week, same day, so we can show it running?" };
const GRACE_PATCH: Partial<Record<UniboxReviewState, Partial<Thread>>> = {
  "meeting-rescheduled": { meeting: "rescheduled", time: "09:20" },
  "meeting-cancelled": { status: "Interested", meeting: "cancelled", time: "09:20", seq: { id: "pilot", name: "Cold-room pilot", step: 3, of: 4, state: "Stopped: replied" },
    snippet: "Mercy is tied up with the Arusha audit. Can we pick this up after…",
    body: "Sorry for the late notice. Mercy is tied up with the Arusha audit this week, so I’ve cancelled Thursday. Can we pick this up after the 15th?",
    receipts: [["Classified as Interested · later", "0.7s"], ["Cal.com: meeting cancelled by Grace", "Today, 09:20"]] },
  "meeting-no-show": { status: "Interested", meeting: "no-show" },
};
const withHistory = (id: string): Partial<Thread> => (id === "meeting-cancelled" ? { history: [...(EXTRA.grace.history ?? []), GRACE_EARLIER] } : {});

export function seedFor(state?: UniboxReviewState): UniboxSeed {
  const base: UniboxSeed = { active: "brian", tab: "needs", pane: "read", filters: NO_FILTERS, draft: {}, send: {}, text: {} };
  const on = (id: string, extra: Partial<UniboxSeed> = {}): UniboxSeed => ({ ...base, active: id, ...extra });
  if (isHandoffState(state)) return on("grace", { handoff: true, tab: GRACE_TAB[state] ?? "meetings", patch: GRACE_PATCH[state] ? { grace: { ...GRACE_PATCH[state], ...withHistory(state) } } : undefined });
  switch (state) {
    case undefined: return { ...base, pane: "list" };
    case "panes": return { ...base, pane: "list" };
    case "filtered": return { ...base, active: "wanjiru", pane: "list", filters: { triage: ["interested", "objection"] as Triage[], unread: true } };
    case "triage-menu": return { ...base, menu: true };
    case "referral": return on("sofia");
    case "ooo": return on("daniel", { tab: "all" });
    case "unsubscribe": return on("neema", { tab: "all" });
    case "bounce": return on("bounce", { tab: "all" });
    case "thread": return on("wanjiru");
    case "keys": return { ...base, pane: "list", keys: true };
    case "drafting": return on("wanjiru", { draft: { wanjiru: "drafting" } });
    case "draft": return base;
    case "low": return on("amara");
    case "refused": return on("grace");
    case "edited": return { ...base, draft: { brian: "edited" }, text: { brian: BRIAN_EDIT } };
    case "undo": return { ...base, send: { brian: "undo" }, undoLeft: 7 };
    case "sending": return { ...base, send: { brian: "sending" } };
    case "sent": return { ...base, send: { brian: "sent" }, sentAt: "09:44" };
    case "failed": return { ...base, send: { brian: "failed" } };
    case "disconnected": return on("amara", { send: { amara: "disconnected" } });
    case "conflict": return { ...base, send: { brian: "conflict" }, conflict: true };
    case "empty": return { ...base, pane: "list", empty: true };
    case "loading": return { ...base, pane: "list", load: "loading" };
    case "error": return { ...base, pane: "list", load: "error" };
  }
}
