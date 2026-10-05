/* Handoff and integrations sample data for M8 (ENG-58): Grace Holloway’s meeting (Nyota Beverages) through
   Cal.com, the deal in Phoenix ERP, the follow-up in AutoSend; the three connections, their logs, the Phoenix
   field mapping and what each one is allowed to do. Illustrative. */
import { afterMeeting, beforeCall, type After, type DealState, type ErpStage, type MeetingStatus, type NurtureState } from "@/lib/handoff/handoff";
import type { HandoffReviewState } from "@/lib/handoff/state";
import type { Connection, CorralField, ErpField, IntegrationId, LogRow, MapRow } from "@/lib/integrations/integrations";
import type { SettingsReviewState } from "@/lib/integrations/state";
import type { IntegrationAccount, IntegrationDetail, IntegrationLog } from "@/lib/integrations/live";
import type { CopilotModel } from "../unibox/data";

export const CAL_LINK = "cal.com/tomas/20min";
export const AUTOSEND_SENDER = "tomas@mail.coldtrace.io";
export const ERP_URL = "https://erp.coldtrace.io/api/webhooks/corral";

/* ------------------------------------------------------------ Grace’s meeting */
export type Person = { name: string; email: string; role: string; avatar?: string; note?: string };
export type MeetingModel = {
  status: MeetingStatus; title: string; when: string; length: string; where: string; host: string; guests: Person[];
  uid: string; received: string; by: string;
  /** Rescheduled: the time it was. Cancelled / no-show: the time it would have been. */ was?: string;
  /** In their words (reschedule or cancel reason from Cal.com). */ reason?: string;
  /** No-show: who marked it and when. */ marked?: string;
};
export type DealModel = {
  state: DealState; id?: string; name: string; stage: ErpStage; owner: string; at: string; note: string;
  error?: { code: string; text: string; tries: string; why: string };
  dup?: { account: string; accountId: string; deal: string; dealName: string; owner: string; touched: string; stage: ErpStage };
};
export type NurtureModel = { state: NurtureState; journey: string; when?: string; note: string };
export type HandoffModel = { key: HandoffReviewState; meeting: MeetingModel; deal: DealModel; nurture: NurtureModel; after: After; receipts: [string, string][]; copilot?: CopilotModel };

const GUESTS: Person[] = [
  { name: "Grace Holloway", email: "grace@nyota.co.tz", role: "VP Operations", avatar: "grace" },
  { name: "Mercy Mushi", email: "mercy@nyota.co.tz", role: "QA lead", note: "added by Grace" },
];
const THU = new Date(2026, 9, 1, 10, 30);
const MON = new Date(2026, 9, 5, 14, 0);
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_ = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");
/** "Wed 30 Sep, 10:30" (fixed words, so no locale’s "Sept"). */
const at = (d: Date) => `${DAY[d.getDay()]} ${d.getDate()} ${MON_[d.getMonth()]}, ${two(d.getHours())}:${two(d.getMinutes())}`;

const MEETING: MeetingModel = {
  status: "booked", title: "20 min intro · ColdTrace Sensors", when: "Thu 1 Oct, 10:30–10:50 EAT", length: "20 min", where: "Google Meet",
  host: "Tomás Ibarra", guests: GUESTS, uid: "bk_7Hq2Lw", received: "Yesterday, 16:18", by: "Grace Holloway",
};
const DEAL: DealModel = { state: "pushed", id: "PX-2288", name: "Nyota Beverages · ColdTrace Sensors pilot", stage: "Discovery", owner: "Tomás Ibarra", at: "Yesterday, 16:18 · 1.4s", note: "Opened with the meeting time, both guests and the fit (84)." };
const NURTURE: NurtureModel = { state: "scheduled", journey: "Before your call", when: at(beforeCall(THU)), note: "One email to Grace and Mercy: what you’ll cover, and the Kilima Dairies case study." };

const cite = (n: number, section: string, text: string, source: string) => ({ n, section, text, source });

/** Every handoff scenario, keyed by its review state. The live app shows `meeting-booked`. */
export const HANDOFFS: Record<HandoffReviewState, Omit<HandoffModel, "key" | "after">> = {
  "meeting-booked": { meeting: MEETING, deal: DEAL, nurture: NURTURE,
    receipts: [["Cal.com BOOKING_CREATED, signature checked", "Yesterday, 16:18"], ["Cold-room pilot stopped at step 3", "auto"], ["Deal PX-2288 opened in Phoenix", "Discovery"], ["AutoSend: Before your call", NURTURE.when!]] },
  "meeting-rescheduled": {
    meeting: { ...MEETING, status: "rescheduled", when: "Mon 5 Oct, 14:00–14:20 EAT", was: "Thu 1 Oct, 10:30", received: "Today, 09:20", reason: "Mercy is at the Arusha plant on Thursday." },
    deal: { ...DEAL, state: "updated", at: "Today, 09:20 · 0.9s", note: "Next meeting moved to Mon 5 Oct, 14:00. Same deal, same stage." },
    nurture: { ...NURTURE, state: "moved", when: at(beforeCall(MON)), note: "Moved with the meeting. 24 hours before is a Sunday, so it goes Friday at the same time." },
    receipts: [["Cal.com BOOKING_RESCHEDULED, signature checked", "Today, 09:20"], ["Deal PX-2288: next meeting moved", "Mon 5 Oct"], ["AutoSend: Before your call moved", at(beforeCall(MON))]] },
  "meeting-cancelled": {
    meeting: { ...MEETING, status: "cancelled", when: "Thu 1 Oct, 10:30–10:50 EAT", was: "Thu 1 Oct, 10:30", received: "Today, 09:20", reason: "Mercy is tied up with the Arusha audit. Can we pick this up after the 15th?" },
    deal: { ...DEAL, state: "updated", stage: "Lead", at: "Today, 09:20 · 0.8s", note: "Back to Lead and still open. Nothing in Phoenix is closed or deleted." },
    nurture: { ...NURTURE, state: "stopped", note: `Before your call won’t go (it was set for ${NURTURE.when}). A cancelled meeting gets a person, not a drip.` },
    receipts: [["Cal.com BOOKING_CANCELLED, signature checked", "Today, 09:20"], ["Back in Needs you, out of Meetings", "auto"], ["Deal PX-2288 back to Lead, still open", "Phoenix"], ["AutoSend: Before your call stopped", "not sent"]],
    copilot: { draft: {
      paras: ["Of course, Grace. The audit comes first. After the 15th works well: pick any time that suits you and Mercy here, cal.com/tomas/20min",
        "In the meantime I’ll send Mercy a sample of the temperature log export, since that’s what her auditors will ask about.[1]"],
      cites: [cite(1, "In one line", "Wireless sensors that tell a cold room’s manager within two minutes when something is going wrong, and keep the temperature log inspectors ask for.", "ColdTrace pitch 2026.pdf · p.2 · written by you")],
      left: ["Doesn’t suggest a date before the 16th: Grace asked for after the 15th."] } } },
  "meeting-no-show": {
    meeting: { ...MEETING, status: "no-show", was: "Thu 1 Oct, 10:30", received: "Thu 1 Oct, 10:45", marked: "You marked Grace and Mercy as no-shows at 10:45 in Cal.com." },
    deal: { ...DEAL, state: "updated", stage: "Lead", at: "Thu 1 Oct, 10:45 · 1.1s", note: "Back to Lead and still open, with “No-show, Thu 1 Oct” on the deal." },
    nurture: { ...NURTURE, state: "paused", journey: "After your call", note: "After your call won’t start: nobody was on it. Before your call went on Wed 30 Sep." },
    receipts: [["Cal.com BOOKING_NO_SHOW_UPDATED, signature checked", "Thu 1 Oct, 10:45"], ["Back in Needs you, out of Meetings", "auto"], ["Deal PX-2288 back to Lead, still open", "Phoenix"], ["AutoSend: After your call held", "paused"]],
    copilot: { draft: {
      paras: ["Sorry we missed each other this morning, Grace. Audit season, I imagine.",
        "If a shorter call is easier, ten minutes works too: cal.com/tomas/20min. Or I can send Mercy the log export to look at first, and we talk after."],
      cites: [], left: ["Doesn’t mention the missed call to Mercy, or send anything automatic: a no-show gets one personal note."] } } },
  "deal-error": { meeting: MEETING,
    deal: { ...DEAL, state: "failed", id: undefined, at: "Yesterday, 16:18", note: "Not in Phoenix yet. The meeting, the thread and the sequence stop are fine.",
      error: { code: "401", text: "invalid_signature", tries: "tried once, 16:18", why: "Someone changed the signing secret in Phoenix, and Corral still signs with the old one. A 401 won’t fix itself, so Corral isn’t retrying." } },
    nurture: NURTURE,
    receipts: [["Cal.com BOOKING_CREATED, signature checked", "Yesterday, 16:18"], ["Cold-room pilot stopped at step 3", "auto"], ["Phoenix refused the deal: 401", "not retried"], ["AutoSend: Before your call", NURTURE.when!]] },
  "deal-duplicate": { meeting: MEETING,
    deal: { ...DEAL, state: "duplicate", id: undefined, at: "Yesterday, 16:18", note: "Phoenix already has Nyota. Corral won’t pick an account or merge deals on its own.",
      dup: { account: "Nyota Beverages Ltd", accountId: "ACC-0192", deal: "PX-2210", dealName: "QA sensors, Dar es Salaam", owner: "Wanjiru Kamau", touched: "Sep 12", stage: "Discovery" } },
    nurture: NURTURE,
    receipts: [["Cal.com BOOKING_CREATED, signature checked", "Yesterday, 16:18"], ["Cold-room pilot stopped at step 3", "auto"], ["Phoenix: Nyota already there (409)", "needs you"], ["AutoSend: Before your call", NURTURE.when!]] },
  "nurture-off": { meeting: MEETING, deal: DEAL,
    nurture: { state: "waiting", journey: "Before your call", when: NURTURE.when, note: "AutoSend isn’t connected, so this email can’t go. Corral won’t send it from your cold mailboxes." },
    receipts: [["Cal.com BOOKING_CREATED, signature checked", "Yesterday, 16:18"], ["Cold-room pilot stopped at step 3", "auto"], ["Deal PX-2288 opened in Phoenix", "Discovery"], ["AutoSend not connected: Before your call waits", "needs you"]] },
};

/** The handoff for a review state; the live app (and every non-handoff state) shows the booking. */
export function handoffFor(state?: HandoffReviewState): HandoffModel {
  const key = state ?? "meeting-booked";
  const h = HANDOFFS[key];
  return { key, ...h, after: afterMeeting(h.meeting.status, { autosend: key !== "nurture-off" }) };
}

/* ------------------------------------------------------------ the three connections */
export type IntegrationModel = {
  id: IntegrationId; name: string; role: string; tile: string; what: string; does: string[];
  account: [string, string][]; last: string;
};
export const INTEGRATIONS: IntegrationModel[] = [
  { id: "cal", name: "Cal.com", role: "Meetings", tile: "Ca",
    what: "Your booking link goes in Corral’s drafts. When someone books, moves, cancels or misses a meeting, the thread and the lead know within seconds.",
    does: ["A booking stops the sequence and moves the thread to Meetings", "A move updates the meeting everywhere, including the deal in Phoenix", "A cancel or a no-show brings the thread back to Needs you with a note to send"],
    account: [["Connected as", "tomas@coldtrace.io · Tomás Ibarra"], ["Link in drafts", "20 min intro · cal.com/tomas/20min"], ["Listens for", "BOOKING_CREATED · BOOKING_RESCHEDULED · BOOKING_CANCELLED · BOOKING_NO_SHOW_UPDATED · AFTER_HOSTS_CAL_VIDEO_NO_SHOW · AFTER_GUESTS_CAL_VIDEO_NO_SHOW"], ["Signed", "Every delivery checked against X-Cal-Signature-256; unsigned or wrong is rejected"], ["Since", "Sep 14"]],
    last: "BOOKING_CREATED · Yesterday, 16:18" },
  { id: "phoenix", name: "Phoenix ERP", role: "Deals", tile: "Px",
    what: "When a meeting is booked, Corral opens a deal in Phoenix and keeps it in step. When Phoenix marks a deal won or lost, Corral stops writing to that company.",
    does: ["Booked: opens a deal at Discovery with the meeting, the people and the fit", "Moved: updates the meeting time on the same deal", "Cancelled or no-show: back to Lead, never closed or deleted", "Won or lost in Phoenix: every sequence for that company stops"],
    account: [["Sends to", ERP_URL], ["Signing secret", "whsec_••••9f2c · HMAC-SHA256 · set Sep 14"], ["Phoenix sends back", "Stage changes, signed with the same secret"], ["Since", "Sep 14"]],
    last: "deal.create PX-2288 · Yesterday, 16:18" },
  { id: "autosend", name: "AutoSend", role: "Follow-up mail", tile: "As",
    what: "Once someone replies or books, the mail that isn’t one person to one person (a reminder, a case study, onboarding) goes through AutoSend from your sending domain, with an unsubscribe link. Cold email never does.",
    does: ["Booked: adds the guests to Before your call (one email, 24 hours before)", "Meeting ended: starts After your call (three emails over ten days)", "Cancelled, no-show or unsubscribed: nothing automatic; a person writes"],
    account: [["Project", "ColdTrace"], ["Sends as", `${AUTOSEND_SENDER} · verified`], ["Journeys", "Before your call · After your call"], ["Since", "Sep 16"]],
    last: "event meeting_booked · Yesterday, 16:18" },
];
export const integration = (id: IntegrationId) => INTEGRATIONS.find((i) => i.id === id)!;

/** What each one may do, what it never does, and where its key lives. */
export const SCOPES: Record<IntegrationId, { can: [string, string][]; never: string[]; key: string; revoke: string }> = {
  cal: { can: [["Read your bookings and event types", "to put the right link in drafts and see who booked"], ["Create and remove Corral’s own webhook", "so bookings reach Corral, signed"]],
    never: ["Book, move or cancel a meeting for you", "Read other calendars, notes or recordings", "See bookings on event types Corral doesn’t use"],
    key: "The sign-in token is encrypted and only the worker that reads bookings can open it. It renews itself; if Cal.com revokes it, this page says so and bookings wait.",
    revoke: "You can also remove Corral in Cal.com under Settings → Apps. Corral notices within a minute." },
  phoenix: { can: [["Open and update deals", "one per company and meeting, never two"], ["Create an account and contact", "only when Phoenix has no match, or you choose to"], ["Receive stage changes", "won or lost stops Corral writing to them"]],
    never: ["Delete or close anything in Phoenix", "Read invoices, prices or other customers", "Merge accounts or deals without you choosing"],
    key: "Corral signs every push with HMAC-SHA256 and a timestamp; Phoenix checks both and drops anything older than five minutes. The secret is shown once, when it’s made.",
    revoke: "Rotate the secret here and paste it into Phoenix; the old one keeps working for 24 hours so nothing drops." },
  autosend: { can: [["Add and update contacts", "only people who replied or booked"], ["Send the events that start your journeys", "meeting_booked, meeting_ended"], ["Read sends, opens and unsubscribes", "for those contacts, back into the thread"]],
    never: ["Send cold email, or email anyone who hasn’t replied or booked", "Import your lead table", "Change your templates or journeys"],
    key: "Connected with AutoSend sign-in, limited to the ColdTrace project. The token is encrypted; revoking it in AutoSend stops the handoff within a minute.",
    revoke: "An unsubscribe in AutoSend also stops every Corral sequence for that person." },
};

/* ------------------------------------------------------------ connection state per review state */
export type SettingsSeed = {
  conn: Record<IntegrationId, Connection>; open?: IntegrationId; tab: "overview" | "mapping" | "logs" | "scopes";
  dialog?: "connect-cal" | "connecting" | "connect-erp" | "connect-erp-failed" | "connect-autosend" | "disconnect";
  load?: "loading" | "error"; mapErrors?: boolean; logOpen?: string;
};
const ALL: Record<IntegrationId, Connection> = { cal: "connected", phoenix: "connected", autosend: "connected" };
export function settingsSeed(s?: SettingsReviewState): SettingsSeed {
  const base: SettingsSeed = { conn: ALL, tab: "overview" };
  switch (s) {
    case undefined: case "integrations": return base;
    case "none": return { ...base, conn: { cal: "off", phoenix: "off", autosend: "off" } };
    case "connect-cal": return { ...base, conn: { ...ALL, cal: "off" }, dialog: "connect-cal" };
    case "connecting": return { ...base, conn: { ...ALL, cal: "connecting" }, dialog: "connecting" };
    case "connect-erp": return { ...base, conn: { ...ALL, phoenix: "off" }, dialog: "connect-erp" };
    case "connect-erp-failed": return { ...base, conn: { ...ALL, phoenix: "off" }, dialog: "connect-erp-failed" };
    case "connect-autosend": return { ...base, conn: { ...ALL, autosend: "off" }, dialog: "connect-autosend" };
    case "connected": return { ...base, open: "cal" };
    case "reauth": return { ...base, conn: { ...ALL, cal: "reauth" }, open: "cal" };
    case "error": return { ...base, conn: { ...ALL, phoenix: "error" }, open: "phoenix" };
    case "disconnect": return { ...base, open: "phoenix", dialog: "disconnect" };
    case "logs": return { ...base, conn: { ...ALL, phoenix: "error" }, open: "phoenix", tab: "logs", logOpen: "p1" };
    case "mapping": return { ...base, open: "phoenix", tab: "mapping" };
    case "mapping-errors": return { ...base, open: "phoenix", tab: "mapping", mapErrors: true };
    case "scopes": return { ...base, open: "cal", tab: "scopes" };
    case "autosend": return { ...base, open: "autosend" };
    case "loading": return { ...base, load: "loading" };
    case "load-error": return { ...base, load: "error" };
    // M13: Team and Billing pick their own section (sectionFor); the integrations seed stays at rest.
    case "team": case "team-solo": case "team-invite": case "team-loading":
    case "billing": case "billing-loading": return base;
    // M14: the live detail page reads liveSeed(); the M8 list stays at rest behind it.
    case "int-connected": case "int-quiet": case "int-quiet-cal": case "int-mapping": case "int-logs": case "int-logs-loading":
    case "int-expired": case "int-reconnecting": return base;
  }
}

/** What a connection that needs you says, on the list row and at the top of its page. */
export const PROBLEM: Partial<Record<IntegrationId, { title: string; body: string; action: string }>> = {
  cal: { title: "Cal.com’s sign-in expired at 06:40.", body: "Bookings still arrive and are kept, but Corral can’t read who booked, so 1 booking from 07:55 is waiting. Reconnect and it catches up; nothing is lost.", action: "Reconnect Cal.com" },
  phoenix: { title: "Phoenix is refusing deals: 401 invalid_signature since 08:12.", body: "Phoenix’s signing secret changed at 08:00 and Corral still signs with the old one. 2 deals are waiting; Corral isn’t retrying, because a 401 won’t fix itself. Paste the new secret, then replay them.", action: "Update the secret" },
};

/* ------------------------------------------------------------ logs */
const REQ = (event: string, key: string, body: string) => `POST ${ERP_URL}\nX-Corral-Event: ${event}\nX-Corral-Timestamp: 1790841124\nX-Corral-Signature: sha256=•••• (redacted)\nIdempotency-Key: ${key}\n\n${body}`;
export const LOGS: Record<IntegrationId, LogRow[]> = {
  phoenix: [
    { id: "p1", at: "08:12:04", dir: "out", event: "deal.create", subject: "Juma Magesa · Mwanza Fish", code: "401", result: "failed", ms: 310, attempt: "not retried",
      detail: { request: REQ("deal.create", "corral:deal:mwanza:bk_Q81xRr", `{ "account.name": "Mwanza Fish Processors", "contact.email": "rehema@mwanzafish.co.tz", "deal.stage": "Discovery", … }`),
        response: `401 Unauthorized\n{ "error": "invalid_signature", "hint": "signature does not match PHOENIX_ERP_SECRET" }`,
        why: "Phoenix’s secret changed at 08:00. Paste the new one (Update the secret), then Replay: the same idempotency key means Phoenix can’t open it twice.", key: "corral:deal:mwanza:bk_Q81xRr" } },
    { id: "p2", at: "08:12:01", dir: "out", event: "deal.update", subject: "Wanjiru Mwangi · Kilima", code: "401", result: "failed", ms: 290, attempt: "not retried" },
    { id: "p3", at: "Yesterday 16:18", dir: "out", event: "deal.create", subject: "Grace Holloway · Nyota", code: "201", result: "ok", ms: 1400,
      detail: { request: REQ("deal.create", "corral:deal:nyota:bk_7Hq2Lw", `{ "account.name": "Nyota Beverages", "contact.email": "grace@nyota.co.tz", "deal.stage": "Discovery", "deal.next_meeting_at": "2026-10-01T07:30:00Z", … }`),
        response: `201 Created\n{ "deal_id": "PX-2288", "account_id": "ACC-0207" }`, key: "corral:deal:nyota:bk_7Hq2Lw" } },
    { id: "p4", at: "Sep 27 11:02", dir: "in", event: "stage.changed", subject: "PX-2241 → Won · Mara Cold Stores", code: "200", result: "ok", ms: 40 },
    { id: "p5", at: "Sep 26 09:30", dir: "out", event: "deal.create", subject: "Lena Fischer · Mara Cold", code: "503", result: "ok", ms: 2100, attempt: "2 of 6, delivered" },
  ],
  cal: [
    { id: "c1", at: "Yesterday 16:18", dir: "in", event: "BOOKING_CREATED", subject: "Grace Holloway · Thu 1 Oct 10:30", code: "200", result: "ok", ms: 60 },
    { id: "c2", at: "Yesterday 16:18", dir: "in", event: "BOOKING_CREATED", subject: "Grace Holloway · bk_7Hq2Lw", code: "200", result: "duplicate", ms: 12 },
    { id: "c3", at: "Sep 27 03:11", dir: "in", event: "BOOKING_CREATED", subject: "no signature", code: "401", result: "rejected", ms: 4,
      detail: { request: "POST https://api.corral.app/hooks/cal/ws_coldtrace\n(no X-Cal-Signature-256)", response: "401 Unauthorized", why: "Unsigned deliveries are never read. If this was really Cal.com, a signed retry would follow; none did." } },
    { id: "c4", at: "Sep 24 14:40", dir: "in", event: "BOOKING_CANCELLED", subject: "Daniel Weber · Fri 25 Sep", code: "200", result: "ok", ms: 55 },
  ],
  autosend: [
    { id: "a1", at: "Yesterday 16:18", dir: "out", event: "contact.upsert", subject: "grace@nyota.co.tz, mercy@nyota.co.tz", code: "200", result: "ok", ms: 180 },
    { id: "a2", at: "Yesterday 16:18", dir: "out", event: "event meeting_booked", subject: "Before your call · Wed 30 Sep 10:30", code: "202", result: "ok", ms: 90 },
    { id: "a3", at: "Sep 28 09:05", dir: "in", event: "unsubscribed", subject: "neema@dodomadairy.co.tz", code: "200", result: "ok", ms: 30 },
  ],
};

/* ------------------------------------------------------------ Phoenix field mapping */
export const ERP_FIELDS: ErpField[] = [
  { id: "account.name", label: "Account name", type: "text", required: true },
  { id: "account.website", label: "Website", type: "url" },
  { id: "account.country", label: "Country", type: "text" },
  { id: "contact.name", label: "Contact name", type: "text", required: true },
  { id: "contact.email", label: "Contact email", type: "email", required: true },
  { id: "contact.title", label: "Contact title", type: "text" },
  { id: "deal.stage", label: "Stage", type: "text", required: true },
  { id: "deal.owner_id", label: "Deal owner", type: "user", required: true },
  { id: "deal.next_meeting_at", label: "Next meeting", type: "datetime" },
  { id: "deal.custom.fit_score", label: "Fit score", type: "number" },
  { id: "deal.source", label: "Source", type: "text" },
  { id: "deal.custom.corral_url", label: "Corral link", type: "url" },
];
export const CORRAL_FIELDS: CorralField[] = [
  { id: "company", label: "Company", type: "text" }, { id: "domain", label: "Website", type: "url" }, { id: "country", label: "Country", type: "text" },
  { id: "person", label: "Person", type: "text" }, { id: "email", label: "Email", type: "email" }, { id: "title", label: "Title", type: "text" },
  { id: "stage", label: "Stage (from the meeting)", type: "text" }, { id: "owner", label: "Mailbox owner", type: "user" },
  { id: "meeting", label: "Meeting time (UTC)", type: "datetime" }, { id: "fit", label: "Fit score", type: "number" },
  { id: "source", label: "Sequence and step", type: "text" }, { id: "thread", label: "Thread link", type: "url" },
];
export const MAPPING: MapRow[] = [
  { erp: "account.name", from: "company" }, { erp: "account.website", from: "domain" }, { erp: "account.country", from: "country" },
  { erp: "contact.name", from: "person" }, { erp: "contact.email", from: "email" }, { erp: "contact.title", from: "title" },
  { erp: "deal.stage", from: "stage" }, { erp: "deal.owner_id", from: "owner" }, { erp: "deal.next_meeting_at", from: "meeting" },
  { erp: "deal.custom.fit_score", from: "fit" }, { erp: "deal.source", from: "source" }, { erp: "deal.custom.corral_url", from: "thread" },
];
/** mapping-errors: Phoenix added a required owner field nobody filled, and fit goes into a text field by mistake. */
export const MAPPING_BROKEN: MapRow[] = MAPPING.map((r) => (r.erp === "deal.owner_id" ? { erp: r.erp } : r.erp === "deal.source" ? { erp: r.erp, from: "fit" } : r.erp === "deal.custom.fit_score" ? { erp: r.erp, from: "source" } : r));
/** What each Corral field holds for Grace (the payload preview). */
export const GRACE_VALUES: Record<string, string | number> = {
  company: "Nyota Beverages", domain: "https://nyota.co.tz", country: "Tanzania", person: "Grace Holloway", email: "grace@nyota.co.tz", title: "VP Operations",
  stage: "Discovery", owner: "usr_14 · Tomás Ibarra", meeting: "2026-10-01T07:30:00Z", fit: 84, source: "Corral · Cold-room pilot · step 3", thread: "https://app.corral.app/t/grace-nyota",
};
/** Corral’s meeting stages → Phoenix’s. Won and Lost only ever come the other way. */
export const STAGE_MAP: [string, ErpStage, string][] = [
  ["Meeting booked", "Discovery", "new deal"], ["Meeting moved", "Discovery", "same deal, new time"], ["Meeting cancelled", "Lead", "kept open"], ["No-show", "Lead", "kept open"],
];

/* ------------------------------------------------------------ M14: a connected integration from real data */
/** Review placeholders for the live detail page: example.com addresses, booking and deal ids, never a person or company.
 *  Times are minutes before the real clock, so "18 min ago" stays true whenever the review is opened. */
type LogSeed = Omit<IntegrationLog, "at"> & { ago: number };
const H = 60, D = 24 * H;
const LIVE_LOGS: Record<IntegrationId, LogSeed[]> = {
  cal: [
    { id: "c1", ago: 18, dir: "in", event: "BOOKING_CREATED", result: "ok", detail: "bk_7Hq2Lw · signature checked" },
    { id: "c2", ago: 2 * H + 5, dir: "in", event: "BOOKING_RESCHEDULED", result: "ok", detail: "bk_5Tn1Pa · new time saved" },
    { id: "c3", ago: D + 40, dir: "in", event: "BOOKING_CREATED", result: "duplicate", detail: "bk_7Hq2Lw · already received" },
    { id: "c4", ago: 2 * D + 3 * H, dir: "in", event: "BOOKING_CANCELLED", result: "ok", detail: "bk_2Wd8Ke · thread back in Needs you" },
    { id: "c5", ago: 3 * D, dir: "in", event: "PING", result: "ok", detail: "Webhook check from Cal.com" },
  ],
  phoenix: [
    { id: "p1", ago: 6, dir: "out", event: "deal.create", result: "failed", detail: "401 invalid_signature · not retried" },
    { id: "p2", ago: 40, dir: "out", event: "deal.create", result: "retrying", detail: "503 · try 2 of 6" },
    { id: "p3", ago: 3 * H, dir: "out", event: "deal.update", result: "ok", detail: "PX-2288 · next meeting moved" },
    { id: "p4", ago: D + 2 * H, dir: "in", event: "stage.changed", result: "ok", detail: "PX-2241 → Won · sequences stopped" },
    { id: "p5", ago: D + 5 * H, dir: "out", event: "deal.create", result: "ok", detail: "PX-2288 · opened at Discovery" },
  ],
  autosend: [],
};
const EXPIRED_CAL: LogSeed[] = [
  { id: "x1", ago: 25, dir: "in", event: "BOOKING_CREATED", result: "failed", detail: "401 token_expired · kept, catches up on reconnect" },
  ...LIVE_LOGS.cal.slice(1).map((r) => ({ ...r, ago: r.ago + 2 * H })),
];
const LIVE_ACCOUNT: Record<IntegrationId, IntegrationAccount> = {
  cal: { name: "Your Cal.com account", email: "you@example.com" },
  phoenix: { name: "erp.example.com" },
  autosend: { name: "Your AutoSend project", email: "you@example.com" },
};
const LIVE_SINCE: Record<IntegrationId, number> = { cal: 19 * D, phoenix: 19 * D, autosend: 17 * D };
const iso = (now: Date, ago: number) => new Date(now.getTime() - ago * 60_000).toISOString();

export type LiveSeed = { open: IntegrationId; tab: SettingsSeed["tab"]; detail: IntegrationDetail };
/** M14 review states → the live detail page. `connectedById: "me"` reads as the signed-in person. */
export function liveSeed(s: SettingsReviewState | undefined, at: Date): LiveSeed | undefined {
  // Whole minutes, so the server's render and the browser's agree on every time.
  const now = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  const d = (id: IntegrationId, logs: LogSeed[] | "loading", more: Partial<IntegrationDetail> = {}): IntegrationDetail => ({
    id, account: LIVE_ACCOUNT[id], connectedAt: iso(now, LIVE_SINCE[id]), connectedById: "me",
    logs: logs === "loading" ? "loading" : logs.map(({ ago, ...r }) => ({ ...r, at: iso(now, ago) })), ...more,
  });
  switch (s) {
    case "int-connected": return { open: "cal", tab: "overview", detail: d("cal", LIVE_LOGS.cal) };
    case "int-quiet": return { open: "autosend", tab: "overview", detail: d("autosend", []) };
    case "int-quiet-cal": return { open: "cal", tab: "overview", detail: d("cal", []) };
    case "int-mapping": return { open: "phoenix", tab: "mapping", detail: d("phoenix", [], { mapping: null }) };
    case "int-logs": return { open: "phoenix", tab: "logs", detail: d("phoenix", LIVE_LOGS.phoenix, { mapping: null }) };
    case "int-logs-loading": return { open: "phoenix", tab: "logs", detail: d("phoenix", "loading", { mapping: null }) };
    case "int-expired": return { open: "cal", tab: "overview", detail: d("cal", EXPIRED_CAL, { problem: { kind: "token-expired", since: iso(now, 2 * H + 10), code: "401 token_expired" } }) };
    case "int-reconnecting": return { open: "cal", tab: "overview", detail: d("cal", EXPIRED_CAL, { problem: { kind: "token-expired", since: iso(now, 2 * H + 10) }, reconnecting: true }) };
    default: return undefined;
  }
}
