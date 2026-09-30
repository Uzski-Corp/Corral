/**
 * Knowledge-base upload rules (M2, ENG-52 → ENG-66). Plain module: the client checks these before a
 * byte leaves the browser so people hear "not supported" in 0ms, not after a round trip. The server
 * (ENG-66) re-checks everything; these numbers are the design defaults, confirm them there.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_DROP = 20;
export const ACCEPTED = { pdf: "PDF", docx: "DOCX", md: "Markdown", markdown: "Markdown" } as const;
export type FileKind = "pdf" | "docx" | "md";
export type SourceKind = FileKind | "url";
/** For <input type="file" accept>. */
export const ACCEPT_ATTR = ".pdf,.docx,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown";

/** Formats people recognise, with the one-line way out. Anything else gets the generic line. */
const KNOWN_UNSUPPORTED: Record<string, string> = {
  pages: "Export it from Pages as PDF, then add the PDF.",
  key: "Export it from Keynote as PDF, then add the PDF.",
  pptx: "Save the deck as PDF, then add the PDF.",
  ppt: "Save the deck as PDF, then add the PDF.",
  doc: "Save it as .docx or PDF, then add it again.",
  xlsx: "Spreadsheets aren't read yet. Paste the important rows into a Markdown file.",
  csv: "Spreadsheets aren't read yet. Paste the important rows into a Markdown file.",
  zip: "Unzip it and add the files inside.",
  png: "Images aren't read. Add the document the image came from.",
  jpg: "Images aren't read. Add the document the image came from.",
  jpeg: "Images aren't read. Add the document the image came from.",
};

export const extOf = (name: string) => {
  const base = name.split(/[\\/]/).pop() ?? name;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
};

/** "4.2 MB", "860 KB", "12 B". Binary units, one decimal under 10. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export type FileCheck =
  | { ok: true; kind: FileKind }
  | { ok: false; reason: "unsupported" | "too-large" | "empty"; title: string; fix: string };

/** Checks one picked or dropped file. Extension decides (MIME types from drag-and-drop are unreliable). */
export function checkFile(f: { name: string; size: number }): FileCheck {
  const ext = extOf(f.name);
  if (!(ext in ACCEPTED)) {
    const label = ext ? `.${ext} files aren't supported` : "Files without an extension aren't supported";
    return { ok: false, reason: "unsupported", title: label, fix: KNOWN_UNSUPPORTED[ext] ?? "Use PDF, DOCX or Markdown." };
  }
  if (f.size === 0) return { ok: false, reason: "empty", title: "This file is empty", fix: "Check it opens on your computer, then add it again." };
  if (f.size > MAX_FILE_BYTES) return { ok: false, reason: "too-large", title: `${formatBytes(f.size)} is over the 25 MB limit`, fix: "Compress it or split it into parts." };
  return { ok: true, kind: ext === "markdown" ? "md" : (ext as FileKind) };
}

/** Splits a drop into what goes ahead and what's over the per-drop limit. */
export function takeDrop<T>(files: T[]): { accepted: T[]; overflow: number } {
  return { accepted: files.slice(0, MAX_FILES_PER_DROP), overflow: Math.max(0, files.length - MAX_FILES_PER_DROP) };
}

export type UrlCheck = { ok: true; url: string; host: string; path: string } | { ok: false; message: string };

/** Accepts "coldtrace.io/pricing" as well as full URLs; only http(s), only public-looking hosts. */
export function checkUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, message: "Paste a web address." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return { ok: false, message: "That doesn't look like a web address. Try coldtrace.io/pricing" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, message: "Only http and https pages can be read." };
  if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|0\.)/.test(u.hostname)) return { ok: false, message: "Corral can only read public web pages." };
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
  return { ok: true, url: u.toString(), host, path };
}

/* ------------------------------------------------------------ processing pipeline
   The stages ENG-66 reports as progress events. Labels are what people read in the row and the detail. */
export const STAGES = ["upload", "scan", "parse", "chunk", "embed"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, { doing: string; done: string }> = {
  upload: { doing: "Uploading", done: "Uploaded" },
  scan: { doing: "Checking file", done: "Checked" },
  parse: { doing: "Reading", done: "Read" },
  chunk: { doing: "Splitting into passages", done: "Split into passages" },
  embed: { doing: "Indexing", done: "Searchable" },
};
export const URL_STAGE_LABEL: Partial<Record<Stage, { doing: string; done: string }>> = {
  upload: { doing: "Fetching", done: "Fetched" },
  parse: { doing: "Reading pages", done: "Read" },
};
export const stageLabel = (stage: Stage, kind: SourceKind, when: "doing" | "done" = "doing") =>
  (kind === "url" ? URL_STAGE_LABEL[stage] : undefined)?.[when] ?? STAGE_LABEL[stage][when];

/** Overall 0–100 from a stage and that stage's own percent; every stage weighs the same. */
export function overallPercent(stage: Stage, stagePct: number): number {
  const i = STAGES.indexOf(stage);
  const p = Math.min(100, Math.max(0, stagePct));
  return Math.round(((i + p / 100) / STAGES.length) * 100);
}

/* ------------------------------------------------------------ failures
   Every failure names what happened, whether anything was kept, and the one fix. */
export type Failure = "interrupted" | "encrypted" | "no-text" | "rejected" | "duplicate" | "unreachable" | "blocked";
export const FAILURE: Record<Failure, { title: string; fix: string; action?: "retry" | "replace" | "remove" }> = {
  interrupted: { title: "Upload stopped", fix: "The connection dropped. Nothing was saved.", action: "retry" },
  encrypted: { title: "This PDF is password-protected", fix: "Remove the password, then add it again.", action: "replace" },
  "no-text": { title: "No readable text", fix: "It looks like a scanned document. Add a version with selectable text.", action: "replace" },
  rejected: { title: "This file was blocked", fix: "It contains macros or embedded files Corral won't open.", action: "remove" },
  duplicate: { title: "Already in this knowledge base", fix: "Replace the old copy, or skip this one.", action: "replace" },
  unreachable: { title: "Couldn’t reach this page", fix: "It returned an error or timed out. Check it opens in a private window.", action: "retry" },
  blocked: { title: "This site blocks readers", fix: "Save the page as PDF and add the file instead.", action: "remove" },
};

/** Footer line for the upload queue: "4 added · 2 need attention", or "Uploading 3 of 5". */
export function queueSummary(items: { state: "queued" | "active" | "done" | "error" }[]): string {
  const done = items.filter((i) => i.state === "done").length;
  const bad = items.filter((i) => i.state === "error").length;
  const busy = items.filter((i) => i.state === "active" || i.state === "queued").length;
  if (!items.length) return "Nothing added yet";
  if (busy) return `Adding ${done + 1} of ${items.length - bad}${bad ? ` · ${bad} ${bad === 1 ? "needs" : "need"} attention` : ""}`;
  return [`${done} added`, bad && `${bad} ${bad === 1 ? "needs" : "need"} attention`].filter(Boolean).join(" · ");
}
