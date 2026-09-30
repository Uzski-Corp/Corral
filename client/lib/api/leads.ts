/**
 * The lead CRM contract from PR #71 (server/app/api/v1/routes/{companies,leads,segments,lead_imports}.py,
 * lead_schemas.py):
 *
 *   POST   /api/v1/companies/query          { rules, match, sort, product_id?, cursor?, limit } -> CompanyPage
 *   GET    /api/v1/companies/{id}                                    -> CompanyDetail (people, fits)
 *   PATCH  /api/v1/companies/{id}          { …, reply_status? }     -> CompanyDetail (409 unsubscribed_final)
 *   DELETE /api/v1/companies/{id}                                    -> 204
 *   POST   /api/v1/companies/{id}/merge     { duplicate_id }         -> CompanyDetail (the one kept)
 *   POST   /api/v1/companies/bulk           { action, selection, confirm, … } -> BulkOut (409 confirm_required)
 *   POST   /api/v1/companies/enroll-plan    { selection }            -> EnrollPlanOut (dry run)
 *   PATCH  /api/v1/leads/{id}               { email_status?, … }     -> LeadOut
 *   POST   /api/v1/leads/{id}/unsubscribe                            -> LeadOut (final; suppresses the address)
 *   GET    /api/v1/segments                                          -> SegmentOut[]
 *   POST   /api/v1/segments/preview         { rules, match }         -> { count, peek }
 *   POST   /api/v1/segments                 { name, rules, match, company_ids, from_import_id } -> 201 SegmentDetail
 *   GET    /api/v1/segments/{id}                                     -> SegmentDetail
 *   PATCH  /api/v1/segments/{id}            { name?, rules?, match? } -> SegmentDetail
 *   POST   /api/v1/segments/{id}/companies  CompanyQuery             -> CompanyPage (members, narrowed)
 *   POST   /api/v1/lead-imports             multipart file, mapping (JSON), policy, dry_run
 *                                           -> 202 ImportOut | 200 DryRunOut (dry_run) · 413 · 415 · 422 · 429
 *   GET    /api/v1/lead-imports/{id}                                 -> ImportOut (status, progress_pct, counts)
 *   GET    /api/v1/lead-imports/{id}/errors.csv                      -> the rows left behind
 *
 * Codes are the API's (snake_case); lib/leads/map.ts turns them into the labels the table shows.
 * Writes need an allow-listed Origin, which the browser sends.
 */
import { ok, type Result } from "../result";
import type { ApiClient } from "./client";
import { listDecoder, recordDecoder, type Reader } from "./decode";
import type { ApiError } from "./errors";

export const REPLY_CODES = ["not_contacted", "contacted", "interested", "objection", "referral", "meeting_booked", "not_interested", "ooo", "unsubscribed"] as const;
export const EMAIL_CODES = ["verified", "catch_all", "unverified", "bounced"] as const;
export const SOURCE_CODES = ["search", "import", "manual"] as const;
export const SIZE_CODES = ["1-50", "51-200", "201-1000", "1000+"] as const;
export const IMPORT_STATUSES = ["queued", "running", "done", "failed"] as const;
export const POLICIES = ["skip", "fill", "overwrite"] as const;
export type ReplyCode = (typeof REPLY_CODES)[number];
export type EmailCode = (typeof EMAIL_CODES)[number];
export type SourceCode = (typeof SOURCE_CODES)[number];
export type SizeCode = (typeof SIZE_CODES)[number];
export type Policy = (typeof POLICIES)[number];

export type ApiRuleField = "fit" | "country" | "size" | "industry" | "reply" | "email" | "title" | "source";
export type ApiOp = "gte" | "lte" | "is" | "not" | "contains";
export type ApiRule = { field: ApiRuleField; op: ApiOp; value: number | string | string[]; product_id?: string };
export type ApiMatch = "all" | "any";
export type ApiSortKey = "company" | "person" | "fit" | "email" | "reply" | "last" | "created";
export type ApiSort = { key: ApiSortKey; dir: "asc" | "desc" };
export type CompanyQuery = { rules?: ApiRule[]; match?: ApiMatch; sort?: ApiSort; productId?: string | null; cursor?: string | null; limit?: number };
/** Which companies a bulk action applies to: explicit ids, or everything matching rules. */
export type ApiSelection = { ids: string[] } | { all: true; rules: ApiRule[]; match: ApiMatch };

export type ApiPerson = {
  id: string; email: string | null; firstName: string | null; lastName: string | null; title: string | null;
  phone: string | null; linkedinUrl: string | null; emailStatus: EmailCode; isPrimary: boolean; unsubscribedAt: string | null;
  createdAt: string; updatedAt: string;
};
export type ApiCompany = {
  id: string; name: string; domain: string | null; country: string | null; size: SizeCode | null; industry: string | null; notes: string | null;
  source: SourceCode; replyStatus: ReplyCode; replyStatusSetBy: "corral" | "user"; lastActivityAt: string | null; importId: string | null;
  /** For the query's product_id; null when unscored (or no product was asked for). */ fit: number | null;
  primary: ApiPerson | null; createdAt: string; updatedAt: string;
};
export type ApiCompanyDetail = ApiCompany & { people: ApiPerson[]; fits: { productId: string; score: number }[] };
export type CompanyPage = { data: ApiCompany[]; nextCursor: string | null; hasMore: boolean; total: number };
export type Skip = { reason: string; n: number };
export type BulkResult = { matched: number; changed: number; skipped: Skip[] };
export type EnrollPlan = { matched: number; willEnroll: number; skipped: Skip[]; sendsPerDay: number; days: number };
export type ApiSegment = { id: string; name: string; match: ApiMatch; createdAt: string; updatedAt: string };
export type ApiSegmentDetail = ApiSegment & { rules: ApiRule[]; pinned: number; count: number };
export type SegmentPreview = { count: number; peek: ApiCompany[] };
export type ApiImport = {
  id: string; filename: string; byteSize: number; policy: Policy; status: (typeof IMPORT_STATUSES)[number]; progressPct: number;
  totalRows: number | null; created: number; updated: number; skipped: number; errors: number; inFileDuplicates: number; existingDuplicates: number;
  peopleCreated: number; failure: string | null; note: string | null; hasErrorsFile: boolean; finishedAt: string | null; createdAt: string;
};
export type ImportPlan = { total: number; create: number; update: number; skipped: number; errors: number; inFile: number; existing: number };
export type RowProblem = { row: number; field: string; value: string; message: string };
export type DryRun = { plan: ImportPlan; headers: string[]; errors: RowProblem[] };

const readPerson = (r: Reader): ApiPerson => ({
  id: r.str("id"), email: r.optStr("email"), firstName: r.optStr("first_name"), lastName: r.optStr("last_name"), title: r.optStr("title"),
  phone: r.optStr("phone"), linkedinUrl: r.optStr("linkedin_url"), emailStatus: r.oneOf("email_status", EMAIL_CODES), isPrimary: r.bool("is_primary"),
  unsubscribedAt: r.optStr("unsubscribed_at"), createdAt: r.str("created_at"), updatedAt: r.str("updated_at"),
});
const readCompany = (r: Reader): ApiCompany => ({
  id: r.str("id"), name: r.str("name"), domain: r.optStr("domain"), country: r.optStr("country"), size: r.optOneOf("size", SIZE_CODES),
  industry: r.optStr("industry"), notes: r.optStr("notes"), source: r.oneOf("source", SOURCE_CODES), replyStatus: r.oneOf("reply_status", REPLY_CODES),
  replyStatusSetBy: r.oneOf("reply_status_set_by", ["corral", "user"] as const), lastActivityAt: r.optStr("last_activity_at"), importId: r.optStr("import_id"),
  fit: r.optNum("fit"), primary: r.optObj("primary") ? readPerson(r.obj("primary")) : null, createdAt: r.str("created_at"), updatedAt: r.str("updated_at"),
});
const readRule = (r: Reader): ApiRule => {
  const value = r.raw("value");
  const ok = typeof value === "number" || typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"));
  if (!ok) r.str("value");   // throws the mismatch with its path
  const productId = r.optStr("product_id");
  return {
    field: r.oneOf("field", ["fit", "country", "size", "industry", "reply", "email", "title", "source"] as const),
    op: r.oneOf("op", ["gte", "lte", "is", "not", "contains"] as const), value: value as ApiRule["value"], ...(productId ? { product_id: productId } : {}),
  };
};
const readSkip = (r: Reader): Skip => ({ reason: r.str("reason"), n: r.num("n") });
const readSegment = (r: Reader): ApiSegment => ({ id: r.str("id"), name: r.str("name"), match: r.oneOf("match", ["all", "any"] as const), createdAt: r.str("created_at"), updatedAt: r.str("updated_at") });
const readImport = (r: Reader): ApiImport => ({
  id: r.str("id"), filename: r.str("filename"), byteSize: r.num("byte_size"), policy: r.oneOf("policy", POLICIES), status: r.oneOf("status", IMPORT_STATUSES),
  progressPct: r.num("progress_pct"), totalRows: r.optNum("total_rows"), created: r.num("created_count"), updated: r.num("updated_count"), skipped: r.num("skipped_count"),
  errors: r.num("error_count"), inFileDuplicates: r.num("in_file_duplicates"), existingDuplicates: r.num("existing_duplicates"), peopleCreated: r.num("people_created"),
  failure: r.optStr("failure"), note: r.optStr("note"), hasErrorsFile: r.bool("has_errors_file"), finishedAt: r.optStr("finished_at"), createdAt: r.str("created_at"),
});

export const decodeCompany = recordDecoder("company", (r): ApiCompanyDetail => ({
  ...readCompany(r), people: r.list("people", readPerson), fits: r.list("fits", (f) => ({ productId: f.str("product_id"), score: f.num("score") })),
}));
export const decodePage = recordDecoder("companies", (r): CompanyPage => ({
  data: r.list("data", readCompany), nextCursor: r.optStr("next_cursor"), hasMore: r.bool("has_more"), total: r.num("total"),
}));
export const decodeBulk = recordDecoder("bulk", (r): BulkResult => ({ matched: r.num("matched"), changed: r.num("changed"), skipped: r.list("skipped", readSkip) }));
export const decodeEnrollPlan = recordDecoder("enroll_plan", (r): EnrollPlan => ({
  matched: r.num("matched"), willEnroll: r.num("will_enroll"), skipped: r.list("skipped", readSkip), sendsPerDay: r.num("sends_per_day"), days: r.num("days"),
}));
export const decodePerson = recordDecoder("lead", readPerson);
export const decodeSegments = listDecoder("segments", readSegment);
export const decodeSegment = recordDecoder("segment", (r): ApiSegmentDetail => ({ ...readSegment(r), rules: r.list("rules", readRule), pinned: r.num("pinned"), count: r.num("count") }));
export const decodePreview = recordDecoder("preview", (r): SegmentPreview => ({ count: r.num("count"), peek: r.list("peek", readCompany) }));
export const decodeImport = recordDecoder("lead_import", readImport);
export const decodeImports = listDecoder("lead_imports", readImport);
export const decodeDryRun = recordDecoder("dry_run", (r): DryRun => {
  const p = r.obj("plan");
  return {
    plan: { total: p.num("total"), create: p.num("create"), update: p.num("update"), skipped: p.num("skipped"), errors: p.num("errors"), inFile: p.num("in_file"), existing: p.num("existing") },
    headers: r.strList("headers"),
    errors: r.list("errors", (e): RowProblem => ({ row: e.num("row"), field: e.str("field"), value: e.str("value"), message: e.str("message") })),
  };
});
const none = (input: unknown): Result<void, string> => { void input; return ok(undefined); };

const companies = "/api/v1/companies";
const segments = "/api/v1/segments";
const imports = "/api/v1/lead-imports";
const id = (s: string) => encodeURIComponent(s);
export const LEADS_PATHS = {
  query: `${companies}/query`,
  company: (c: string) => `${companies}/${id(c)}`,
  merge: (c: string) => `${companies}/${id(c)}/merge`,
  bulk: `${companies}/bulk`,
  enrollPlan: `${companies}/enroll-plan`,
  lead: (l: string) => `/api/v1/leads/${id(l)}`,
  unsubscribe: (l: string) => `/api/v1/leads/${id(l)}/unsubscribe`,
  segments,
  preview: `${segments}/preview`,
  segment: (s: string) => `${segments}/${id(s)}`,
  members: (s: string) => `${segments}/${id(s)}/companies`,
  imports,
  import: (i: string) => `${imports}/${id(i)}`,
  errorsCsv: (i: string) => `${imports}/${id(i)}/errors.csv`,
} as const;
/** The API's page cap is 200 (leads_query_max_limit); the table asks for 50 at a time. */
export const PAGE_SIZE = 50;
export const MAX_SEGMENTS = 200;
/** Imports upload up to 20 MB: give them the same long deadline as knowledge-base files. */
export const IMPORT_TIMEOUT_MS = 5 * 60_000;

const queryBody = (q: CompanyQuery) => ({
  rules: q.rules ?? [], match: q.match ?? "all", sort: q.sort ?? { key: "created", dir: "desc" }, limit: q.limit ?? PAGE_SIZE,
  ...(q.productId ? { product_id: q.productId } : {}), ...(q.cursor ? { cursor: q.cursor } : {}),
});

export type BulkAction =
  | { action: "set_reply_status"; reply_status: ReplyCode }
  | { action: "add_to_segment" | "remove_from_segment"; segment_id: string }
  | { action: "delete" };
export type CompanyPatch = Partial<{ name: string; domain: string | null; country: string | null; size: SizeCode | null; industry: string | null; notes: string | null; reply_status: ReplyCode }>;
export type ImportFileInput = { file: Blob; name: string; mapping: string[]; policy: Policy };

export type LeadsApi = {
  query(q: CompanyQuery, signal?: AbortSignal): Promise<Result<CompanyPage, ApiError>>;
  company(companyId: string, signal?: AbortSignal): Promise<Result<ApiCompanyDetail, ApiError>>;
  updateCompany(companyId: string, patch: CompanyPatch): Promise<Result<ApiCompanyDetail, ApiError>>;
  deleteCompany(companyId: string): Promise<Result<void, ApiError>>;
  /** Keep `keepId`, fill its blanks from `duplicateId`, move the duplicate's people over, delete it. */
  merge(keepId: string, duplicateId: string): Promise<Result<ApiCompanyDetail, ApiError>>;
  bulk(action: BulkAction, selection: ApiSelection, o?: { confirm?: boolean }): Promise<Result<BulkResult, ApiError>>;
  enrollPlan(selection: ApiSelection, signal?: AbortSignal): Promise<Result<EnrollPlan, ApiError>>;
  updatePerson(leadId: string, patch: { email_status?: EmailCode }): Promise<Result<ApiPerson, ApiError>>;
  unsubscribe(leadId: string): Promise<Result<ApiPerson, ApiError>>;
  segments(signal?: AbortSignal): Promise<Result<ApiSegment[], ApiError>>;
  segment(segmentId: string, signal?: AbortSignal): Promise<Result<ApiSegmentDetail, ApiError>>;
  preview(rules: ApiRule[], match: ApiMatch, signal?: AbortSignal): Promise<Result<SegmentPreview, ApiError>>;
  createSegment(body: { name: string; rules: ApiRule[]; match: ApiMatch; company_ids?: string[]; from_import_id?: string }): Promise<Result<ApiSegmentDetail, ApiError>>;
  updateSegment(segmentId: string, body: { name?: string; rules?: ApiRule[]; match?: ApiMatch }): Promise<Result<ApiSegmentDetail, ApiError>>;
  members(segmentId: string, q: CompanyQuery, signal?: AbortSignal): Promise<Result<CompanyPage, ApiError>>;
  dryRun(input: ImportFileInput, signal?: AbortSignal): Promise<Result<DryRun, ApiError>>;
  startImport(input: ImportFileInput, o?: { onProgress?: (pct: number) => void; signal?: AbortSignal }): Promise<Result<ApiImport, ApiError>>;
  getImport(importId: string, signal?: AbortSignal): Promise<Result<ApiImport, ApiError>>;
  /** Where the browser downloads an import's left-behind rows (the session cookie goes with it). */
  errorsUrl(importId: string): string;
};

const importForm = (i: ImportFileInput, dryRun: boolean) => {
  const form = new FormData();
  form.append("file", i.file, i.name);
  form.append("mapping", JSON.stringify(i.mapping));
  form.append("policy", i.policy);
  if (dryRun) form.append("dry_run", "true");
  return form;
};

export function createLeadsApi(client: ApiClient): LeadsApi {
  return {
    query: (q, signal) => client.request(LEADS_PATHS.query, { method: "POST", body: queryBody(q), decode: decodePage, signal }),
    company: (c, signal) => client.request(LEADS_PATHS.company(c), { decode: decodeCompany, signal }),
    updateCompany: (c, patch) => client.request(LEADS_PATHS.company(c), { method: "PATCH", body: patch, decode: decodeCompany }),
    deleteCompany: (c) => client.request(LEADS_PATHS.company(c), { method: "DELETE", decode: none }),
    merge: (keep, dup) => client.request(LEADS_PATHS.merge(keep), { method: "POST", body: { duplicate_id: dup }, decode: decodeCompany }),
    bulk: (action, selection, o = {}) => client.request(LEADS_PATHS.bulk, { method: "POST", body: { ...action, selection, confirm: !!o.confirm }, decode: decodeBulk }),
    enrollPlan: (selection, signal) => client.request(LEADS_PATHS.enrollPlan, { method: "POST", body: { selection }, decode: decodeEnrollPlan, signal }),
    updatePerson: (l, patch) => client.request(LEADS_PATHS.lead(l), { method: "PATCH", body: patch, decode: decodePerson }),
    unsubscribe: (l) => client.request(LEADS_PATHS.unsubscribe(l), { method: "POST", decode: decodePerson }),
    segments: (signal) => client.request(LEADS_PATHS.segments, { decode: decodeSegments, query: { limit: String(MAX_SEGMENTS) }, signal }),
    segment: (s, signal) => client.request(LEADS_PATHS.segment(s), { decode: decodeSegment, signal }),
    preview: (rules, match, signal) => client.request(LEADS_PATHS.preview, { method: "POST", body: { rules, match }, decode: decodePreview, signal }),
    createSegment: (body) => client.request(LEADS_PATHS.segments, { method: "POST", body: { company_ids: [], ...body }, decode: decodeSegment }),
    updateSegment: (s, body) => client.request(LEADS_PATHS.segment(s), { method: "PATCH", body, decode: decodeSegment }),
    members: (s, q, signal) => client.request(LEADS_PATHS.members(s), { method: "POST", body: queryBody(q), decode: decodePage, signal }),
    dryRun: (i, signal) => client.request(LEADS_PATHS.imports, { method: "POST", form: importForm(i, true), decode: decodeDryRun, signal, timeoutMs: IMPORT_TIMEOUT_MS }),
    startImport: (i, o = {}) => client.request(LEADS_PATHS.imports, { method: "POST", form: importForm(i, false), onUploadProgress: o.onProgress, decode: decodeImport, signal: o.signal, timeoutMs: IMPORT_TIMEOUT_MS }),
    getImport: (i, signal) => client.request(LEADS_PATHS.import(i), { decode: decodeImport, signal }),
    errorsUrl: (i) => client.url(LEADS_PATHS.errorsCsv(i)),
  };
}
