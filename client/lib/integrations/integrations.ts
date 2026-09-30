/**
 * Integrations (M8, ENG-58): connection health, Phoenix field mapping, the payload preview and the logs.
 * Plain module: no React.
 */

export type IntegrationId = "cal" | "phoenix" | "autosend";
export type Connection = "off" | "connecting" | "connected" | "reauth" | "error";

export type Health = { word: string; tone: "positive" | "caution" | "negative" | "neutral" | "live"; needsYou: boolean };
export function healthOf(c: Connection): Health {
  switch (c) {
    case "connected": return { word: "Connected", tone: "positive", needsYou: false };
    case "connecting": return { word: "Connecting", tone: "live", needsYou: false };
    case "reauth": return { word: "Needs sign-in", tone: "caution", needsYou: true };
    case "error": return { word: "Failing", tone: "negative", needsYou: true };
    case "off": return { word: "Not connected", tone: "neutral", needsYou: false };
  }
}

/** Show a secret by its last four characters only. Corral never shows a stored secret again after it’s saved. */
export function redact(secret: string): string {
  const [pre, rest] = secret.includes("_") ? [secret.slice(0, secret.indexOf("_") + 1), secret.slice(secret.indexOf("_") + 1)] : ["", secret];
  return rest.length <= 4 ? `${pre}••••` : `${pre}••••${rest.slice(-4)}`;
}

/** A webhook URL Corral will push to: https, a host, no credentials in it. Returns what’s wrong, or null. */
export function urlProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "Paste the address Phoenix gave you for Corral.";
  let u: URL;
  try { u = new URL(s); } catch { return "That isn’t a web address. It starts with https://"; }
  if (u.protocol !== "https:") return "Use https://. Corral won’t send deals over plain http.";
  if (u.username || u.password) return "Take the name and password out of the address; the signing secret does that job.";
  if (/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return "Corral can’t reach a private address. Use Phoenix’s public one.";
  return null;
}

/* ------------------------------------------------------------ Phoenix field mapping */
export type FieldType = "text" | "email" | "number" | "datetime" | "url" | "user";
/** A Phoenix field Corral can write. `required`: Phoenix rejects a deal without it. */
export type ErpField = { id: string; label: string; type: FieldType; required?: boolean };
/** A Corral field and what it holds for one lead (the preview). */
export type CorralField = { id: string; label: string; type: FieldType };
/** One row: which Corral field fills which Phoenix field. `as`: send a number as text, say. */
export type MapRow = { erp: string; from?: string; as?: FieldType };

export type MapIssue = { erp: string; kind: "unmapped" | "type" | "twice"; text: string };

const COMPATIBLE: Record<FieldType, FieldType[]> = {
  text: ["text", "email", "url", "number", "datetime", "user"], email: ["email"], number: ["number"], datetime: ["datetime"], url: ["url"], user: ["user"],
};
/** Can a Corral value of type `from` go into a Phoenix field of type `to`? Anything reads as text. */
export const fits = (from: FieldType, to: FieldType) => COMPATIBLE[to].includes(from);

/** "a number", "an email", "text", "a date and time": for sentences about field types. */
const kindWord = (t: FieldType) => (t === "text" ? "text" : t === "datetime" ? "a date and time" : t === "url" ? "a URL" : t === "user" ? "a Phoenix user" : `${t === "email" ? "an" : "a"} ${t}`);
export function mappingIssues(rows: MapRow[], erp: ErpField[], corral: CorralField[]): MapIssue[] {
  const out: MapIssue[] = [];
  const used = new Map<string, number>();
  for (const r of rows) if (r.from) used.set(r.from, (used.get(r.from) ?? 0) + 1);
  for (const f of erp) {
    const r = rows.find((x) => x.erp === f.id);
    const src = r?.from ? corral.find((c) => c.id === r.from) : undefined;
    if (!src) { if (f.required) out.push({ erp: f.id, kind: "unmapped", text: `Phoenix needs ${f.label} on every deal. Pick what fills it.` }); continue; }
    const type = r!.as ?? src.type;
    if (!fits(type, f.type)) out.push({ erp: f.id, kind: "type", text: `${f.label} takes ${kindWord(f.type)} in Phoenix, and ${src.label} is ${kindWord(src.type)}. Pick a Corral field that holds ${kindWord(f.type)}.` });
    if ((used.get(src.id) ?? 0) > 1 && f.type !== "text") out.push({ erp: f.id, kind: "twice", text: `${src.label} already fills another field. That’s allowed for text, not for ${f.type}.` });
  }
  return out;
}

/** What Phoenix receives for one lead, from the mapping: `{ "account.name": "Nyota Beverages", … }`, plus what’s missing. */
export function dealPayload(rows: MapRow[], values: Record<string, string | number | undefined>, erp: ErpField[]) {
  const body: Record<string, string | number> = {};
  const missing: string[] = [];
  for (const f of erp) {
    const r = rows.find((x) => x.erp === f.id);
    const v = r?.from ? values[r.from] : undefined;
    if (v === undefined || v === "") { if (f.required) missing.push(f.id); continue; }
    body[f.id] = r?.as === "text" ? String(v) : v;
  }
  return { body, missing };
}

/* ------------------------------------------------------------ logs */
export type LogDir = "in" | "out";
export type LogResult = "ok" | "failed" | "retrying" | "rejected" | "duplicate";
export type LogRow = { id: string; at: string; dir: LogDir; event: string; subject: string; code: string; result: LogResult; ms?: number; attempt?: string; detail?: LogDetail };
export type LogDetail = { request: string; response: string; why?: string; key?: string };
export type LogFilter = "all" | "problems" | "in" | "out";
export const isProblem = (r: LogRow) => r.result === "failed" || r.result === "retrying" || r.result === "rejected";
export function filterLogs(rows: LogRow[], f: LogFilter): LogRow[] {
  if (f === "problems") return rows.filter(isProblem);
  if (f === "in" || f === "out") return rows.filter((r) => r.dir === f);
  return rows;
}
export const RESULT_WORD: Record<LogResult, string> = { ok: "Delivered", failed: "Failed", retrying: "Retrying", rejected: "Rejected", duplicate: "Duplicate, ignored" };
