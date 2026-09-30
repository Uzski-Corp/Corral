import { describe, expect, it } from "vitest";
import { MCP_REVIEW_STATES, SECTION_TITLE, mcpReviewState, sectionOf } from "./state";
import { SETTINGS_REVIEW_STATES } from "../integrations/state";

describe("developer review states", () => {
  it("has 25, none clashing with Integrations on the same view", () => {
    expect(MCP_REVIEW_STATES).toHaveLength(25);
    expect(MCP_REVIEW_STATES.filter((s) => (SETTINGS_REVIEW_STATES as readonly string[]).includes(s))).toEqual([]);
  });
  it("only on settings, only where review states are", () => {
    expect(mcpReviewState("settings", "key-reveal", true)).toBe("key-reveal");
    expect(mcpReviewState("settings", "key-reveal", false)).toBeUndefined();
    expect(mcpReviewState("unibox", "keys", true)).toBeUndefined();
    expect(mcpReviewState("settings", "logs", true)).toBeUndefined();
  });
  it("maps each state to its page", () => {
    expect(sectionOf("mcp-consent")).toBe("mcp"); expect(sectionOf("keys-empty")).toBe("keys"); expect(sectionOf("key-expired")).toBe("keys");
    expect(sectionOf("docs-tool")).toBe("docs"); expect(SECTION_TITLE.keys).toBe("API keys");
    expect(MCP_REVIEW_STATES.map(sectionOf).filter((s) => s === "docs")).toHaveLength(3);
  });
});
