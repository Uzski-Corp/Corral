import { describe, expect, it } from "vitest";
import { agoLabel, dayLabel, daysBetween, momentLabel, parseTime } from "./time";

// Local-time constructors, so the labels hold in any time zone the tests run in.
const now = new Date(2026, 8, 30, 12, 15);
const at = (d: number, h = 9, m = 14, month = 8, y = 2026) => new Date(y, month, d, h, m);

describe("time labels", () => {
  it("counts calendar days, not 24-hour spans", () => {
    expect(daysBetween(at(30, 0, 1), now)).toBe(0);
    expect(daysBetween(at(29, 23, 59), now)).toBe(1);
    expect(daysBetween(at(1, 9, 0, 9), now)).toBe(-1);
  });

  it("parses ISO strings and rejects junk", () => {
    expect(parseTime("2026-09-30T06:00:00Z")?.toISOString()).toBe("2026-09-30T06:00:00.000Z");
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime("yesterday")).toBeNull();
  });

  it("names days", () => {
    expect(dayLabel(at(30), now)).toBe("Today");
    expect(dayLabel(at(29), now)).toBe("Yesterday");
    expect(dayLabel(at(27), now)).toBe("Sep 27");
    expect(dayLabel(at(3, 9, 0, 11, 2025), now)).toBe("Dec 3, 2025");
  });

  it("says how long ago", () => {
    expect(agoLabel(new Date(now.getTime() - 30_000), now)).toBe("just now");
    expect(agoLabel(new Date(now.getTime() + 60_000), now)).toBe("just now");
    expect(agoLabel(new Date(now.getTime() - 12 * 60_000), now)).toBe("12 min ago");
    expect(agoLabel(at(30, 10, 0), now)).toBe("2h ago");
    expect(agoLabel(at(29, 22, 0), now)).toBe("yesterday");
    expect(agoLabel(at(27), now)).toBe("3 days ago");
    expect(agoLabel(at(22), now)).toBe("Sep 22");
  });

  it("names a moment", () => {
    expect(momentLabel(at(30, 9, 14), now)).toBe("Today, 09:14");
    expect(momentLabel(at(29, 18, 2), now)).toBe("Yesterday, 18:02");
  });
});
