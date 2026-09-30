import { describe, expect, it } from "vitest";
import { backInNeedsYou, returnDate } from "./ooo";

const today = new Date(2026, 8, 29);
describe("out-of-office return date", () => {
  it("reads the common ways people write it", () => {
    expect(returnDate("I’m out of office until 14 October. For urgent matters…", today)).toEqual(new Date(2026, 9, 14));
    expect(returnDate("Back on Wednesday, Oct 14th", today)).toEqual(new Date(2026, 9, 14));
    expect(returnDate("Returning 5/10, limited email until then", today)).toEqual(new Date(2026, 9, 5));
    expect(returnDate("away till 2nd Nov", today)).toEqual(new Date(2026, 10, 2));
  });
  it("takes the day they’re back, not the day they left", () => {
    expect(returnDate("Away from 5 October until 14 October.", today)).toEqual(new Date(2026, 9, 14));
  });
  it("rolls a past date to next year", () => {
    expect(returnDate("Out until 3 January", today)).toEqual(new Date(2027, 0, 3));
  });
  it("gives up rather than guess", () => {
    expect(returnDate("I’m travelling with limited access.", today)).toBeUndefined();
    expect(returnDate("until 31 Feb", today)).toBeUndefined();
    expect(returnDate("back 14/13", today)).toBeUndefined();
    expect(returnDate("until 14 Octopus", today)).toBeUndefined();
    expect(returnDate("until 40 October", today)).toBeUndefined();
  });
  it("says when the thread comes back", () => {
    const b = backInNeedsYou("I’m out of office until 14 October.", today);
    expect(b.on).toEqual(new Date(2026, 9, 14, 8, 0));
    expect(b.label).toBe("Back in Needs you Wed 14 Oct, 08:00");
    expect(backInNeedsYou("Back on 30 September", today).label).toBe("Back in Needs you Wed 30 Sep, 08:00");
    expect(backInNeedsYou("Limited access this month.", today)).toEqual({ label: expect.stringMatching(/No return date/) });
  });
});
