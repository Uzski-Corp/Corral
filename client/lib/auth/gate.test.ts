import { describe, expect, it } from "vitest";
import { decide, type GateInput } from "./gate";

const base: GateInput = { mode: "live", pathname: "/", search: "", hasSession: false, onboarded: false, returnTo: null };
const run = (over: Partial<GateInput>) => decide({ ...base, ...over });
const to = (target: string, clearReturnTo = false) => ({ type: "redirect", to: target, clearReturnTo });

describe("decide", () => {
  it("never gates the design-review build", () => {
    expect(run({ mode: "review", pathname: "/app" })).toEqual({ type: "next" });
    expect(run({ mode: "review", pathname: "/onboarding" })).toEqual({ type: "next" });
  });

  it("sends signed-out visitors of protected routes to sign-in with a return path", () => {
    expect(run({ pathname: "/app", search: "?view=companies" })).toEqual(to("/sign-in?next=%2Fapp%3Fview%3Dcompanies"));
    expect(run({ pathname: "/onboarding", search: "?step=2" })).toEqual(to("/sign-in?next=%2Fonboarding%3Fstep%3D2"));
  });

  it("leaves public routes alone", () => {
    for (const pathname of ["/", "/sign-in", "/styleguide", "/open-range"]) expect(run({ pathname })).toEqual({ type: "next" });
    expect(run({ pathname: "/", returnTo: "/app" })).toEqual({ type: "next" });
  });

  it("finishes the post-login trip and clears the return cookie", () => {
    expect(run({ hasSession: true, onboarded: true, returnTo: "/app?view=segments" })).toEqual(to("/app?view=segments", true));
    expect(run({ hasSession: true, onboarded: true, returnTo: "//evil.test" })).toEqual(to("/app", true));
    expect(run({ hasSession: true, onboarded: false, returnTo: "/onboarding?step=4" })).toEqual(to("/onboarding?step=4", true));
  });

  it("sends a workspace that has not onboarded to onboarding first", () => {
    expect(run({ hasSession: true, returnTo: "/app" })).toEqual(to("/onboarding", true));
    expect(run({ hasSession: true, pathname: "/app", search: "?view=companies" })).toEqual(to("/onboarding"));
    expect(run({ hasSession: true, pathname: "/onboarding" })).toEqual({ type: "next" });
  });

  it("lets signed-in, onboarded users through", () => {
    expect(run({ hasSession: true, onboarded: true, pathname: "/app" })).toEqual({ type: "next" });
    expect(run({ hasSession: true, onboarded: true, pathname: "/" })).toEqual({ type: "next" });
  });
});
