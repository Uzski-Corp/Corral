import { describe, expect, it } from "vitest";
import { CALLBACK_ERRORS, REVIEW_STATES, screenForError, signInView } from "./signInState";

describe("signInView", () => {
  it.each(CALLBACK_ERRORS)("shows the designed failure screen for ?error=%s", (code) => {
    expect(signInView({ error: code }, false)).toEqual({ initial: screenForError(code), callbackError: code });
  });

  it("gives cancel and provider-down their own screens", () => {
    expect(signInView({ error: "provider_error" }, false).initial).toBe("cancelled");
    expect(signInView({ error: "auth_unavailable" }, false).initial).toBe("unavailable");
    expect(signInView({ error: "invalid_state" }, false).initial).toBe("error");
    expect(signInView({ error: "auth_failed" }, false).initial).toBe("error");
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
    expect(signInView({ state: "cancelled" }, true).initial).toBe("cancelled");
    expect(signInView({ state: "unavailable" }, true).initial).toBe("unavailable");
    expect(signInView({ state: "sent" }, false).initial).toBe("default");
    expect(signInView({ state: "bogus" }, true).initial).toBe("default");
    expect(signInView({}, true).initial).toBe("default");
  });

  it.each(["code-verifying", "code-wrong", "code-expired", "code-attempts", "code-resent", "resend-limited", "verify-limited", "code-failed", "change-email"])("reaches the code state ?state=%s in review", (s) => {
    expect(REVIEW_STATES).toContain(s);
    expect(signInView({ state: s }, true).initial).toBe(s);
    expect(signInView({ state: s }, false).initial).toBe("default");
  });
});
