import { describe, expect, it } from "vitest";
import { MARKETING_REVIEW_STATES, SAMPLE_VISITORS, VISITOR_COOKIE, VISITOR_MAX_AGE_S, forgetVisitor, readVisitor, rememberVisitor, visitorFor } from "./visitor";

const enc = (v: unknown) => `${VISITOR_COOKIE}=${encodeURIComponent(JSON.stringify(v))}`;

describe("the signed-in visitor hint (M10c)", () => {
  it("reads name and picture from the hint cookie among others", () => {
    expect(readVisitor(`a=1; ${enc({ name: " Tomás Ibarra ", avatarUrl: "https://img.workos.com/t.jpg" })}; b=2`)).toEqual({ name: "Tomás Ibarra", avatarUrl: "https://img.workos.com/t.jpg" });
    expect(readVisitor(enc({ name: "Amani", avatarUrl: null }))).toEqual({ name: "Amani", avatarUrl: null });
    expect(readVisitor(enc({ name: "Local", avatarUrl: "/corral/app/av-tomas.jpg" }))?.avatarUrl).toBe("/corral/app/av-tomas.jpg");
  });
  it("anything malformed reads as signed out, and an unsafe picture URL is dropped", () => {
    expect(readVisitor("")).toBeNull();
    expect(readVisitor("wos_session=abc")).toBeNull();
    expect(readVisitor(`${VISITOR_COOKIE}=%7Bnot-json`)).toBeNull();
    expect(readVisitor(enc("just a string"))).toBeNull();
    expect(readVisitor(enc(null))).toBeNull();
    expect(readVisitor(enc({ name: "  " }))).toBeNull();
    expect(readVisitor(enc({ name: 3 }))).toBeNull();
    expect(readVisitor(enc({ name: "X", avatarUrl: "javascript:alert(1)" }))?.avatarUrl).toBeNull();
    expect(readVisitor(enc({ name: "X", avatarUrl: "http://plain.example/a.jpg" }))?.avatarUrl).toBeNull();
    expect(readVisitor(enc({ name: "X".repeat(200) }))?.name).toHaveLength(80);
  });
  it("remembers name and picture only, for 30 days, Secure on https", () => {
    const doc = { cookie: "" };
    rememberVisitor({ name: "Tomás Ibarra", avatarUrl: null }, doc, { protocol: "https:" });
    expect(doc.cookie).toBe(`${enc({ name: "Tomás Ibarra", avatarUrl: null })}; Path=/; Max-Age=${VISITOR_MAX_AGE_S}; SameSite=Lax; Secure`);
    expect(readVisitor(doc.cookie.split(";")[0])).toEqual({ name: "Tomás Ibarra", avatarUrl: null });
    rememberVisitor({ name: "A", avatarUrl: null }, doc, { protocol: "http:" });
    expect(doc.cookie).not.toContain("Secure");
    forgetVisitor(doc);
    expect(doc.cookie).toBe(`${VISITOR_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  });
  it("defaults to the page's document and location", () => {
    rememberVisitor({ name: "Grace Wambui", avatarUrl: null });
    expect(readVisitor(document.cookie)?.name).toBe("Grace Wambui");
    forgetVisitor();
    expect(readVisitor(document.cookie)).toBeNull();
  });
  it("review states win in review builds only", () => {
    const hint = enc({ name: "Real Person", avatarUrl: null });
    expect(visitorFor("?state=signed-in", "", true)).toEqual(SAMPLE_VISITORS["signed-in"]);
    expect(visitorFor("?state=signed-in-initials", "", true)?.avatarUrl).toBeNull();
    expect(visitorFor("?state=signed-out", hint, true)).toBeNull();
    expect(visitorFor("?state=other", hint, true)?.name).toBe("Real Person");
    expect(visitorFor("?state=signed-in", "", false)).toBeNull();
    expect(visitorFor("", hint, false)?.name).toBe("Real Person");
    expect(MARKETING_REVIEW_STATES).toEqual(["signed-out", "signed-in", "signed-in-initials"]);
  });
});
