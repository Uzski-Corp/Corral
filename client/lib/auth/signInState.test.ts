import { describe, expect, it } from "vitest";
import { CALLBACK_ERRORS, signInView } from "./signInState";

describe("signInView", () => {
  it.each(CALLBACK_ERRORS)("shows the designed failure screen for ?error=%s", (code) => {
    expect(signInView({ error: code }, false)).toEqual({ initial: "error", callbackError: code });
  });

  it("maps unknown error codes to the same screen", () => {
    expect(signInView({ error: "weird" }, false)).toEqual({ initial: "error", callbackError: "unknown" });
  });

  it("prefers a real callback error over a review state", () => {
    expect(signInView({ state: "sent", error: "auth_failed" }, true).initial).toBe("error");
  });

  it("honours review states only when allowed", () => {
    expect(signInView({ state: "sent" }, true)).toEqual({ initial: "sent", callbackError: null });
    expect(signInView({ state: "invalid" }, true).initial).toBe("invalid");
    expect(signInView({ state: "sent" }, false).initial).toBe("default");
    expect(signInView({ state: "bogus" }, true).initial).toBe("default");
    expect(signInView({}, true).initial).toBe("default");
  });
});
