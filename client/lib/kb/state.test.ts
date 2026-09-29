import { describe, expect, it } from "vitest";
import { KB_REVIEW_STATES, kbReviewState } from "./state";

describe("kbReviewState", () => {
  it("honours known states on the knowledge view when review states are on", () => {
    for (const s of KB_REVIEW_STATES) expect(kbReviewState("knowledge", s, true)).toBe(s);
  });
  it("ignores other views, unknown states and production", () => {
    expect(kbReviewState("unibox", "empty", true)).toBeUndefined();
    expect(kbReviewState("knowledge", "nope", true)).toBeUndefined();
    expect(kbReviewState("knowledge", undefined, true)).toBeUndefined();
    expect(kbReviewState("knowledge", "empty", false)).toBeUndefined();
  });
});
