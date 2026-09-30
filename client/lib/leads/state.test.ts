import { describe, expect, it } from "vitest";
import { LEADS_REVIEW_STATES, SEGMENT_REVIEW_STATES, leadsReviewState } from "./state";

describe("leadsReviewState", () => {
  it("honours companies and segments states only where review states are on", () => {
    expect(leadsReviewState("companies", "import-map-errors", true)).toBe("import-map-errors");
    expect(leadsReviewState("segments", "builder-empty", true)).toBe("builder-empty");
    expect(leadsReviewState("segments", "import", true)).toBeUndefined();
    expect(leadsReviewState("companies", "builder", true)).toBeUndefined();
    expect(leadsReviewState("knowledge", "loading", true)).toBeUndefined();
    expect(leadsReviewState("companies", "loading", false)).toBeUndefined();
    expect(leadsReviewState(undefined, undefined, true)).toBeUndefined();
    expect(LEADS_REVIEW_STATES).toHaveLength(36);
    expect(SEGMENT_REVIEW_STATES).toContain("builder-error");
  });
});
