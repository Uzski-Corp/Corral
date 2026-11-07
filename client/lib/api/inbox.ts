/**
 * Unibox.
 *   GET   /api/v1/inbox[?tab=needs|handled]
 *   GET   /api/v1/inbox/summary          -> { needs_you }
 *   PATCH /api/v1/inbox/{id}             { triage?, handled?, unread?, snoozed?, status? }
 *   POST  /api/v1/inbox/{id}/send        { body }
 */
import type { ApiClient } from "./client";
import { looseList, looseObject, type Loose } from "./loose";
import type { ApiError } from "./errors";
import type { Result } from "../result";

export type DemoMailSnapshot = {
  available: boolean; can_compose: boolean; sender: string | null; recipients: string[];
  deliveries: { id: string; thread_id: string; recipient: string; subject: string; status: string; error: string | null; provider_id: string | null }[];
};
const demoSnapshot = (input: unknown): Result<DemoMailSnapshot, string> => {
  if (!input || typeof input !== "object") return { ok: false, error: "mailbox" };
  const v = input as DemoMailSnapshot;
  if (typeof v.available !== "boolean" || typeof v.can_compose !== "boolean" || !Array.isArray(v.recipients) || !v.recipients.every(x => typeof x === "string") || !Array.isArray(v.deliveries) || !v.deliveries.every(x => x && typeof x.id === "string" && typeof x.status === "string" && typeof x.recipient === "string" && typeof x.subject === "string")) return { ok: false, error: "mailbox" };
  return { ok: true, value: v };
};
export type InboxApi = {
  demo(): Promise<Result<DemoMailSnapshot, ApiError>>;
  compose(body: { request_id: string; recipient: string; subject: string; body: string }): Promise<Result<Loose, ApiError>>;
  retryDelivery(id: string): Promise<Result<Loose, ApiError>>;
  list(tab?: string, signal?: AbortSignal): Promise<Result<Loose[], ApiError>>;
  summary(signal?: AbortSignal): Promise<Result<{ needs_you: number }, ApiError>>;
  patch(id: string, body: Loose): Promise<Result<Loose, ApiError>>;
  send(id: string, body: string, requestId?: string): Promise<Result<Loose, ApiError>>;
};

const summary = (input: unknown): Result<{ needs_you: number }, string> => {
  if (!isNeeds(input)) return { ok: false, error: "summary" };
  return { ok: true, value: input };
};

function isNeeds(input: unknown): input is { needs_you: number } {
  return !!input && typeof input === "object" && typeof (input as { needs_you?: unknown }).needs_you === "number";
}

export function createInboxApi(client: ApiClient): InboxApi {
  const path = (id: string) => `/api/v1/inbox/${encodeURIComponent(id)}`;
  return {
    demo: () => client.request("/api/v1/inbox/demo", { decode: demoSnapshot }),
    compose: (body) => client.request("/api/v1/inbox/demo/compose", { method: "POST", body, decode: looseObject }),
    retryDelivery: (id) => client.request(`/api/v1/inbox/demo/deliveries/${encodeURIComponent(id)}/retry`, { method: "POST", decode: looseObject }),
    list: (tab, signal) => client.request("/api/v1/inbox", { query: { tab }, decode: looseList, signal }),
    summary: (signal) => client.request("/api/v1/inbox/summary", { decode: summary, signal }),
    patch: (id, body) => client.request(path(id), { method: "PATCH", body, decode: looseObject }),
    send: (id, body, requestId = crypto.randomUUID()) => client.request(`${path(id)}/send`, { method: "POST", body: { body, request_id: requestId }, decode: looseObject }),
  };
}
