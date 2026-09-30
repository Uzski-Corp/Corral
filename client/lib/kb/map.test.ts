import { describe, expect, it } from "vitest";
import { decodeSource, type ApiSource } from "../api/kb";
import { sourceRow } from "@/test/kbMock";
import { TEAMMATE, byOf, hostOf, metaOf, reasonOf, statusOf, toSource, toSources } from "./map";

const now = new Date(2026, 8, 30, 12, 15);
const iso = (d: Date) => d.toISOString();
const src = (over: Record<string, unknown> = {}): ApiSource => {
  const r = decodeSource(sourceRow({ id: "s1", name: "Spec.pdf", ...over }));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const me = { id: "u1", name: "Wanjiru Mwangi" };

describe("metaOf", () => {
  it("describes files by pages and size", () => {
    expect(metaOf(src({ pages_total: 38, byte_size: 11 * 1048576 }))).toBe("38 pages · 11 MB");
    expect(metaOf(src({ pages_total: 1, byte_size: null }))).toBe("1 page");
    expect(metaOf(src({ kind: "md", pages_total: null, byte_size: 957 }))).toBe("Markdown · 957 B");
    expect(metaOf(src({ kind: "md", pages_total: null, byte_size: null }))).toBe("Markdown");
    expect(metaOf(src({ pages_total: null, byte_size: null }))).toBe("");
  });
  it("describes web pages by scope", () => {
    expect(metaOf(src({ kind: "url", scope: "page", pages_total: null }))).toBe("1 page");
    expect(metaOf(src({ kind: "url", scope: "section", pages_total: 40 }))).toBe("Whole section · 40 pages");
    expect(metaOf(src({ kind: "url", scope: "section", pages_total: null }))).toBe("Whole section");
    expect(metaOf(src({ kind: "url", scope: "page", pages_total: 2 }))).toBe("2 pages");
  });
});

describe("statusOf", () => {
  it("maps ready and processing", () => {
    expect(statusOf(src(), now)).toEqual({ s: "ready" });
    expect(statusOf(src({ status: "processing", stage: "chunk", stage_pct: 140, note: "page 3 of 9" }), now)).toEqual({ s: "processing", stage: "chunk", pct: 100, note: "page 3 of 9", attempts: 1 });
    expect(statusOf(src({ status: "processing", stage: "embed", stage_pct: -3 }), now)).toEqual({ s: "processing", stage: "embed", pct: 0, attempts: 1 });
    expect(statusOf(src({ status: "processing", stage: "embed", stage_pct: 20, attempts: 3 }), now)).toEqual({ s: "processing", stage: "embed", pct: 20, attempts: 3 });
  });
  it("shows a queued source at the first stage its kind runs", () => {
    expect(statusOf(src({ status: "processing", stage: null, stage_pct: 50 }), now)).toEqual({ s: "processing", stage: "scan", pct: 0, attempts: 1 });
    expect(statusOf(src({ kind: "url", status: "processing", stage: null }), now)).toMatchObject({ stage: "upload" });
  });
  it("maps partial with the reason the server gives", () => {
    expect(statusOf(src({ status: "partial", pages_read: 30, pages_total: 38, skipped: "pp. 31–38", note: "scanned pages", skipped_reason: "scanned" }), now))
      .toEqual({ s: "partial", read: 30, total: 38, unit: "pages", note: "scanned pages", skipped: "pp. 31–38", reason: "scanned" });
    expect(statusOf(src({ status: "partial", pages_read: null, pages_total: null, skipped: null, note: null }), now)).toEqual({ s: "partial", unit: "pages", note: "", skipped: "", reason: "size-limit" });
    expect(statusOf(src({ status: "partial", kind: "url", skipped_reason: "mixed" }), now)).toMatchObject({ reason: "mixed" });
  });
  it("maps failed with when and where", () => {
    const processed = new Date(2026, 8, 30, 9, 14);
    expect(statusOf(src({ status: "failed", failure: "encrypted", failure_stage: "scan", note: "password", processed_at: iso(processed) }), now))
      .toEqual({ s: "failed", failure: "encrypted", at: "scan", note: "password", when: "Today, 09:14", attempts: 1 });
    expect(statusOf(src({ status: "failed", failure: null, failure_stage: null, stage: "embed", processed_at: null }), now)).toEqual({ s: "failed", failure: "interrupted", at: "embed", attempts: 1 });
    expect(statusOf(src({ status: "failed", failure: "blocked", failure_stage: null, stage: null, processed_at: null }), now)).toMatchObject({ at: "upload" });
    expect(statusOf(src({ status: "failed", failure: "interrupted", failure_stage: "embed", processed_at: null, attempts: 5 }), now)).toEqual({ s: "failed", failure: "interrupted", at: "embed", attempts: 5 });
  });
});

describe("reasonOf", () => {
  it("uses the server's reason as-is (M10c copy), and falls back by kind and note without one", () => {
    for (const r of ["scanned", "size-limit", "unreadable", "mixed"] as const) expect(reasonOf(r, undefined, "pdf")).toBe(r);
    expect(reasonOf(null, undefined, "url")).toBe("unreadable");
    expect(reasonOf(null, "12 pages are scanned images", "pdf")).toBe("scanned");
    expect(reasonOf(null, undefined, "pdf")).toBe("size-limit");
  });
});

describe("byOf / hostOf", () => {
  it("names me, someone known, or a neutral teammate", () => {
    expect(byOf("u1", { now, me })).toEqual({ name: "Wanjiru Mwangi" });
    expect(byOf("u2", { now, me, people: [{ id: "u2", name: "Otieno" }] })).toEqual({ name: "Otieno" });
    expect(byOf("u3", { now, me })).toEqual({ name: TEAMMATE, unknown: true });
    expect(byOf(null, { now })).toEqual({ name: TEAMMATE, unknown: true });
  });
  it("takes the host without www", () => {
    expect(hostOf("https://www.kilima.co.ke/docs")).toBe("kilima.co.ke");
    expect(hostOf(null)).toBeUndefined();
    expect(hostOf("not a url")).toBeUndefined();
  });
});

describe("toSource(s)", () => {
  it("maps a row into Bau's Source", () => {
    const s = toSource(src({ id: "s1", added_by_user_id: "u1", created_at: iso(new Date(2026, 8, 29, 8)), processed_at: iso(new Date(2026, 8, 30, 12, 3)), attempts: 2 }), { now, me });
    expect(s).toEqual({ id: "s1", name: "Spec.pdf", kind: "pdf", host: undefined, meta: "12 pages · 2.3 MB", passages: 40, cited: 0, by: { name: "Wanjiru Mwangi" }, added: "Yesterday", updated: "12 min ago", status: { s: "ready" }, attempts: 2 });
    const u = toSource(src({ kind: "url", url: "https://kilima.co.ke/faq", scope: "page", processed_at: null, created_at: "bad", updated_at: iso(new Date(2026, 8, 30, 12, 14, 50)) }), { now });
    expect(u).toMatchObject({ host: "kilima.co.ke", added: "Today", updated: "just now" });
  });
  it("drops removed sources and keeps the order", () => {
    const list = [src({ id: "a" }), src({ id: "b", deleted_at: iso(now) }), src({ id: "c" })];
    expect(toSources(list, { now }).map((s) => s.id)).toEqual(["a", "c"]);
  });
});
