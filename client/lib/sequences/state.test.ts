import { describe, expect, it } from "vitest";
import { SEQUENCE_REVIEW_STATES, sequenceReviewState } from "./state";

describe("sequenceReviewState", () => {
  it("honours known states on the sequences view when review states are on", () => {
    for (const s of SEQUENCE_REVIEW_STATES) expect(sequenceReviewState("sequences", s, true)).toBe(s);
  });
  it("ignores other views, unknown states and production", () => {
    expect(sequenceReviewState("discovery", "draft", true)).toBeUndefined();
    expect(sequenceReviewState("sequences", "nope", true)).toBeUndefined();
    expect(sequenceReviewState("sequences", undefined, true)).toBeUndefined();
    expect(sequenceReviewState("sequences", "draft", false)).toBeUndefined();
  });
});
