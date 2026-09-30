import { describe, expect, it } from "vitest";
import { DISCOVERY_REVIEW_STATES, discoveryReviewState } from "./state";

describe("discoveryReviewState", () => {
  it("honours discovery states only on the discovery view, and only where review states are on", () => {
    expect(DISCOVERY_REVIEW_STATES).toHaveLength(13);
    expect(discoveryReviewState("discovery", "rate-limited", true)).toBe("rate-limited");
    expect(discoveryReviewState("discovery", "nope", true)).toBeUndefined();
    expect(discoveryReviewState("companies", "running", true)).toBeUndefined();
    expect(discoveryReviewState("discovery", "running", false)).toBeUndefined();
  });
});
