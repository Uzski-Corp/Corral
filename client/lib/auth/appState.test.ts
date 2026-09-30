import { describe, expect, it } from "vitest";
import { APP_REVIEW_STATES, appReviewState } from "./appState";

describe("appReviewState", () => {
  it.each(APP_REVIEW_STATES)("honours ?state=%s when review states are allowed", (s) => {
    expect(appReviewState(s, true)).toBe(s);
  });
  it("ignores unknown states and production builds", () => {
    expect(appReviewState("bogus", true)).toBeUndefined();
    expect(appReviewState(undefined, true)).toBeUndefined();
    expect(appReviewState("api-down", false)).toBeUndefined();
  });
});
