/**
 * Sequences and mailboxes. Pausing a sequence does not send mail.
 *   GET   /api/v1/sequences
 *   POST  /api/v1/sequences
 *   PATCH /api/v1/sequences/{id}
 *   GET   /api/v1/mailboxes   -> { mailboxes, sent, cap, attention }
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import type { ApiError } from "./errors";
import { isRecord } from "./decode";
import { looseList, looseObject, type Loose } from "./loose";

export type MailboxPool = { mailboxes: Loose[]; sent: number; cap: number; attention: number };

export type SequencesApi = {
  list(signal?: AbortSignal): Promise<Result<Loose[], ApiError>>;
  create(body: Loose): Promise<Result<Loose, ApiError>>;
  update(id: string, body: Loose): Promise<Result<Loose, ApiError>>;
  mailboxes(signal?: AbortSignal): Promise<Result<MailboxPool, ApiError>>;
};

const pool = (input: unknown): Result<MailboxPool, string> => {
  if (!isRecord(input) || !Array.isArray(input.mailboxes) || typeof input.sent !== "number") return err("mailboxes");
  return ok({
    mailboxes: input.mailboxes as Loose[],
    sent: input.sent,
    cap: typeof input.cap === "number" ? input.cap : 0,
    attention: typeof input.attention === "number" ? input.attention : 0,
  });
};

export function createSequencesApi(client: ApiClient): SequencesApi {
  return {
    list: (signal) => client.request("/api/v1/sequences", { decode: looseList, signal }),
    create: (body) => client.request("/api/v1/sequences", { method: "POST", body, decode: looseObject }),
    update: (id, body) => client.request(`/api/v1/sequences/${encodeURIComponent(id)}`, { method: "PATCH", body, decode: looseObject }),
    mailboxes: (signal) => client.request("/api/v1/mailboxes", { decode: pool, signal }),
  };
}
