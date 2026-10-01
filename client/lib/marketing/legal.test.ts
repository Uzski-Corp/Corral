import { describe, expect, it } from "vitest";
import { LEGAL_TODO, PRIVACY, TERMS, type LegalSection } from "./legal";

const text = (doc: LegalSection[]) => doc.map((s) => [s.title, ...s.body].join("\n")).join("\n");
const todos = (doc: LegalSection[]) => text(doc).split(LEGAL_TODO).length - 1;

describe("legal text (ENG-87c)", () => {
  it.each([["terms", TERMS], ["privacy", PRIVACY]] as const)("%s: every section has a unique id, a title and text", (_, doc) => {
    expect(new Set(doc.map((s) => s.id)).size).toBe(doc.length);
    for (const s of doc) { expect(s.title.trim()).not.toBe(""); expect(s.body.length).toBeGreaterThan(0); }
  });

  it("keeps Uzski Corp as the entity, address and IP owner, with Corral as the product", () => {
    const t = text(TERMS);
    expect(t).toMatch(/We are Uzski Corp .* a company registered in Kenya at Abc Place Nairobi, Waiyaki Way/);
    expect(t).toMatch(/Uzski Corp owns or licenses all intellectual property rights in the Services, including the Corral software/);
    expect(t).toMatch(/governed by the laws of Kenya/);
    expect(text(PRIVACY)).toMatch(/Uzski Corp, Abc Place Nairobi, Waiyaki Way, Nairobi, Nairobi County 00100, Kenya/);
  });

  it("covers what Corral actually does", () => {
    const all = text(TERMS) + text(PRIVACY);
    for (const topic of [/WorkOS/, /robots\.txt/, /CSV/, /Hunter/, /Dropcontact/, /ZeroBounce/, /unsubscribe/i, /suppression list/, /Phoenix/,
      /MCP/, /API keys?/, /[Ee]mbeddings/, /large-language-model|AI models/, /corral_visitor/, /How long we keep information/, /delete/]) expect(all).toMatch(topic);
  });

  it("marks unconfirmed facts for Sean instead of inventing them", () => {
    expect(todos(TERMS)).toBeGreaterThan(0);
    expect(todos(PRIVACY)).toBeGreaterThan(0);
    expect(text(PRIVACY)).toMatch(/\[TODO for Sean: name the LLM providers/);
  });
});
