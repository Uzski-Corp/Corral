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

export type InboxApi = {
  list(tab?: string, signal?: AbortSignal): Promise<Result<Loose[], ApiError>>;
  summary(signal?: AbortSignal): Promise<Result<{ needs_you: number }, ApiError>>;
  patch(id: string, body: Loose): Promise<Result<Loose, ApiError>>;
  send(id: string, body: string): Promise<Result<Loose, ApiError>>;
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
    list: (tab, signal) => client.request("/api/v1/inbox", { query: { tab }, decode: looseList, signal }),
    summary: (signal) => client.request("/api/v1/inbox/summary", { decode: summary, signal }),
    patch: (id, body) => client.request(path(id), { method: "PATCH", body, decode: looseObject }),
    send: (id, body) => client.request(`${path(id)}/send`, { method: "POST", body: { body }, decode: looseObject }),
  };
}
