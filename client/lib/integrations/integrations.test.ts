import { describe, expect, it } from "vitest";
import { dealPayload, filterLogs, fits, healthOf, isProblem, mappingIssues, redact, urlProblem, type CorralField, type ErpField, type LogRow, type MapRow } from "./integrations";
import { SETTINGS_REVIEW_STATES, settingsReviewState } from "./state";

describe("health", () => {
  it("says who needs you", () => {
    expect(healthOf("connected")).toMatchObject({ word: "Connected", needsYou: false });
    expect(healthOf("reauth")).toMatchObject({ word: "Needs sign-in", tone: "caution", needsYou: true });
    expect(healthOf("error")).toMatchObject({ tone: "negative", needsYou: true });
    expect(healthOf("off").word).toBe("Not connected");
    expect(healthOf("connecting").tone).toBe("live");
  });
});

describe("secrets and addresses", () => {
  it("redacts to the last four", () => {
    expect(redact("whsec_3kP09aLq9f2c")).toBe("whsec_••••9f2c");
    expect(redact("abcd")).toBe("••••");
    expect(redact("plainsecret1234")).toBe("••••1234");
  });
  it("only pushes to a public https address without credentials", () => {
    expect(urlProblem("https://erp.coldtrace.io/api/webhooks/corral")).toBeNull();
    expect(urlProblem("")).toMatch(/Paste/);
    expect(urlProblem("erp.coldtrace.io")).toMatch(/https/);
    expect(urlProblem("http://erp.coldtrace.io/x")).toMatch(/plain http/);
    expect(urlProblem("https://u:p@erp.coldtrace.io/x")).toMatch(/password/);
    expect(urlProblem("https://localhost:4000/x")).toMatch(/private/);
  });
});

const ERP: ErpField[] = [
  { id: "account.name", label: "Account name", type: "text", required: true },
  { id: "contact.email", label: "Contact email", type: "email", required: true },
  { id: "deal.owner_id", label: "Deal owner", type: "user", required: true },
  { id: "deal.fit_score", label: "Fit score", type: "number" },
  { id: "deal.next_meeting_at", label: "Next meeting", type: "datetime" },
];
const CORRAL: CorralField[] = [
  { id: "company", label: "Company", type: "text" }, { id: "email", label: "Email", type: "email" }, { id: "owner", label: "Mailbox owner", type: "user" },
  { id: "fit", label: "Fit score", type: "number" }, { id: "meeting", label: "Meeting time", type: "datetime" },
];

describe("mapping", () => {
  it("anything goes into text; types must match otherwise", () => {
    expect(fits("number", "text")).toBe(true);
    expect(fits("text", "number")).toBe(false);
  });
  it("is clean when every required field is filled with the right type", () => {
    const rows: MapRow[] = [{ erp: "account.name", from: "company" }, { erp: "contact.email", from: "email" }, { erp: "deal.owner_id", from: "owner" }, { erp: "deal.fit_score", from: "fit" }];
    expect(mappingIssues(rows, ERP, CORRAL)).toEqual([]);
  });
  it("names an empty required field, a type clash and a double use", () => {
    const rows: MapRow[] = [{ erp: "account.name", from: "company" }, { erp: "contact.email", from: "email" }, { erp: "deal.fit_score", from: "company" }, { erp: "deal.next_meeting_at", from: "meeting" }];
    const issues = mappingIssues(rows, ERP, CORRAL);
    expect(issues.map((i) => [i.erp, i.kind])).toEqual([["deal.owner_id", "unmapped"], ["deal.fit_score", "type"], ["deal.fit_score", "twice"]]);
    expect(issues[0].text).toMatch(/needs Deal owner/);
  });
  it("sending as text clears a type clash", () => {
    const rows: MapRow[] = [{ erp: "account.name", from: "fit", as: "text" }, { erp: "contact.email", from: "email" }, { erp: "deal.owner_id", from: "owner" }];
    expect(mappingIssues(rows, ERP, CORRAL)).toEqual([]);
  });
  it("builds the payload Phoenix gets, and says what's missing", () => {
    const rows: MapRow[] = [{ erp: "account.name", from: "company" }, { erp: "contact.email", from: "email" }, { erp: "deal.fit_score", from: "fit", as: "text" }, { erp: "deal.next_meeting_at", from: "meeting" }];
    const p = dealPayload(rows, { company: "Nyota Beverages", email: "grace@nyota.co.tz", fit: 84, meeting: "" }, ERP);
    expect(p.body).toEqual({ "account.name": "Nyota Beverages", "contact.email": "grace@nyota.co.tz", "deal.fit_score": "84" });
    expect(p.missing).toEqual(["deal.owner_id"]);
  });
});

describe("logs", () => {
  const rows: LogRow[] = [
    { id: "1", at: "08:12", dir: "out", event: "deal.update", subject: "PX-2288", code: "401", result: "retrying" },
    { id: "2", at: "16:18", dir: "out", event: "deal.create", subject: "PX-2288", code: "201", result: "ok" },
    { id: "3", at: "11:02", dir: "in", event: "stage.changed", subject: "PX-2241", code: "200", result: "ok" },
    { id: "4", at: "10:40", dir: "in", event: "BOOKING_CREATED", subject: "?", code: "401", result: "rejected" },
    { id: "5", at: "10:41", dir: "in", event: "BOOKING_CREATED", subject: "bk_1", code: "200", result: "duplicate" },
  ];
  it("filters to problems, or one direction", () => {
    expect(filterLogs(rows, "all")).toHaveLength(5);
    expect(filterLogs(rows, "problems").map((r) => r.id)).toEqual(["1", "4"]);
    expect(filterLogs(rows, "in").map((r) => r.id)).toEqual(["3", "4", "5"]);
    expect(filterLogs(rows, "out")).toHaveLength(2);
    expect(isProblem(rows[4])).toBe(false);
  });
});

describe("settings review states", () => {
  it("only on view=settings, only with review states on", () => {
    expect(SETTINGS_REVIEW_STATES).toHaveLength(32);
    expect(settingsReviewState("settings", "logs", true)).toBe("logs");
    expect(settingsReviewState("settings", "nope", true)).toBeUndefined();
    expect(settingsReviewState("unibox", "logs", true)).toBeUndefined();
    expect(settingsReviewState("settings", "logs", false)).toBeUndefined();
  });
});
