/**
 * The knowledge-base contract from PR #67 (server/app/api/v1/routes/{products,kb}.py, kb_schemas.py):
 *
 *   GET    /api/v1/products                                   -> ProductOut[]
 *   POST   /api/v1/products                   { name, description? } -> 201 ProductOut
 *   GET    /api/v1/products/{id}/knowledge/sources[?limit&offset&include_removed] -> SourceOut[]
 *   POST   …/sources/files        multipart file [+ replace_source_id] -> 202 SourceOut
 *                                 409 duplicate {existing_source_id} | kb_full · 413 too_large
 *                                 415 unsupported | type_mismatch · 422 empty · 429 rate_limited (Retry-After)
 *   POST   …/sources/urls         { url, scope: page | section } -> 202 SourceOut (409, 422 url_invalid | url_not_public, 429)
 *   GET    …/sources/{sid}                                     -> SourceOut
 *   GET    …/sources/{sid}/passages[?limit&offset]             -> PassageOut[]
 *   DELETE …/sources/{sid}                                     -> SourceOut (soft delete, `deleted_at` set)
 *   POST   …/sources/{sid}/restore                             -> SourceOut (409 duplicate | kb_full)
 *   POST   …/sources/{sid}/reread                              -> 202 SourceOut (409 removed, 429)
 *   POST   …/search                   { query, limit? }        -> SearchHit[]
 *
 * Writes need an allow-listed Origin, which the browser sends. Pages are at most 200 rows.
 */
import { err, ok, type Result } from "../result";
import { SERVER_FAILURES, SKIP_REASONS, STAGES, type ServerFailure, type SkipReason, type SourceKind, type Stage } from "../kb/upload";
import type { ApiClient } from "./client";
import { listDecoder, recordDecoder, type Reader } from "./decode";
import type { ApiError } from "./errors";

export const MAX_PAGE = 200;
const products = "/api/v1/products";
const kb = (productId: string) => `${products}/${encodeURIComponent(productId)}/knowledge`;
const source = (productId: string, sourceId: string) => `${kb(productId)}/sources/${encodeURIComponent(sourceId)}`;
export const KB_PATHS = {
  products,
  product: (productId: string) => `${products}/${encodeURIComponent(productId)}`,
  sources: (productId: string) => `${kb(productId)}/sources`,
  files: (productId: string) => `${kb(productId)}/sources/files`,
  urls: (productId: string) => `${kb(productId)}/sources/urls`,
  source,
  passages: (productId: string, sourceId: string) => `${source(productId, sourceId)}/passages`,
  restore: (productId: string, sourceId: string) => `${source(productId, sourceId)}/restore`,
  reread: (productId: string, sourceId: string) => `${source(productId, sourceId)}/reread`,
  search: (productId: string) => `${kb(productId)}/search`,
} as const;

export const SOURCE_KINDS = ["pdf", "docx", "md", "url"] as const satisfies readonly SourceKind[];
export const SOURCE_STATUSES = ["processing", "ready", "partial", "failed"] as const;
/** `skipped_reason` (PR #67 follow-up): one list, in lib/kb/upload.ts with its copy (M10c), re-exported here. */
export { SKIP_REASONS, type SkipReason };

export type Product = { id: string; name: string; description: string | null; createdAt: string; updatedAt: string };

/** SourceOut, camel-cased. Timestamps stay ISO strings; lib/kb/map.ts formats them. */
export type ApiSource = {
  id: string; productId: string; kind: SourceKind; name: string;
  url: string | null; scope: "page" | "section" | null; byteSize: number | null;
  status: (typeof SOURCE_STATUSES)[number];
  stage: Stage | null; stagePct: number; progress: number | null;
  failure: ServerFailure | null; failureStage: Stage | null;
  pagesTotal: number | null; pagesRead: number | null;
  skipped: string | null; skippedReason: SkipReason | null; note: string | null;
  passageCount: number;
  /** Worker tries of the current read: 0 while queued, 2+ after a retry. */
  attempts: number;
  addedByUserId: string | null;
  createdAt: string; updatedAt: string; processedAt: string | null; deletedAt: string | null;
};
export type Passage = { id: string; ordinal: number; loc: string | null; text: string };
export type SearchHit = { passageId: string; sourceId: string; sourceName: string; sourceKind: SourceKind; loc: string | null; text: string; score: number };

const readProduct = (r: Reader): Product => ({
  id: r.str("id"), name: r.str("name"), description: r.optStr("description"), createdAt: r.str("created_at"), updatedAt: r.str("updated_at"),
});

export const readSource = (r: Reader): ApiSource => ({
  id: r.str("id"), productId: r.str("product_id"), kind: r.oneOf("kind", SOURCE_KINDS), name: r.str("name"),
  url: r.optStr("url"), scope: r.optOneOf("scope", ["page", "section"] as const), byteSize: r.optNum("byte_size"),
  status: r.oneOf("status", SOURCE_STATUSES),
  stage: r.optOneOf("stage", STAGES), stagePct: r.num("stage_pct"), progress: r.optNum("progress"),
  failure: r.optOneOf("failure", SERVER_FAILURES), failureStage: r.optOneOf("failure_stage", STAGES),
  pagesTotal: r.optNum("pages_total"), pagesRead: r.optNum("pages_read"),
  skipped: r.optStr("skipped"), skippedReason: r.optOneOf("skipped_reason", SKIP_REASONS), note: r.optStr("note"),
  passageCount: r.num("passage_count"), attempts: r.optNum("attempts") ?? 0,
  addedByUserId: r.optStr("added_by_user_id"),
  createdAt: r.str("created_at"), updatedAt: r.str("updated_at"), processedAt: r.optStr("processed_at"), deletedAt: r.optStr("deleted_at"),
});

export const decodeProduct = recordDecoder("product", readProduct);
export const decodeProducts = listDecoder("products", readProduct);
export const decodeSource = recordDecoder("source", readSource);
export const decodeSources = listDecoder("sources", readSource);
export const decodePassages = listDecoder("passages", (r): Passage => ({ id: r.str("id"), ordinal: r.num("ordinal"), loc: r.optStr("loc"), text: r.str("text") }));
export const decodeHits = listDecoder("hits", (r): SearchHit => ({
  passageId: r.str("passage_id"), sourceId: r.str("source_id"), sourceName: r.str("source_name"), sourceKind: r.oneOf("source_kind", SOURCE_KINDS),
  loc: r.optStr("loc"), text: r.str("text"), score: r.num("score"),
}));

export type KbApi = {
  listProducts(signal?: AbortSignal): Promise<Result<Product[], ApiError>>;
  createProduct(body: { name: string; description?: string }, signal?: AbortSignal): Promise<Result<Product, ApiError>>;
  /** Every source of a product, following pages until a short one. */
  listSources(productId: string, o?: { includeRemoved?: boolean; signal?: AbortSignal }): Promise<Result<ApiSource[], ApiError>>;
  getSource(productId: string, sourceId: string, signal?: AbortSignal): Promise<Result<ApiSource, ApiError>>;
  passages(productId: string, sourceId: string, o?: { limit?: number; signal?: AbortSignal }): Promise<Result<Passage[], ApiError>>;
  uploadFile(productId: string, file: Blob & { name?: string }, o?: { replaceSourceId?: string; onProgress?: (pct: number) => void; signal?: AbortSignal }): Promise<Result<ApiSource, ApiError>>;
  addUrl(productId: string, body: { url: string; scope: "page" | "section" }, signal?: AbortSignal): Promise<Result<ApiSource, ApiError>>;
  remove(productId: string, sourceId: string, signal?: AbortSignal): Promise<Result<ApiSource, ApiError>>;
  restore(productId: string, sourceId: string, signal?: AbortSignal): Promise<Result<ApiSource, ApiError>>;
  reread(productId: string, sourceId: string, signal?: AbortSignal): Promise<Result<ApiSource, ApiError>>;
  search(productId: string, query: string, o?: { limit?: number; signal?: AbortSignal }): Promise<Result<SearchHit[], ApiError>>;
};

/** Uploads get longer than the default deadline: 25 MB on a slow uplink. */
export const UPLOAD_TIMEOUT_MS = 5 * 60_000;
/** Safety stop for listSources, far above any real knowledge base. */
const MAX_PAGES = 50;

export function createKbApi(client: ApiClient): KbApi {
  return {
    listProducts: (signal) => client.request(KB_PATHS.products, { decode: decodeProducts, query: { limit: String(MAX_PAGE) }, signal }),
    createProduct: (body, signal) => client.request(KB_PATHS.products, { method: "POST", body, decode: decodeProduct, signal }),
    async listSources(productId, o = {}) {
      const all: ApiSource[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await client.request(KB_PATHS.sources(productId), {
          decode: decodeSources, signal: o.signal,
          query: { limit: String(MAX_PAGE), offset: String(page * MAX_PAGE), include_removed: o.includeRemoved ? "true" : undefined },
        });
        if (!r.ok) return r;
        all.push(...r.value);
        if (r.value.length < MAX_PAGE) return ok(all);
      }
      return err({ kind: "invalid_response", op: `GET ${KB_PATHS.sources(productId)}`, status: 200, message: `more than ${MAX_PAGES * MAX_PAGE} sources` });
    },
    getSource: (p, s, signal) => client.request(KB_PATHS.source(p, s), { decode: decodeSource, signal }),
    passages: (p, s, o = {}) => client.request(KB_PATHS.passages(p, s), { decode: decodePassages, query: { limit: o.limit === undefined ? undefined : String(o.limit) }, signal: o.signal }),
    uploadFile(productId, file, o = {}) {
      const form = new FormData();
      form.append("file", file, file.name ?? "upload");
      if (o.replaceSourceId) form.append("replace_source_id", o.replaceSourceId);
      return client.request(KB_PATHS.files(productId), { method: "POST", form, onUploadProgress: o.onProgress, decode: decodeSource, signal: o.signal, timeoutMs: UPLOAD_TIMEOUT_MS });
    },
    addUrl: (p, body, signal) => client.request(KB_PATHS.urls(p), { method: "POST", body, decode: decodeSource, signal }),
    remove: (p, s, signal) => client.request(KB_PATHS.source(p, s), { method: "DELETE", decode: decodeSource, signal }),
    restore: (p, s, signal) => client.request(KB_PATHS.restore(p, s), { method: "POST", decode: decodeSource, signal }),
    reread: (p, s, signal) => client.request(KB_PATHS.reread(p, s), { method: "POST", decode: decodeSource, signal }),
    search: (p, query, o = {}) => client.request(KB_PATHS.search(p), { method: "POST", body: { query, ...(o.limit ? { limit: o.limit } : {}) }, decode: decodeHits, signal: o.signal }),
  };
}
