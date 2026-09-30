import { describe, expect, it } from "vitest";
import { UNIBOX_REVIEW_STATES, uniboxReviewState } from "./state";

describe("uniboxReviewState", () => {
  it("honours known states on the unibox view when review states are on", () => {
    expect(UNIBOX_REVIEW_STATES).toHaveLength(31);
    for (const s of UNIBOX_REVIEW_STATES) expect(uniboxReviewState("unibox", s, true)).toBe(s);
  });
  it("ignores other views, unknown states and production", () => {
    expect(uniboxReviewState("sequences", "draft", true)).toBeUndefined();
    expect(uniboxReviewState("unibox", "api-down", true)).toBeUndefined();
    expect(uniboxReviewState("unibox", undefined, true)).toBeUndefined();
    expect(uniboxReviewState("unibox", "draft", false)).toBeUndefined();
  });
});
