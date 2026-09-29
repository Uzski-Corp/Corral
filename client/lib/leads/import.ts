/**
 * CSV import rules for the lead table (M3, ENG-53). Pure: parse, guess the mapping, validate,
 * find duplicates. The server re-checks everything; the client only makes the problems visible early.
 */
export const MAX_CSV_BYTES = 20 * 1024 * 1024;
export const MAX_CSV_ROWS = 50_000;

/* ------------------------------------------------------------------ parse */
export type Csv = { headers: string[]; rows: string[][]; delimiter: string };

/** Pick the delimiter that splits the header line into the most columns (comma, semicolon or tab). */
export function detectDelimiter(firstLine: string): string {
  let best = ",", n = 0;
  for (const d of [",", ";", "\t"]) { const c = firstLine.split(d).length; if (c > n) { best = d; n = c; } }
  return best;
}

/** RFC 4180-ish: quoted fields, "" escapes, CRLF or LF, a leading BOM, blank lines dropped. */
export function parseCsv(text: string): Csv {
  const src = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(src.split(/\r?\n/, 1)[0] ?? "");
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  const rows = out.filter((r) => r.some((c) => c.trim() !== "")).map((r) => r.map((c) => c.trim()));
  const [headers = [], ...body] = rows;
  return { headers, rows: body, delimiter };
}

/* ------------------------------------------------------------------ files */
const NOT_CSV: Record<string, string> = {
  xlsx: "Excel files aren't read directly. In Excel, choose File → Save As → CSV UTF-8, then add that file.",
  xls: "Excel files aren't read directly. In Excel, choose File → Save As → CSV UTF-8, then add that file.",
  numbers: "In Numbers, choose File → Export To → CSV, then add that file.",
  vcf: "Contact cards aren't supported. Export your contacts as CSV instead.",
};
export type CsvFileCheck = { ok: true } | { ok: false; title: string; fix: string };
export function checkCsvFile(f: { name: string; size: number }): CsvFileCheck {
  const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  if (ext !== "csv" && ext !== "tsv" && ext !== "txt")
    return { ok: false, title: ext ? `.${ext} files can't be imported` : "This file has no extension", fix: NOT_CSV[ext] ?? "Export it as CSV (comma-separated, UTF-8), then add that file." };
  if (f.size > MAX_CSV_BYTES) return { ok: false, title: `${Math.round(f.size / 1048576)} MB is over the 20 MB limit`, fix: "Split it into smaller files, or remove columns you don't need." };
  if (f.size === 0) return { ok: false, title: "This file is empty", fix: "Check you exported the right sheet." };
  return { ok: true };
}
export function checkCsvShape(csv: Csv): CsvFileCheck {
  if (csv.headers.length < 2) return { ok: false, title: "Only one column found", fix: "Corral needs a header row and at least two columns, like Company and Email." };
  if (csv.rows.length === 0) return { ok: false, title: "No rows under the header", fix: "Check you exported the right sheet." };
  if (csv.rows.length > MAX_CSV_ROWS) return { ok: false, title: `${csv.rows.length.toLocaleString("en")} rows is over the 50,000 limit`, fix: "Split it into files of 50,000 rows or fewer." };
  return { ok: true };
}

/* ------------------------------------------------------------------ fields */
export const FIELDS = [
  { id: "company", label: "Company name", group: "Company" },
  { id: "domain", label: "Website", group: "Company" },
  { id: "country", label: "Country", group: "Company" },
  { id: "size", label: "Company size", group: "Company" },
  { id: "industry", label: "Industry", group: "Company" },
  { id: "name", label: "Full name", group: "Person" },
  { id: "first", label: "First name", group: "Person" },
  { id: "last", label: "Last name", group: "Person" },
  { id: "email", label: "Work email", group: "Person" },
  { id: "title", label: "Job title", group: "Person" },
  { id: "phone", label: "Phone", group: "Person" },
  { id: "linkedin", label: "LinkedIn URL", group: "Person" },
  { id: "notes", label: "Note", group: "Other" },
] as const;
export type FieldId = (typeof FIELDS)[number]["id"];
export type Target = FieldId | "skip";
export type Mapping = Target[];
export const fieldLabel = (t: Target) => (t === "skip" ? "Don't import" : FIELDS.find((f) => f.id === t)!.label);

const SYN: Record<FieldId, string[]> = {
  company: ["company", "company name", "organisation", "organization", "account", "account name", "business"],
  domain: ["website", "domain", "url", "web", "site", "company website", "company domain"],
  country: ["country", "location country", "hq country"],
  size: ["size", "company size", "employees", "headcount", "employee count"],
  industry: ["industry", "sector", "vertical"],
  name: ["name", "full name", "contact", "contact name", "person"],
  first: ["first", "first name", "firstname", "given name"],
  last: ["last", "last name", "lastname", "surname", "family name"],
  email: ["email", "e mail", "work email", "work e mail", "email address", "mail"],
  title: ["title", "job title", "role", "position"],
  phone: ["phone", "mobile", "telephone", "phone number", "tel"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile"],
  notes: ["notes", "note", "comments", "comment"],
};
const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_RE = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i;

/** One column's best guess, from its header first, then from what its values look like. */
export function guessField(header: string, samples: string[] = []): Target {
  const h = norm(header);
  for (const f of FIELDS) if (SYN[f.id].includes(h)) return f.id;
  const vals = samples.filter(Boolean);
  if (vals.length && vals.every((v) => EMAIL_RE.test(v))) return "email";
  if (vals.length && vals.every((v) => DOMAIN_RE.test(v))) return "domain";
  return "skip";
}
/** Guess every column; a field is only taken once (the first column wins, later ones are skipped). */
export function guessMapping(csv: Csv): Mapping {
  const taken = new Set<Target>();
  return csv.headers.map((h, i) => {
    const g = guessField(h, csv.rows.slice(0, 20).map((r) => r[i] ?? ""));
    if (g !== "skip" && taken.has(g)) return "skip";
    taken.add(g); return g;
  });
}

export type MappingIssue =
  | { kind: "missing-company" }
  | { kind: "twice"; field: FieldId; cols: number[] }
  | { kind: "name-split" };
/** Blocking problems with the mapping itself (before any row is read). */
export function mappingIssues(m: Mapping): MappingIssue[] {
  const out: MappingIssue[] = [];
  if (!m.includes("company") && !m.includes("domain")) out.push({ kind: "missing-company" });
  const seen = new Map<FieldId, number[]>();
  m.forEach((t, i) => { if (t !== "skip") seen.set(t, [...(seen.get(t) ?? []), i]); });
  for (const [field, cols] of seen) if (cols.length > 1) out.push({ kind: "twice", field, cols });
  if (m.includes("name") && (m.includes("first") || m.includes("last"))) out.push({ kind: "name-split" });
  return out;
}
export function mappingIssueText(i: MappingIssue, headers: string[]): string {
  if (i.kind === "missing-company") return "Map a column to Company name or Website. Corral needs one of them to find the company.";
  if (i.kind === "twice") return `${i.cols.map((c) => `“${headers[c]}”`).join(" and ")} both map to ${fieldLabel(i.field)}. Pick one, set the other to Don't import.`;
  return "Use Full name, or First name and Last name, not both.";
}

/* ------------------------------------------------------------------ rows */
export function normDomain(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
}
export type RowRecord = Partial<Record<FieldId, string>>;
export const recordOf = (row: string[], m: Mapping): RowRecord => {
  const r: RowRecord = {};
  m.forEach((t, i) => { if (t !== "skip" && row[i]) r[t] = row[i]; });
  if (r.domain) r.domain = normDomain(r.domain);
  if (r.email) r.email = r.email.toLowerCase();
  if (!r.name && (r.first || r.last)) r.name = [r.first, r.last].filter(Boolean).join(" ");
  return r;
};
export type RowError = { row: number; field: FieldId | "company"; value: string; message: string };
/** Row-level problems. Rows with errors are skipped on import and listed for download; the rest still import. */
export function rowErrors(csv: Csv, m: Mapping): RowError[] {
  const out: RowError[] = [];
  csv.rows.forEach((row, i) => {
    const r = recordOf(row, m), n = i + 2; // 1-based, after the header, as a spreadsheet shows it
    if (!r.company && !r.domain) out.push({ row: n, field: "company", value: "", message: "No company name or website" });
    if (r.email && !EMAIL_RE.test(r.email)) out.push({ row: n, field: "email", value: r.email, message: "Not an email address" });
    if (r.domain && !DOMAIN_RE.test(r.domain)) out.push({ row: n, field: "domain", value: r.domain, message: "Not a website" });
  });
  return out;
}

export type Existing = { id: string; company: string; domain: string; email?: string };
export type Duplicate = { row: number; kind: "in-file" | "existing"; match: string; by: "email" | "website" };
/** A row is a duplicate when its email, or failing that its website, is already in Corral or earlier in the file. */
export function findDuplicates(csv: Csv, m: Mapping, existing: Existing[]): Duplicate[] {
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e.company]));
  const byDomain = new Map(existing.map((e) => [e.domain, e.company]));
  const seenEmail = new Map<string, number>(), seenDomain = new Map<string, number>();
  const out: Duplicate[] = [];
  csv.rows.forEach((row, i) => {
    const r = recordOf(row, m), n = i + 2;
    if (r.email && byEmail.has(r.email)) out.push({ row: n, kind: "existing", match: byEmail.get(r.email)!, by: "email" });
    else if (r.email && seenEmail.has(r.email)) out.push({ row: n, kind: "in-file", match: `row ${seenEmail.get(r.email)}`, by: "email" });
    else if (!r.email && r.domain && byDomain.has(r.domain)) out.push({ row: n, kind: "existing", match: byDomain.get(r.domain)!, by: "website" });
    else if (!r.email && r.domain && seenDomain.has(r.domain)) out.push({ row: n, kind: "in-file", match: `row ${seenDomain.get(r.domain)}`, by: "website" });
    if (r.email && !seenEmail.has(r.email)) seenEmail.set(r.email, n);
    if (r.domain && !seenDomain.has(r.domain)) seenDomain.set(r.domain, n);
  });
  return out;
}

export type DupPolicy = "skip" | "fill" | "overwrite";
export const DUP_POLICY: Record<DupPolicy, { label: string; help: string }> = {
  skip: { label: "Skip them", help: "Keep what's in Corral. Nothing changes for these companies." },
  fill: { label: "Fill in blanks", help: "Add values Corral doesn't have yet. Nothing already there is changed." },
  overwrite: { label: "Overwrite", help: "Replace Corral's values with the file's. Notes and history are kept." },
};

/** What the import will do, before it runs. */
export function importPlan(csv: Csv, m: Mapping, existing: Existing[], policy: DupPolicy) {
  const errors = rowErrors(csv, m), dups = findDuplicates(csv, m, existing);
  const bad = new Set(errors.map((e) => e.row));
  const dupRows = dups.filter((d) => !bad.has(d.row));
  const inFile = dupRows.filter((d) => d.kind === "in-file").length;
  const existingDup = dupRows.length - inFile;
  const total = csv.rows.length;
  const create = total - bad.size - dupRows.length;
  const update = policy === "skip" ? 0 : existingDup;
  const skipped = inFile + (policy === "skip" ? existingDup : 0);
  return { total, create, update, skipped, errors: bad.size, inFile, existingDup };
}
