/**
 * Handoffs (M8, ENG-58): what Corral does when a meeting is booked, moved, cancelled or missed, and how
 * the lead moves on to Phoenix ERP (the deal) and AutoSend (follow-up mail that isn’t cold).
 * Plain module: no React. The design data, the review states and the build (ENG-76 / ENG-86) share it.
 */

export type MeetingStatus = "booked" | "rescheduled" | "cancelled" | "no-show";
/** Where the deal is in Phoenix ERP. */
export type DealState = "pushed" | "updated" | "retrying" | "failed" | "duplicate" | "off";
/** Where the lead is in AutoSend. */
export type NurtureState = "scheduled" | "moved" | "stopped" | "paused" | "waiting" | "off";

/** The Cal.com webhook trigger behind each meeting status (Cal.com’s own names). */
export const CAL_TRIGGER: Record<MeetingStatus, string> = {
  booked: "BOOKING_CREATED", rescheduled: "BOOKING_RESCHEDULED", cancelled: "BOOKING_CANCELLED", "no-show": "BOOKING_NO_SHOW_UPDATED",
};
/**
 * Every Cal.com trigger Corral listens to, and the status it means. A no-show comes two ways, treated the same:
 * the host marks it (BOOKING_NO_SHOW_UPDATED), or Cal Video reports that the hosts or the guests never joined.
 */
export const CAL_TRIGGERS: Record<string, MeetingStatus> = {
  BOOKING_CREATED: "booked", BOOKING_RESCHEDULED: "rescheduled", BOOKING_CANCELLED: "cancelled",
  BOOKING_NO_SHOW_UPDATED: "no-show", AFTER_HOSTS_CAL_VIDEO_NO_SHOW: "no-show", AFTER_GUESTS_CAL_VIDEO_NO_SHOW: "no-show",
};
/** The meeting status a Cal.com trigger means; undefined for triggers Corral ignores. */
export const statusForTrigger = (trigger: string): MeetingStatus | undefined => CAL_TRIGGERS[trigger];
export const MEETING_WORD: Record<MeetingStatus, string> = { booked: "Booked", rescheduled: "Moved", cancelled: "Cancelled", "no-show": "No-show" };

/** Phoenix’s own deal stages (a sample ERP; the mapping in settings can point anywhere). */
export type ErpStage = "Lead" | "Discovery" | "Proposal" | "Won" | "Lost";
/** The stage each meeting status sets on the deal. Cancelled and no-show keep the deal open: a person decides. */
export const STAGE_FOR: Record<MeetingStatus, ErpStage> = { booked: "Discovery", rescheduled: "Discovery", cancelled: "Lead", "no-show": "Lead" };

export type After = {
  /** The cold sequence: booking stops it; nothing restarts it on its own. */
  sequence: "stop" | "stays stopped";
  /** Which Unibox tab the thread sits in (it’s in Needs you either way until handled). */
  tab: "meetings" | "needs";
  deal: { action: "create" | "update"; stage: ErpStage; note: string };
  nurture: NurtureState;
  /** Corral drafts a personal note (from the thread’s mailbox, not AutoSend). */
  draft: boolean;
};

/**
 * The rule for each Cal.com event (HANDOFF §16 decisions 2–5).
 * `autosend`: AutoSend is connected. Without it the "before your call" email waits; cold mailboxes never send it.
 */
export function afterMeeting(s: MeetingStatus, o: { autosend: boolean }): After {
  const nurture = (n: NurtureState): NurtureState => (o.autosend ? n : n === "scheduled" || n === "moved" ? "waiting" : "off");
  switch (s) {
    case "booked": return { sequence: "stop", tab: "meetings", deal: { action: "create", stage: STAGE_FOR.booked, note: "Opens the deal with the meeting time" }, nurture: nurture("scheduled"), draft: false };
    case "rescheduled": return { sequence: "stays stopped", tab: "meetings", deal: { action: "update", stage: STAGE_FOR.rescheduled, note: "Moves the meeting time on the deal" }, nurture: nurture("moved"), draft: false };
    case "cancelled": return { sequence: "stays stopped", tab: "needs", deal: { action: "update", stage: STAGE_FOR.cancelled, note: "Keeps the deal open, back to Lead" }, nurture: nurture("stopped"), draft: true };
    case "no-show": return { sequence: "stays stopped", tab: "needs", deal: { action: "update", stage: STAGE_FOR["no-show"], note: "Keeps the deal open, marks the no-show" }, nurture: nurture("paused"), draft: true };
  }
}

/**
 * When the "before your call" email goes: 24 hours before the meeting, moved back to Friday at the same time
 * when that lands on a weekend. Local wall-clock (the attendee’s), so no time-zone maths here.
 */
export function beforeCall(meeting: Date): Date {
  const d = new Date(meeting.getTime() - 24 * 3600 * 1000);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() - 1);
  if (day === 0) d.setDate(d.getDate() - 2);
  return d;
}

/** Retries for a failed push: 1, 5, 30 min, 2 h, 6 h; after the fifth failure it needs you. */
export const RETRY_MINUTES = [1, 5, 30, 120, 360] as const;
export function nextRetry(failures: number): { inMinutes: number; attempt: number; of: number } | null {
  if (failures < 1 || failures > RETRY_MINUTES.length) return null;
  return { inMinutes: RETRY_MINUTES[failures - 1], attempt: failures + 1, of: RETRY_MINUTES.length + 1 };
}
export const retryWords = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

/** A 4xx other than 408/429 won’t fix itself: retrying sends the same thing and gets the same answer. */
export function retryable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429 || status === 0;
}

/**
 * The key Corral sends with every push, so a retry or a replay can’t open a second deal.
 * One per lead and meeting: the booking uid, not the event (a reschedule updates the same deal).
 */
export function idempotencyKey(leadId: string, bookingUid: string, action: "create" | "update", version = 1): string {
  return action === "create" ? `corral:deal:${leadId}:${bookingUid}` : `corral:deal:${leadId}:${bookingUid}:v${version}`;
}
