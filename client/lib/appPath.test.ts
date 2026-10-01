import { describe, expect, it } from "vitest";
import { appPath, viewFromSearch } from "./appPath";

describe("appPath", () => {
  it("keeps the Unibox at /app", () => {
    expect(appPath("unibox")).toBe("/app");
  });

  it("names every other screen in the query", () => {
    expect(appPath("companies")).toBe("/app?view=companies");
    expect(appPath("settings", { tab: "mcp" })).toBe("/app?view=settings&tab=mcp");
    expect(appPath("settings", { tab: "integrations" })).toBe("/app?view=settings");
    expect(appPath("segments", { segment: "Kenya dairy" })).toBe("/app?view=segments&segment=Kenya+dairy");
  });
});

describe("viewFromSearch", () => {
  it("reads the screen back, and treats a missing view as the Unibox", () => {
    expect(viewFromSearch("")).toEqual({ view: "unibox", segment: undefined, tab: undefined });
    expect(viewFromSearch("?view=knowledge")).toMatchObject({ view: "knowledge" });
    expect(viewFromSearch("?view=nope")).toMatchObject({ view: "unibox" });
    expect(viewFromSearch("?view=segments&segment=Kenya%20dairy")).toMatchObject({ view: "segments", segment: "Kenya dairy" });
    expect(viewFromSearch("?view=settings&tab=keys")).toMatchObject({ view: "settings", tab: "keys" });
  });
});
