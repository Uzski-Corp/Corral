import { describe, expect, it } from "vitest";
import { FAILURE, MAX_FILE_BYTES, STAGES, checkFile, checkUrl, extOf, formatBytes, overallPercent, queueSummary, stageLabel, takeDrop } from "./upload";

describe("extOf", () => {
  it("reads the last extension, lower-cased, ignoring folders and dotfiles", () => {
    expect(extOf("Pitch 2026.PDF")).toBe("pdf");
    expect(extOf("a/b/notes.v2.md")).toBe("md");
    expect(extOf("C:\\x\\deck.key")).toBe("key");
    expect(extOf(".env")).toBe("");
    expect(extOf("README")).toBe("");
  });
});

describe("formatBytes", () => {
  it("uses B, KB and MB", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(860 * 1024)).toBe("860 KB");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(formatBytes(31.4 * 1024 * 1024)).toBe("31 MB");
  });
});

describe("checkFile", () => {
  it("accepts PDF, DOCX and Markdown", () => {
    expect(checkFile({ name: "a.pdf", size: 10 })).toEqual({ ok: true, kind: "pdf" });
    expect(checkFile({ name: "a.docx", size: 10 })).toEqual({ ok: true, kind: "docx" });
    expect(checkFile({ name: "a.markdown", size: 10 })).toEqual({ ok: true, kind: "md" });
  });
  it("names known formats with their way out", () => {
    const r = checkFile({ name: "Trade show.key", size: 10 });
    expect(r).toMatchObject({ ok: false, reason: "unsupported", title: ".key files aren't supported" });
    expect(!r.ok && r.fix).toMatch(/Keynote/);
  });
  it("falls back to the generic line, including files with no extension", () => {
    expect(checkFile({ name: "x.exe", size: 1 })).toMatchObject({ fix: "Use PDF, DOCX or Markdown." });
    expect(checkFile({ name: "notes", size: 1 })).toMatchObject({ title: "Files without an extension aren't supported" });
  });
  it("rejects empty and oversized files", () => {
    expect(checkFile({ name: "a.pdf", size: 0 })).toMatchObject({ reason: "empty" });
    expect(checkFile({ name: "a.pdf", size: MAX_FILE_BYTES })).toMatchObject({ ok: true });
    expect(checkFile({ name: "a.pdf", size: MAX_FILE_BYTES + 1 })).toMatchObject({ reason: "too-large", title: "25 MB is over the 25 MB limit" });
  });
});

describe("takeDrop", () => {
  it("keeps the first 20 and counts the rest", () => {
    expect(takeDrop([1, 2])).toEqual({ accepted: [1, 2], overflow: 0 });
    const r = takeDrop(Array.from({ length: 23 }, (_, i) => i));
    expect(r.accepted).toHaveLength(20);
    expect(r.overflow).toBe(3);
  });
});

describe("checkUrl", () => {
  it("adds https and splits host and path", () => {
    expect(checkUrl(" www.coldtrace.io/pricing/ ")).toEqual({ ok: true, url: "https://www.coldtrace.io/pricing/", host: "coldtrace.io", path: "/pricing" });
    expect(checkUrl("http://coldtrace.io")).toMatchObject({ ok: true, host: "coldtrace.io", path: "" });
  });
  it("explains what's wrong", () => {
    expect(checkUrl("")).toEqual({ ok: false, message: "Paste a web address." });
    expect(checkUrl("https://")).toMatchObject({ ok: false, message: expect.stringMatching(/doesn't look like/) });
    expect(checkUrl("ftp://coldtrace.io/x")).toMatchObject({ message: "Only http and https pages can be read." });
    expect(checkUrl("localhost:3000")).toMatchObject({ ok: false });
    expect(checkUrl("http://192.168.1.4/admin")).toMatchObject({ message: "Corral can only read public web pages." });
    expect(checkUrl("intranet")).toMatchObject({ message: "Corral can only read public web pages." });
  });
});

describe("pipeline", () => {
  it("labels stages for files and pages", () => {
    expect(stageLabel("upload", "pdf")).toBe("Uploading");
    expect(stageLabel("upload", "url")).toBe("Fetching");
    expect(stageLabel("scan", "url")).toBe("Checking file");
    expect(stageLabel("embed", "md", "done")).toBe("Searchable");
    expect(stageLabel("parse", "url", "done")).toBe("Read");
  });
  it("weighs every stage the same and clamps", () => {
    expect(overallPercent("upload", 0)).toBe(0);
    expect(overallPercent("upload", 50)).toBe(10);
    expect(overallPercent("embed", 100)).toBe(100);
    expect(overallPercent("chunk", 250)).toBe(80);
    expect(overallPercent("parse", -5)).toBe(40);
    expect(STAGES).toHaveLength(5);
  });
  it("gives every failure a title and a fix", () => {
    for (const f of Object.values(FAILURE)) { expect(f.title).toBeTruthy(); expect(f.fix).toMatch(/\.$/); }
  });
});

describe("queueSummary", () => {
  it("summarises idle, busy and finished queues", () => {
    expect(queueSummary([])).toBe("Nothing added yet");
    expect(queueSummary([{ state: "done" }, { state: "active" }, { state: "queued" }])).toBe("Adding 2 of 3");
    expect(queueSummary([{ state: "active" }, { state: "error" }])).toBe("Adding 1 of 1 · 1 needs attention");
    expect(queueSummary([{ state: "done" }, { state: "done" }, { state: "error" }, { state: "error" }])).toBe("2 added · 2 need attention");
    expect(queueSummary([{ state: "done" }])).toBe("1 added");
    expect(queueSummary([{ state: "queued" }, { state: "error" }, { state: "error" }])).toBe("Adding 1 of 1 · 2 need attention");
  });
});
