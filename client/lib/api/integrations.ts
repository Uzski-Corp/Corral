/**
 * Integration status. Connecting stores a status; it does not call Cal, Phoenix or AutoSend.
 *   GET   /api/v1/integrations
 *   GET   /api/v1/integrations/{provider}
 *   PATCH /api/v1/integrations/{provider}
 *   PUT   /api/v1/integrations/{provider}/mapping   (Phoenix only)
 *   GET   /api/v1/integrations/{provider}/logs
 *   GET   /api/v1/workspace/members
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import type { ApiError } from "./errors";
import { isRecord } from "./decode";
import type { Loose } from "./loose";

export type LastEventRow = { event: string; at: string; result: string };
export type IntegrationRow = { provider: string; status: string; config: Loose; connectedAt?: string; lastEvent?: LastEventRow | null };
export type Member = { id: string; name: string; email: string; role: string };
export type MapRowIn = { erp: string; from?: string; as?: string };
export type IntegrationDetailRow = IntegrationRow & {
  account: { name: string; email?: string } | null;
  connectedById: string | null;
  statusAt: string | null;
  problem: { kind: string; since: string | null } | null;
  mapping: MapRowIn[] | null;
  supportsTest: boolean;
};
export type IntegrationLogRow = { id: string; at: string; dir: "in" | "out"; event: string; result: string; detail?: string };

export type IntegrationsApi = {
  list(signal?: AbortSignal): Promise<Result<IntegrationRow[], ApiError>>;
  detail(provider: string, signal?: AbortSignal): Promise<Result<IntegrationDetailRow, ApiError>>;
  update(provider: string, body: { status: string; config?: Loose }): Promise<Result<IntegrationRow, ApiError>>;
  saveMapping(provider: string, rows: MapRowIn[]): Promise<Result<IntegrationDetailRow, ApiError>>;
  logs(provider: string, signal?: AbortSignal): Promise<Result<IntegrationLogRow[], ApiError>>;
  members(signal?: AbortSignal): Promise<Result<Member[], ApiError>>;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

const lastEvent = (v: unknown): LastEventRow | null => {
  if (!isRecord(v) || !str(v.event) || !str(v.at)) return null;
  return { event: v.event as string, at: v.at as string, result: str(v.result) ?? "ok" };
};

const row = (input: unknown): Result<IntegrationRow, string> => {
  if (!isRecord(input) || typeof input.provider !== "string" || typeof input.status !== "string") return err("integration");
  return ok({
    provider: input.provider, status: input.status, config: isRecord(input.config) ? input.config : {},
    ...(str(input.connectedAt) ? { connectedAt: input.connectedAt as string } : {}),
    ...("lastEvent" in input ? { lastEvent: lastEvent(input.lastEvent) } : {}),
  });
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

const mapping = (v: unknown): MapRowIn[] | null => {
  if (!Array.isArray(v)) return null;
  return v.filter(isRecord).filter((r) => str(r.erp)).map((r) => ({ erp: r.erp as string, ...(str(r.from) ? { from: r.from as string } : {}), ...(str(r.as) ? { as: r.as as string } : {}) }));
};

const detail = (input: unknown): Result<IntegrationDetailRow, string> => {
  const base = row(input);
  if (!base.ok) return base;
  const v = input as Record<string, unknown>;
  const account = isRecord(v.account) && str(v.account.name) ? { name: v.account.name as string, ...(str(v.account.email) ? { email: v.account.email as string } : {}) } : null;
  const problem = isRecord(v.problem) && str(v.problem.kind) ? { kind: v.problem.kind as string, since: str(v.problem.since) ?? null } : null;
  return ok({
    ...base.value, account, problem, mapping: mapping(v.mapping),
    connectedById: str(v.connectedById) ?? null, statusAt: str(v.statusAt) ?? null, supportsTest: v.supportsTest === true,
  });
};

const logs = (input: unknown): Result<IntegrationLogRow[], string> => {
  if (!Array.isArray(input)) return err("integration logs");
  const out: IntegrationLogRow[] = [];
  for (const item of input) {
    if (!isRecord(item) || !str(item.id) || !str(item.at)) return err("integration log");
    out.push({
      id: item.id as string, at: item.at as string, dir: item.dir === "in" ? "in" : "out",
      event: str(item.event) ?? "note", result: str(item.result) ?? "ok", ...(str(item.detail) ? { detail: item.detail as string } : {}),
    });
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

const at = (provider: string) => `/api/v1/integrations/${encodeURIComponent(provider)}`;

export function createIntegrationsApi(client: ApiClient): IntegrationsApi {
  return {
    list: (signal) => client.request("/api/v1/integrations", { decode: rows, signal }),
    detail: (provider, signal) => client.request(at(provider), { decode: detail, signal }),
    update: (provider, body) => client.request(at(provider), { method: "PATCH", body, decode: row }),
    saveMapping: (provider, list) => client.request(`${at(provider)}/mapping`, { method: "PUT", body: { rows: list }, decode: detail }),
    logs: (provider, signal) => client.request(`${at(provider)}/logs`, { decode: logs, signal }),
    members: (signal) => client.request("/api/v1/workspace/members", { decode: members, signal }),
  };
}
