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
    expect(run({ pathname: "/app/companies", search: "" })).toEqual(to("/sign-in?next=%2Fapp%2Fcompanies"));
    expect(run({ pathname: "/onboarding", search: "?step=2" })).toEqual(to("/sign-in?next=%2Fonboarding%3Fstep%3D2"));
  });

  it("leaves public routes alone", () => {
    for (const pathname of ["/", "/sign-in", "/styleguide", "/fenceline"]) expect(run({ pathname })).toEqual({ type: "next" });
    expect(run({ pathname: "/", returnTo: "/app" })).toEqual({ type: "next" });
  });

  it("/ is the public home page (ENG-87): never sent to sign-in, and only a post-login landing is redirected", () => {
    // Signed out, with or without a stale return cookie: the landing, never sign-in.
    expect(run({ pathname: "/" })).toEqual({ type: "next" });
    expect(run({ pathname: "/", returnTo: "/app/companies" })).toEqual({ type: "next" });
    // Signed in and just browsing (no return cookie): the landing too.
    expect(run({ pathname: "/", hasSession: true, onboarded: true })).toEqual({ type: "next" });
    expect(run({ pathname: "/", hasSession: true, onboarded: false })).toEqual({ type: "next" });
    // Signed in and arriving from the API callback (return cookie set): on to the app, as before.
    expect(run({ pathname: "/", hasSession: true, onboarded: true, returnTo: "/app" })).toEqual(to("/app", true));
  });

  it("finishes the post-login trip and clears the return cookie", () => {
    expect(run({ hasSession: true, onboarded: true, returnTo: "/app/segments" })).toEqual(to("/app/segments", true));
    expect(run({ hasSession: true, onboarded: true, returnTo: "//evil.test" })).toEqual(to("/app", true));
    expect(run({ hasSession: true, onboarded: false, returnTo: "/onboarding?step=4" })).toEqual(to("/onboarding?step=4", true));
  });

  it("sends a workspace that has not onboarded to onboarding first", () => {
    expect(run({ hasSession: true, returnTo: "/app" })).toEqual(to("/onboarding", true));
    expect(run({ hasSession: true, pathname: "/app/companies" })).toEqual(to("/onboarding"));
    expect(run({ hasSession: true, pathname: "/onboarding" })).toEqual({ type: "next" });
  });

  it("lets signed-in, onboarded users through", () => {
    expect(run({ hasSession: true, onboarded: true, pathname: "/app" })).toEqual({ type: "next" });
    expect(run({ hasSession: true, onboarded: true, pathname: "/" })).toEqual({ type: "next" });
  });
});
