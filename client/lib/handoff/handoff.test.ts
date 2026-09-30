import { describe, expect, it } from "vitest";
import { CAL_TRIGGER, RETRY_MINUTES, STAGE_FOR, afterMeeting, statusForTrigger, beforeCall, idempotencyKey, nextRetry, retryWords, retryable } from "./handoff";
import { HANDOFF_REVIEW_STATES, isHandoffState } from "./state";

describe("afterMeeting", () => {
  it("booked: stops the sequence, opens the deal, sets the before-your-call email", () => {
    const a = afterMeeting("booked", { autosend: true });
    expect(a).toMatchObject({ sequence: "stop", tab: "meetings", deal: { action: "create", stage: "Discovery" }, nurture: "scheduled", draft: false });
  });
  it("rescheduled: updates the same deal and moves the email", () => {
    expect(afterMeeting("rescheduled", { autosend: true })).toMatchObject({ sequence: "stays stopped", deal: { action: "update", stage: "Discovery" }, nurture: "moved", draft: false });
  });
  it("cancelled and no-show keep the deal open and hand it to a person", () => {
    const c = afterMeeting("cancelled", { autosend: true });
    const n = afterMeeting("no-show", { autosend: true });
    expect(c).toMatchObject({ tab: "needs", deal: { stage: "Lead" }, nurture: "stopped", draft: true });
    expect(n).toMatchObject({ tab: "needs", deal: { stage: "Lead" }, nurture: "paused", draft: true });
    expect(STAGE_FOR.cancelled).not.toBe("Lost");
  });
  it("without AutoSend, the email waits (never from a cold mailbox) and nothing else changes", () => {
    expect(afterMeeting("booked", { autosend: false }).nurture).toBe("waiting");
    expect(afterMeeting("rescheduled", { autosend: false }).nurture).toBe("waiting");
    expect(afterMeeting("cancelled", { autosend: false }).nurture).toBe("off");
    expect(afterMeeting("booked", { autosend: false }).deal.action).toBe("create");
  });
  it("names Cal.com's triggers", () => {
    expect(Object.values(CAL_TRIGGER)).toEqual(["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED", "BOOKING_NO_SHOW_UPDATED"]);
  });
  it("treats a host-marked no-show and Cal Video's own no-shows the same; ignores the rest", () => {
    expect(["BOOKING_NO_SHOW_UPDATED", "AFTER_HOSTS_CAL_VIDEO_NO_SHOW", "AFTER_GUESTS_CAL_VIDEO_NO_SHOW"].map(statusForTrigger)).toEqual(["no-show", "no-show", "no-show"]);
    expect(Object.values(CAL_TRIGGER).map(statusForTrigger)).toEqual(["booked", "rescheduled", "cancelled", "no-show"]);
    expect(statusForTrigger("MEETING_STARTED")).toBeUndefined();
  });
});

describe("beforeCall", () => {
  it("is 24 hours before", () => {
    expect(beforeCall(new Date(2026, 9, 1, 10, 30))).toEqual(new Date(2026, 8, 30, 10, 30));
  });
  it("moves off the weekend to Friday, same time", () => {
    expect(beforeCall(new Date(2026, 9, 5, 14, 0))).toEqual(new Date(2026, 9, 2, 14, 0)); // Mon → Sun → Fri
    expect(beforeCall(new Date(2026, 9, 4, 9, 0))).toEqual(new Date(2026, 9, 2, 9, 0)); // Sun → Sat → Fri
  });
});

describe("retries", () => {
  it("backs off 1, 5, 30 min, 2 h, 6 h, then stops", () => {
    expect(RETRY_MINUTES).toEqual([1, 5, 30, 120, 360]);
    expect(nextRetry(3)).toEqual({ inMinutes: 30, attempt: 4, of: 6 });
    expect(nextRetry(0)).toBeNull();
    expect(nextRetry(6)).toBeNull();
    expect(retryWords(30)).toBe("30 min");
    expect(retryWords(120)).toBe("2 h");
  });
  it("only retries what can fix itself", () => {
    expect(retryable(503)).toBe(true);
    expect(retryable(429)).toBe(true);
    expect(retryable(0)).toBe(true);
    expect(retryable(422)).toBe(false);
    expect(retryable(401)).toBe(false);
  });
  it("one idempotency key per lead and booking", () => {
    expect(idempotencyKey("nyota", "bk_7Hq2", "create")).toBe("corral:deal:nyota:bk_7Hq2");
    expect(idempotencyKey("nyota", "bk_7Hq2", "update", 2)).toBe("corral:deal:nyota:bk_7Hq2:v2");
  });
});

describe("handoff review states", () => {
  it("are the same names in the thread and on the lead", () => {
    expect(HANDOFF_REVIEW_STATES).toHaveLength(7);
    expect(isHandoffState("meeting-no-show")).toBe(true);
    expect(isHandoffState("detail")).toBe(false);
    expect(isHandoffState(undefined)).toBe(false);
  });
});
