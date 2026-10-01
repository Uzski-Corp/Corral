import { describe, expect, it } from "vitest";
import { appPath, legacyAppRedirect, locationFromPath, resolveAppRoute } from "./appPath";

describe("appPath", () => {
  it("gives every screen a path", () => {
    expect(appPath("unibox")).toBe("/app");
    expect(appPath("unibox", { state: "draft" })).toBe("/app?state=draft");
    expect(appPath("companies")).toBe("/app/companies");
    expect(appPath("companies", { state: "fit" })).toBe("/app/companies?state=fit");
    expect(appPath("settings")).toBe("/app/settings");
    expect(appPath("settings", { tab: "integrations" })).toBe("/app/settings");
    expect(appPath("settings", { tab: "mcp" })).toBe("/app/settings/mcp");
    expect(appPath("settings", { tab: "mcp", state: "mcp-consent" })).toBe("/app/settings/mcp?state=mcp-consent");
    expect(appPath("settings", { tab: "mailboxes" })).toBe("/app/settings");
    expect(appPath("segments")).toBe("/app/segments");
    expect(appPath("segments", { segment: "Kenya dairy" })).toBe("/app/segments/Kenya%20dairy");
    expect(appPath("segments", { segment: "F&B · East Africa" })).toBe("/app/segments/F%26B%20%C2%B7%20East%20Africa");
  });
});

describe("legacyAppRedirect", () => {
  it("sends the old query URLs to the path, and leaves review params behind", () => {
    expect(legacyAppRedirect("/app", "?view=companies&state=empty&collapsed=1")).toBe("/app/companies?state=empty&collapsed=1");
    expect(legacyAppRedirect("/app", "?view=settings&tab=mcp&state=mcp")).toBe("/app/settings/mcp?state=mcp");
    expect(legacyAppRedirect("/app", "?view=settings&tab=integrations")).toBe("/app/settings");
    expect(legacyAppRedirect("/app", "?view=segments&segment=Kenya+dairy")).toBe("/app/segments/Kenya%20dairy");
    expect(legacyAppRedirect("/app", "?view=unibox&state=draft")).toBe("/app?state=draft");
    expect(legacyAppRedirect("/app", "?view=nope")).toBe("/app");
    expect(legacyAppRedirect("/app/unibox", "?state=draft")).toBe("/app?state=draft");
    expect(legacyAppRedirect("/app/settings/integrations", "")).toBe("/app/settings");
    expect(legacyAppRedirect("/app/settings", "?tab=keys&state=keys-empty")).toBe("/app/settings/keys?state=keys-empty");
  });

  it("leaves a canonical path alone", () => {
    expect(legacyAppRedirect("/app", "")).toBeNull();
    expect(legacyAppRedirect("/app/companies", "?state=empty")).toBeNull();
    expect(legacyAppRedirect("/app/settings/mcp", "")).toBeNull();
    expect(legacyAppRedirect("/", "?view=companies")).toBeNull();
  });
});

describe("resolveAppRoute", () => {
  it("reads the path and redirects the old query", () => {
    expect(resolveAppRoute(undefined, {})).toEqual({ type: "page", view: "unibox" });
    expect(resolveAppRoute(["companies"], { state: "empty" })).toMatchObject({ type: "page", view: "companies" });
    expect(resolveAppRoute(["settings", "workspace"], {})).toMatchObject({ type: "page", view: "settings", tab: "workspace" });
    expect(resolveAppRoute(["segments", "Kenya dairy"], {})).toMatchObject({ type: "page", view: "segments", segment: "Kenya dairy" });
    expect(resolveAppRoute(undefined, { view: "knowledge", state: "empty" })).toEqual({ type: "redirect", to: "/app/knowledge?state=empty" });
    expect(resolveAppRoute(["nope"], {})).toEqual({ type: "not-found" });
    expect(resolveAppRoute(["companies", "extra"], {})).toEqual({ type: "not-found" });
    expect(resolveAppRoute(["settings", "mailboxes"], {})).toEqual({ type: "not-found" });
  });
});

describe("locationFromPath", () => {
  it("reads the screen back from the path", () => {
    expect(locationFromPath("/app")).toEqual({ view: "unibox" });
    expect(locationFromPath("/app/knowledge")).toMatchObject({ view: "knowledge" });
    expect(locationFromPath("/app/settings/keys")).toMatchObject({ view: "settings", tab: "keys" });
    expect(locationFromPath("/app/segments/Kenya%20dairy")).toMatchObject({ view: "segments", segment: "Kenya dairy" });
    expect(locationFromPath("/styleguide")).toMatchObject({ view: "unibox" });
  });
});
