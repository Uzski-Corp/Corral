/**
 * API keys and MCP connections. Create returns the secret once.
 *   GET    /api/v1/developers/keys
 *   POST   /api/v1/developers/keys
 *   POST   /api/v1/developers/keys/{id}/revoke
 *   POST   /api/v1/developers/keys/{id}/rotate   { overlap }  -> the key and its new secret, once
 *   GET    /api/v1/developers/connections
 *   POST   /api/v1/developers/connections
 *   DELETE /api/v1/developers/connections/{id}
 *   GET    /api/v1/developers/connections/{id}/calls -> newest first: { at, tool, args, status, ms }
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import type { ApiError } from "./errors";
import { looseList, looseObject, type Loose } from "./loose";

export type DevelopersApi = {
  keys(signal?: AbortSignal): Promise<Result<Loose[], ApiError>>;
  createKey(body: Loose): Promise<Result<Loose, ApiError>>;
  revokeKey(id: string): Promise<Result<Loose, ApiError>>;
  rotateKey(id: string, overlap: boolean): Promise<Result<Loose, ApiError>>;
  connections(signal?: AbortSignal): Promise<Result<Loose[], ApiError>>;
  createConnection(body: Loose): Promise<Result<Loose, ApiError>>;
  deleteConnection(id: string): Promise<Result<void, ApiError>>;
  calls(id: string, signal?: AbortSignal): Promise<Result<Loose[], ApiError>>;
};

const none = (input: unknown): Result<void, string> => (input === undefined || input === "" ? ok(undefined) : err("expected empty"));

export function createDevelopersApi(client: ApiClient): DevelopersApi {
  return {
    keys: (signal) => client.request("/api/v1/developers/keys", { decode: looseList, signal }),
    createKey: (body) => client.request("/api/v1/developers/keys", { method: "POST", body, decode: looseObject }),
    revokeKey: (id) => client.request(`/api/v1/developers/keys/${encodeURIComponent(id)}/revoke`, { method: "POST", decode: looseObject }),
    rotateKey: (id, overlap) => client.request(`/api/v1/developers/keys/${encodeURIComponent(id)}/rotate`, { method: "POST", body: { overlap }, decode: looseObject }),
    connections: (signal) => client.request("/api/v1/developers/connections", { decode: looseList, signal }),
    createConnection: (body) => client.request("/api/v1/developers/connections", { method: "POST", body, decode: looseObject }),
    calls: (id, signal) => client.request(`/api/v1/developers/connections/${encodeURIComponent(id)}/calls`, { decode: looseList, signal }),
    deleteConnection: (id) => client.request(`/api/v1/developers/connections/${encodeURIComponent(id)}`, { method: "DELETE", decode: none }),
  };
}
