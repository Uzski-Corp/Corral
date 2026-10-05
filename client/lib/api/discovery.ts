/**
 * Discovery runs and credits. Creating a run queues it; nothing is crawled.
 *   GET  /api/v1/discovery/runs     -> { runs, credits: { month, used, left } }
 *   GET  /api/v1/discovery/credits
 *   POST /api/v1/discovery/runs
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import type { ApiError } from "./errors";
import { isRecord } from "./decode";
import { looseObject, type Loose } from "./loose";

export type Credits = { month: number; used: number; left: number };
export type DiscoveryPage = { runs: Loose[]; credits: Credits };

export type DiscoveryApi = {
  runs(signal?: AbortSignal): Promise<Result<DiscoveryPage, ApiError>>;
  credits(signal?: AbortSignal): Promise<Result<Credits, ApiError>>;
  create(body: Loose): Promise<Result<Loose, ApiError>>;
};

const creditsOf = (input: unknown): Result<Credits, string> => {
  if (!isRecord(input) || typeof input.month !== "number" || typeof input.left !== "number") return err("credits");
  return ok({ month: input.month, used: typeof input.used === "number" ? input.used : 0, left: input.left });
};

const page = (input: unknown): Result<DiscoveryPage, string> => {
  if (!isRecord(input) || !Array.isArray(input.runs)) return err("runs");
  const credits = creditsOf(input.credits);
  if (!credits.ok) return credits;
  return ok({ runs: input.runs as Loose[], credits: credits.value });
};

export function createDiscoveryApi(client: ApiClient): DiscoveryApi {
  return {
    runs: (signal) => client.request("/api/v1/discovery/runs", { decode: page, signal }),
    credits: (signal) => client.request("/api/v1/discovery/credits", { decode: creditsOf, signal }),
    create: (body) => client.request("/api/v1/discovery/runs", { method: "POST", body, decode: looseObject }),
  };
}
