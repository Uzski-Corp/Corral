import { describe, expect, it } from "vitest";
import { markOnboarded, ONBOARDED_COOKIE, rememberReturnTo, RETURN_TO_COOKIE } from "./cookies";

const sink = () => { const writes: string[] = []; return { writes, doc: { set cookie(v: string) { writes.push(v); }, get cookie() { return ""; } } }; };

describe("cookies", () => {
  it("writes a ten-minute, lax, encoded return path", () => {
    const s = sink();
    rememberReturnTo("/app?view=companies", s.doc, { protocol: "http:" });
    expect(s.writes).toEqual([`${RETURN_TO_COOKIE}=%2Fapp%3Fview%3Dcompanies; Path=/; Max-Age=600; SameSite=Lax`]);
  });

  it("marks onboarding for a year and adds Secure on https", () => {
    const s = sink();
    markOnboarded(s.doc, { protocol: "https:" });
    expect(s.writes[0]).toBe(`${ONBOARDED_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  });

  it("defaults to the real document", () => {
    markOnboarded();
    rememberReturnTo("/app");
    expect(document.cookie).toContain(`${ONBOARDED_COOKIE}=1`);
    expect(document.cookie).toContain(`${RETURN_TO_COOKIE}=%2Fapp`);
  });
});
