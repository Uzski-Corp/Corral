/**
 * Integration status. Connecting stores a status; it does not call Cal, Phoenix or AutoSend.
 *   GET   /api/v1/integrations
 *   PATCH /api/v1/integrations/{provider}
 *   GET   /api/v1/workspace/members
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import type { ApiError } from "./errors";
import { isRecord } from "./decode";
import type { Loose } from "./loose";

export type IntegrationRow = { provider: string; status: string; config: Loose };
export type Member = { id: string; name: string; email: string; role: string };

export type IntegrationsApi = {
  list(signal?: AbortSignal): Promise<Result<IntegrationRow[], ApiError>>;
  update(provider: string, body: { status: string; config?: Loose }): Promise<Result<IntegrationRow, ApiError>>;
  members(signal?: AbortSignal): Promise<Result<Member[], ApiError>>;
};

const row = (input: unknown): Result<IntegrationRow, string> => {
  if (!isRecord(input) || typeof input.provider !== "string" || typeof input.status !== "string") return err("integration");
  return ok({ provider: input.provider, status: input.status, config: isRecord(input.config) ? input.config : {} });
};

const rows = (input: unknown): Result<IntegrationRow[], string> => {
  if (!Array.isArray(input)) return err("integrations");
  const out: IntegrationRow[] = [];
  for (const item of input) {
    const parsed = row(item);
    if (!parsed.ok) return parsed;
    out.push(parsed.value);
  }
  return ok(out);
};

const members = (input: unknown): Result<Member[], string> => {
  if (!Array.isArray(input)) return err("members");
  const out: Member[] = [];
  for (const item of input) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.email !== "string") return err("member");
    out.push({ id: String(item.id ?? ""), name: item.name, email: item.email, role: String(item.role ?? "member") });
  }
  return ok(out);
};

export function createIntegrationsApi(client: ApiClient): IntegrationsApi {
  return {
    list: (signal) => client.request("/api/v1/integrations", { decode: rows, signal }),
    update: (provider, body) => client.request(`/api/v1/integrations/${encodeURIComponent(provider)}`, { method: "PATCH", body, decode: row }),
    members: (signal) => client.request("/api/v1/workspace/members", { decode: members, signal }),
  };
}
