import { describe, expect, it } from "vitest";
import { NO_FILTERS, TRIAGE, filterThreads, isFiltered, step, toggleTriage, triageByKey, triageCounts, triageDef, triageOf, triageOfStatus, type Filterable } from "./triage";

const list: Filterable[] = [
  { id: "a", status: "Interested", unread: true },
  { id: "b", status: "Objection" },
  { id: "c", status: "Meeting booked", unread: true },
  { id: "d", status: "OOO", handled: true },
  { id: "e", status: "Interested", triage: "referral" },
];

describe("triage", () => {
  it("has six kinds on keys 1–6; OOO, unsubscribe and bounce are handled by Corral", () => {
    expect(TRIAGE.map((t) => t.key)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(TRIAGE.filter((t) => t.handled).map((t) => t.id)).toEqual(["ooo", "unsubscribe", "bounce"]);
    expect(triageByKey("5")?.status).toBe("Unsubscribed");
    expect(triageByKey("7")).toBeUndefined();
    expect(triageDef("bounce").status).toBe("Bounced");
  });
  it("maps statuses, and an explicit triage wins", () => {
    expect(triageOfStatus("Referral")).toBe("referral");
    expect(triageOfStatus("Meeting booked")).toBeUndefined();
    expect(triageOf(list[4])).toBe("referral");
  });
  it("filters by triage and unread, counts per kind", () => {
    expect(filterThreads(list, NO_FILTERS)).toHaveLength(5);
    expect(filterThreads(list, { triage: ["interested"], unread: false }).map((t) => t.id)).toEqual(["a"]);
    expect(filterThreads(list, { triage: [], unread: true }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterThreads(list, { triage: ["interested", "objection"], unread: true }).map((t) => t.id)).toEqual(["a"]);
    expect(triageCounts(list)).toEqual({ interested: 1, objection: 1, referral: 1, ooo: 1, unsubscribe: 0, bounce: 0 });
  });
  it("toggles chips and knows when anything is filtered", () => {
    const f = toggleTriage(NO_FILTERS, "ooo");
    expect(f.triage).toEqual(["ooo"]);
    expect(isFiltered(f)).toBe(true);
    expect(toggleTriage(f, "ooo").triage).toEqual([]);
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ triage: [], unread: true })).toBe(true);
  });
  it("steps J / K through the list, wrapping", () => {
    expect(step(list, "a", 1)).toBe("b");
    expect(step(list, "a", -1)).toBe("e");
    expect(step(list, "e", 1)).toBe("a");
    expect(step(list, "gone", 1)).toBe("a");
    expect(step([], "a", 1)).toBeUndefined();
  });
});
