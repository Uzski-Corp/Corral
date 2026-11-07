import type { ApiClient } from "./client";
import type { ApiError } from "./errors";
import type { Result } from "../result";
import { isRecord } from "./decode";
export type ReplyRun = { id: string; status: string; error: string | null; stale: boolean; result: { body: string; source_ids: string[]; tokens?: number } | null; sources: { id: string; name: string; text: string }[] };
export type ReplyOptions = { available: boolean; products: { id: string; name: string }[] };
const run = (v: unknown): Result<ReplyRun, string> => {
  if (!isRecord(v) || typeof v.id !== "string" || typeof v.status !== "string" || typeof v.stale !== "boolean" || !Array.isArray(v.sources) || !v.sources.every(x => isRecord(x) && typeof x.id === "string" && typeof x.name === "string" && typeof x.text === "string") || (v.result !== null && (!isRecord(v.result) || typeof v.result.body !== "string" || !Array.isArray(v.result.source_ids)))) return { ok: false, error: "reply run" };
  return { ok: true, value: v as ReplyRun };
};
const options = (v: unknown): Result<ReplyOptions, string> => {
  if (!isRecord(v) || typeof v.available !== "boolean" || !Array.isArray(v.products) || !v.products.every(x => isRecord(x) && typeof x.id === "string" && typeof x.name === "string")) return { ok: false, error: "reply options" };
  return { ok: true, value: v as ReplyOptions };
};
export type ReplyApi = {
  options(): Promise<Result<ReplyOptions, ApiError>>;
  start(body: { thread_id: string; product_id: string; request_id: string }): Promise<Result<ReplyRun, ApiError>>;
  get(id: string): Promise<Result<ReplyRun, ApiError>>;
  cancel(id: string): Promise<Result<ReplyRun, ApiError>>;
};
export function createReplyApi(client: ApiClient): ReplyApi {
  return {
    options: () => client.request("/api/v1/ai/options", { decode: options }),
    start: body => client.request("/api/v1/ai/runs", { method: "POST", body, decode: run }),
    get: id => client.request(`/api/v1/ai/runs/${encodeURIComponent(id)}`, { decode: run }),
    cancel: id => client.request(`/api/v1/ai/runs/${encodeURIComponent(id)}/cancel`, { method: "POST", decode: run }),
  };
}
