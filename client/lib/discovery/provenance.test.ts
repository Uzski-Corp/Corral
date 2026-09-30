import { describe, expect, it } from "vitest";
import { ageDays, chainSummary, confidenceWord, formatAge, freshness, latest, origin, shortAge, staleFields, type FieldProv } from "./provenance";

const today = new Date(2026, 8, 29);
const email: FieldProv = { field: "email", value: "w@k.co.ke", chain: [
  { kind: "site", what: "Listed on the Contact page", at: "2026-09-26", url: "k.co.ke/contact" },
  { kind: "hunter", what: "Found in 4 public sources", at: "2026-09-26", confidence: 96 },
  { kind: "zerobounce", what: "Mailbox exists", at: "2026-09-28" },
] };

describe("provenance", () => {
  it("counts days and words them", () => {
    expect(ageDays("2026-09-28", today)).toBe(1);
    expect(ageDays("2026-10-02", today)).toBe(0);
    expect([0, 1, 5, 21, 128, 400].map(formatAge)).toEqual(["today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "over a year ago"]);
    expect([0, 5, 21, 128, 400].map(shortAge)).toEqual(["today", "5d", "3w", "4mo", "1y+"]);
  });

  it("is fresh from its newest check, stale after the field's window, never stale when you typed it", () => {
    expect(freshness(email, today)).toEqual({ at: "2026-09-28", days: 1, stale: false });
    const old = { ...email, chain: email.chain.map((e) => ({ ...e, at: "2026-05-30" })) };
    expect(freshness(old, today)).toMatchObject({ days: 122, stale: true });
    const yours: FieldProv = { ...old, chain: [...old.chain, { kind: "you", what: "Edited", at: "2026-01-02" }] };
    expect(freshness(yours, today).stale).toBe(false);
    const size: FieldProv = { field: "size", value: "51–200", chain: [{ kind: "corral", what: "Careers page", at: "2026-05-30" }] };
    expect(freshness(size, today).stale).toBe(false);
    expect(freshness({ ...size, chain: [] }, today).stale).toBe(true);
    expect(staleFields([email, old, size], today)).toEqual([old]);
  });

  it("summarises the chain", () => {
    expect(origin(email).kind).toBe("site");
    expect(latest(email).kind).toBe("zerobounce");
    expect(chainSummary(email)).toBe("Found on the website, confirmed by Hunter and ZeroBounce");
    expect(chainSummary({ field: "title", value: "QA", chain: [{ kind: "csv", what: "Row 2", at: "2026-09-29" }] })).toBe("From your CSV");
    expect(chainSummary({ field: "title", value: "QA", chain: [{ kind: "site", what: "a", at: "2026-09-29" }, { kind: "site", what: "b", at: "2026-09-29" }] })).toBe("Found on the website");
    expect([undefined, 96, 74, 50].map(confidenceWord)).toEqual([null, "high confidence", "good confidence", "low confidence"]);
  });
});
