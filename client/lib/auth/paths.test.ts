import { describe, expect, it } from "vitest";
import { isAppPath, isProtected, safeReturnTo, signInUrl } from "./paths";

describe("isProtected", () => {
  it.each([["/app", true], ["/app/x", true], ["/onboarding", true], ["/onboarding?step=2", false], ["/apps", false], ["/sign-in", false], ["/", false], ["/styleguide", false]])("%s -> %s", (p, want) => {
    expect(isProtected(p)).toBe(want);
  });
  it("knows app paths", () => { expect(isAppPath("/app")).toBe(true); expect(isAppPath("/onboarding")).toBe(false); });
});

describe("safeReturnTo", () => {
  it.each([
    ["/app", "/app"],
    ["/app?view=companies&collapsed=1", "/app?view=companies&collapsed=1"],
    ["/onboarding?step=5", "/onboarding?step=5"],
    ["/app/../app", "/app"],
    ["/app#frag", "/app"],
  ])("keeps %s", (v, want) => expect(safeReturnTo(v)).toBe(want));

  it.each([
    [null], [undefined], [""], ["app"], ["//evil.test/app"], ["/\\evil.test"], ["https://evil.test/app"], ["/sign-in"], ["/"], ["/styleguide"],
    ["/app/../sign-in"], ["/app\n"], ["/app\u007f"], [`/app?${"x".repeat(600)}`],
  ])("rejects %j", (v) => expect(safeReturnTo(v)).toBeNull());
});

describe("signInUrl", () => {
  it("carries a safe return path only", () => {
    expect(signInUrl("/app?view=segments")).toBe("/sign-in?next=%2Fapp%3Fview%3Dsegments");
    expect(signInUrl("//evil")).toBe("/sign-in");
    expect(signInUrl()).toBe("/sign-in");
  });
});
